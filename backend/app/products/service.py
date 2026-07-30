from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import Brand, Category, Product, Unit
from app.products.repository import ProductRepository
from app.products.schemas import ProductCreate, ProductQuery, ProductUpdate
from app.shared.core.cache import get_tenant_cache
from app.shared.core.exceptions import AppError, NotFoundError
from app.shared.core.ids import generate_uuid7
from app.shared.core.pagination import PageParams, PaginationMeta
from app.shared.database.session import Base
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.warehouses.models import Warehouse


async def _require_ref(
    session: AsyncSession, model: type[Base], tenant_id: UUID, ref_id: UUID | None, label: str
) -> None:
    """Clean 400 when a product points at a category/brand/unit that doesn't
    exist for this tenant, instead of letting the FK raise a raw 500. (Sync
    pushes bypass this and rely on the DB FK, reported as a conflict.)"""
    if ref_id is None:
        return
    obj = await session.scalar(
        select(model).where(model.id == ref_id, model.tenant_id == tenant_id)  # type: ignore[attr-defined]
    )
    if obj is None:
        raise AppError(f"Unknown {label}", error_code="invalid_reference")


async def _validate_refs(
    session: AsyncSession,
    tenant_id: UUID,
    *,
    category_id: UUID | None,
    brand_id: UUID | None,
    unit_id: UUID | None,
    default_warehouse_id: UUID | None,
) -> None:
    await _require_ref(session, Category, tenant_id, category_id, "category")
    await _require_ref(session, Brand, tenant_id, brand_id, "brand")
    await _require_ref(session, Unit, tenant_id, unit_id, "unit")
    await _require_ref(session, Warehouse, tenant_id, default_warehouse_id, "warehouse")


def _envelope(
    *,
    entity_type: str,
    entity_id: UUID,
    operation: ChangeOperation,
    base_version: int | None,
    payload: dict[str, object],
) -> MutationEnvelope:
    return MutationEnvelope(
        client_mutation_id=generate_uuid7(),
        entity_type=entity_type,
        entity_id=entity_id,
        operation=operation,
        base_version=base_version,
        payload=payload,
        client_timestamp=datetime.now(UTC),
    )


def _product_to_dict(product: Product) -> dict[str, object]:
    return {
        "id": str(product.id),
        "tenant_id": str(product.tenant_id),
        "name": product.name,
        "sku": product.sku,
        "barcode": product.barcode,
        "description": product.description,
        "price": str(product.price),
        "cost_price": str(product.cost_price) if product.cost_price is not None else None,
        "status": product.status.value if product.status else "active",
        "category_id": str(product.category_id) if product.category_id else None,
        "brand_id": str(product.brand_id) if product.brand_id else None,
        "unit_id": str(product.unit_id) if product.unit_id else None,
        "default_warehouse_id": (
            str(product.default_warehouse_id) if product.default_warehouse_id else None
        ),
        "version": product.version,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def _list_cache_key(params: PageParams, query: ProductQuery) -> str:
    parts = [str(params.page), str(params.page_size)]
    parts.append(query.search or "")
    parts.append(str(query.category_id) if query.category_id else "")
    parts.append(str(query.brand_id) if query.brand_id else "")
    parts.append(query.status.value if query.status else "")
    parts.append(query.sort.value)
    return ":".join(parts)


async def create_product(session: AsyncSession, tenant_id: UUID, data: ProductCreate) -> Product:
    await _validate_refs(
        session,
        tenant_id,
        category_id=data.category_id,
        brand_id=data.brand_id,
        unit_id=data.unit_id,
        default_warehouse_id=data.default_warehouse_id,
    )
    repo = ProductRepository(session)
    product_id = data.id or generate_uuid7()
    payload = data.model_dump(mode="json")
    payload["id"] = str(product_id)
    mutation = _envelope(
        entity_type="product",
        entity_id=product_id,
        operation=ChangeOperation.CREATE,
        base_version=None,
        payload=payload,
    )
    product, _ = await repo.apply_mutation(tenant_id, mutation)

    if data.initial_stock and data.initial_stock > 0 and data.default_warehouse_id:
        from app.inventory.models import MovementType
        from app.inventory.schemas import MovementCreate
        from app.inventory.service import record_movement

        await record_movement(
            session,
            tenant_id,
            MovementCreate(
                id=generate_uuid7(),
                product_id=product.id,
                warehouse_id=data.default_warehouse_id,
                movement_type=MovementType.ADJUSTMENT,
                quantity_delta=data.initial_stock,
                note="Initial stock",
            ),
        )

    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")
    return product


async def get_product(session: AsyncSession, tenant_id: UUID, product_id: UUID) -> Product:
    cache = get_tenant_cache()
    cached = await cache.get(tenant_id, "products", "get", str(product_id))
    if cached is not None:
        return Product(**cached)

    repo = ProductRepository(session)
    product = await repo.get(tenant_id, product_id)
    if product is None:
        raise NotFoundError("Product not found")

    await cache.set(tenant_id, "products", "get", str(product_id), value=_product_to_dict(product))
    return product


async def list_products(
    session: AsyncSession, tenant_id: UUID, params: PageParams, query: ProductQuery
) -> tuple[list[Product], PaginationMeta]:
    cache = get_tenant_cache()
    key = _list_cache_key(params, query)
    cached = await cache.get(tenant_id, "products", "list", key)
    if cached is not None:
        items = [Product(**d) for d in cached["items"]]
        meta = PaginationMeta(**cached["meta"])
        return items, meta

    repo = ProductRepository(session)
    items, total = await repo.list_by_tenant(tenant_id, params, query)
    meta = PaginationMeta.create(total=total, params=params)

    await cache.set(
        tenant_id,
        "products",
        "list",
        key,
        value={
            "items": [_product_to_dict(p) for p in items],
            "meta": meta.model_dump(),
        },
    )
    return items, meta


async def update_product(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, data: ProductUpdate
) -> Product:
    await _validate_refs(
        session,
        tenant_id,
        category_id=data.category_id,
        brand_id=data.brand_id,
        unit_id=data.unit_id,
        default_warehouse_id=data.default_warehouse_id,
    )
    repo = ProductRepository(session)
    current = await get_product(session, tenant_id, product_id)
    mutation = _envelope(
        entity_type="product",
        entity_id=product_id,
        operation=ChangeOperation.UPDATE,
        base_version=current.version,
        payload=data.model_dump(mode="json", exclude_unset=True),
    )
    product, _ = await repo.apply_mutation(tenant_id, mutation)
    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")
    return product


async def delete_product(session: AsyncSession, tenant_id: UUID, product_id: UUID) -> None:
    repo = ProductRepository(session)
    current = await get_product(session, tenant_id, product_id)
    mutation = _envelope(
        entity_type="product",
        entity_id=product_id,
        operation=ChangeOperation.DELETE,
        base_version=current.version,
        payload={},
    )
    await repo.apply_mutation(tenant_id, mutation)  # changelog ignored for delete
    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")
