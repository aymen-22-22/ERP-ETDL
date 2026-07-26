from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.cache import get_tenant_cache
from app.shared.core.exceptions import ConflictError, NotFoundError
from app.shared.core.pagination import PageParams, PaginationMeta
from app.shared.database.mixins import TenantScopedAuditMixin

# Generic CRUD for tenant-scoped reference entities (categories, brands,
# units, tags). They all share TenantScopedAuditMixin (id/tenant_id/name/
# deleted_at + audit), so one implementation serves all four — the routers are
# thin, entity-specific glue over these. RLS also scopes every query by tenant;
# the explicit tenant_id checks here are belt-and-suspenders.


def _entity_name(model: type[TenantScopedAuditMixin]) -> str:
    return model.__tablename__  # type: ignore[attr-defined,no-any-return]


def _ref_to_dict(obj: TenantScopedAuditMixin) -> dict[str, object]:
    table = obj.__table__  # type: ignore[attr-defined]
    result: dict[str, object] = {}
    for c in table.columns:
        val = getattr(obj, c.key)
        result[c.key] = str(val) if isinstance(val, UUID) else val
    return result


async def get_ref[M: TenantScopedAuditMixin](
    session: AsyncSession, model: type[M], tenant_id: UUID, ref_id: UUID
) -> M:
    cache = get_tenant_cache()
    entity = _entity_name(model)
    cached = await cache.get(tenant_id, entity, "get", str(ref_id))
    if cached is not None:
        return model(**cached)

    obj = await session.get(model, ref_id)
    if obj is None or obj.tenant_id != tenant_id or obj.deleted_at is not None:
        raise NotFoundError("Not found")

    await cache.set(tenant_id, entity, "get", str(ref_id), value=_ref_to_dict(obj))
    return obj


async def list_ref[M: TenantScopedAuditMixin](
    session: AsyncSession, model: type[M], tenant_id: UUID, params: PageParams, search: str | None
) -> tuple[list[M], PaginationMeta]:
    # Explicit tenant filter — RLS is defense-in-depth, not the only line of
    # isolation, since it silently doesn't apply to the table owner (which is
    # the role this app connects as) unless FORCE ROW LEVEL SECURITY is set.
    stmt = select(model).where(model.tenant_id == tenant_id, model.deleted_at.is_(None))
    if search:
        # every reference model has a `name` column (not declared on the mixin)
        stmt = stmt.where(model.name.ilike(f"%{search.strip()}%"))  # type: ignore[attr-defined]

    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(model.name)  # type: ignore[attr-defined]
    result = await session.execute(stmt.offset(params.offset).limit(params.page_size))
    return list(result.scalars().all()), PaginationMeta.create(total=total or 0, params=params)


async def create_ref[M: TenantScopedAuditMixin](
    session: AsyncSession, model: type[M], tenant_id: UUID, data: BaseModel
) -> M:
    obj = model()
    obj.tenant_id = tenant_id
    for field, value in data.model_dump().items():
        setattr(obj, field, value)
    session.add(obj)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(
            "A record with that name or code already exists", error_code="duplicate"
        ) from exc
    # No session.refresh() here: the INSERT already RETURNINGs the server-side
    # created_at/updated_at, and the session is configured expire_on_commit=False,
    # so every attribute is populated. A post-commit refresh would issue a fresh
    # SELECT on a connection that may have been returned to the pool (losing the
    # `app.tenant_id` setting RLS needs) — which surfaced as a 500 on a row that
    # had in fact been created.
    await get_tenant_cache().invalidate_pattern(tenant_id, _entity_name(model))
    return obj


async def update_ref[M: TenantScopedAuditMixin](
    session: AsyncSession, model: type[M], tenant_id: UUID, ref_id: UUID, data: BaseModel
) -> M:
    obj = await get_ref(session, model, tenant_id, ref_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    try:
        # Flush + refresh *before* committing: the `onupdate=func.now()` column
        # is server-generated, so it has to be read back or attribute access
        # later triggers a lazy load. Doing it inside the transaction keeps the
        # read on the same connection, where `app.tenant_id` is still set for
        # RLS — a post-commit refresh can land on a pooled connection without it.
        await session.flush()
        await session.refresh(obj)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(
            "A record with that name or code already exists", error_code="duplicate"
        ) from exc
    await get_tenant_cache().invalidate_pattern(tenant_id, _entity_name(model))
    return obj


async def delete_ref[M: TenantScopedAuditMixin](
    session: AsyncSession, model: type[M], tenant_id: UUID, ref_id: UUID
) -> None:
    obj = await get_ref(session, model, tenant_id, ref_id)
    obj.deleted_at = datetime.now(UTC)
    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, _entity_name(model))


async def list_category_tree(
    session: AsyncSession, tenant_id: UUID
) -> list[dict[str, object]]:
    """Return all categories as a nested tree structure."""
    from app.products.models import Category

    cache = get_tenant_cache()
    cached = await cache.get(tenant_id, "categories", "tree")
    if cached is not None:
        return list(cached)

    stmt = (
        select(Category)
        .where(Category.tenant_id == tenant_id, Category.deleted_at.is_(None))
        .order_by(Category.sort_order, Category.name)
    )
    result = await session.execute(stmt)
    all_categories = list(result.scalars().all())

    def _to_dict(cat: Category) -> dict[str, object]:
        return {
            "id": str(cat.id),
            "tenant_id": str(cat.tenant_id),
            "parent_id": str(cat.parent_id) if cat.parent_id else None,
            "name": cat.name,
            "description": cat.description,
            "sort_order": cat.sort_order,
            "created_at": cat.created_at.isoformat() if cat.created_at else None,
            "updated_at": cat.updated_at.isoformat() if cat.updated_at else None,
            "children": [],
        }

    node_map: dict[str, dict[str, object]] = {}
    for cat in all_categories:
        node_map[str(cat.id)] = _to_dict(cat)

    roots: list[dict[str, object]] = []
    for cat in all_categories:
        node = node_map[str(cat.id)]
        if cat.parent_id and str(cat.parent_id) in node_map:
            node_map[str(cat.parent_id)]["children"].append(node)  # type: ignore[attr-defined]
        else:
            roots.append(node)

    await cache.set(tenant_id, "categories", "tree", value=roots)
    return roots
