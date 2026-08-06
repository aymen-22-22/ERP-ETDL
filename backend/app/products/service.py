import re
import unicodedata
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.products.models import (
    Brand,
    Category,
    Product,
    ProductBomLine,
    ProductStatus,
    ProductType,
    Unit,
)
from app.products.repository import ProductRepository
from app.products.schemas import OpeningStock, ProductCreate, ProductQuery, ProductUpdate
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
        "product_type": product.product_type.value if product.product_type else "simple",
        "attributes": product.attributes or {},
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
    # Part of the key: the same page/filters with and without variants are two
    # different result sets, and omitting this would serve one for the other.
    parts.append("v1" if query.include_variants else "v0")
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
    if not payload.get("sku"):
        payload["sku"] = await generate_sku(session, tenant_id, data.name, data.category_id)
    mutation = _envelope(
        entity_type="product",
        entity_id=product_id,
        operation=ChangeOperation.CREATE,
        base_version=None,
        payload=payload,
    )
    product, _ = await repo.apply_mutation(tenant_id, mutation)

    await _record_opening_stock(session, tenant_id, product.id, data)

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


async def list_variant_groups(session: AsyncSession, tenant_id: UUID) -> list[dict[str, object]]:
    """One row per category that holds generated variants, with its count.

    Computed in the database rather than by grouping a page of results
    client-side: the list is paginated, so a family could straddle two pages
    and be counted twice or reported short.
    """
    result = await session.execute(
        select(
            Product.category_id,
            Category.name,
            func.count(Product.id),
            func.min(Product.price),
            func.max(Product.price),
        )
        .join(Category, Category.id == Product.category_id)
        .where(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.product_type == ProductType.VARIANT,
        )
        .group_by(Product.category_id, Category.name)
        .order_by(Category.name)
    )
    return [
        {
            "category_id": str(category_id),
            "category_name": category_name,
            "variant_count": count,
            "min_price": str(min_price),
            "max_price": str(max_price),
        }
        for category_id, category_name, count, min_price, max_price in result.all()
    ]


def _sku_prefix_from(name: str) -> str:
    """Initials of a name, for a SKU prefix. "Porte Chaussure" -> "PC"."""
    words = re.findall(r"[A-Za-zÀ-ÿ]+", name)
    initials = "".join(word[0] for word in words).upper()
    # Strip accents so the SKU stays ASCII — "Décoration" -> "D", not "DÉ".
    ascii_initials = unicodedata.normalize("NFKD", initials).encode("ascii", "ignore").decode()
    return (ascii_initials or "PRD")[:4]


async def generate_sku(
    session: AsyncSession, tenant_id: UUID, name: str, category_id: UUID | None
) -> str:
    """Next free `PREFIX-001` for this tenant.

    The prefix comes from the category ("Porte Chaussure" -> PC-001,
    "Triangle Fix" -> TF-001) and falls back to the product's own name, then to
    PRD. Generated variants don't come through here — they get their SKU from
    their category's scheme instead (TUB-28-2M-TOR-ARG).
    """
    source = name
    if category_id is not None:
        category = await session.get(Category, category_id)
        if category is not None and category.tenant_id == tenant_id:
            source = category.name

    prefix = _sku_prefix_from(source)

    # Highest number already used under this prefix, so a deleted product's
    # number is not handed out again — reusing a SKU would make historic
    # movements ambiguous.
    result = await session.execute(
        select(Product.sku).where(Product.tenant_id == tenant_id, Product.sku.like(f"{prefix}-%"))
    )
    highest = 0
    for sku in result.scalars().all():
        suffix = sku.rsplit("-", 1)[-1]
        if suffix.isdigit():
            highest = max(highest, int(suffix))

    return f"{prefix}-{highest + 1:03d}"


async def _record_opening_stock(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, data: ProductCreate
) -> None:
    """Count a new product into each warehouse it starts life in.

    Writes one adjustment movement per warehouse with stock, so the opening
    count appears in the ledger like any other movement rather than materialising
    out of nowhere. The alert threshold is written even when the quantity is
    zero — "warn me below 3" is meaningful for something not yet delivered.
    """
    from app.inventory.models import MovementType
    from app.inventory.repository import InventoryRepository
    from app.inventory.schemas import MovementCreate
    from app.warehouses.service import require_active_warehouse

    entries = list(data.opening_stock)
    if not entries and data.initial_stock and data.default_warehouse_id:
        entries = [
            OpeningStock(warehouse_id=data.default_warehouse_id, quantity=data.initial_stock)
        ]

    inventory_repo = InventoryRepository(session)
    for entry in entries:
        await require_active_warehouse(session, tenant_id, entry.warehouse_id)

        if entry.quantity > 0:
            payload = MovementCreate(
                id=generate_uuid7(),
                product_id=product_id,
                warehouse_id=entry.warehouse_id,
                movement_type=MovementType.ADJUSTMENT,
                quantity_delta=entry.quantity,
                note="Initial stock",
            )
            # The repository directly, not `record_movement`, because that
            # commits per call: counting into two warehouses would then be two
            # commits before the product's own, and a failure on the second
            # would leave the first stranded. One transaction covers the lot.
            await inventory_repo.apply_mutation(
                tenant_id,
                MutationEnvelope(
                    client_mutation_id=generate_uuid7(),
                    entity_type="inventory_movement",
                    entity_id=payload.id or generate_uuid7(),
                    operation=ChangeOperation.CREATE,
                    base_version=None,
                    payload=payload.model_dump(mode="json"),
                    client_timestamp=datetime.now(UTC),
                ),
            )
        if entry.min_quantity is not None:
            await inventory_repo.set_min_quantity(
                tenant_id, product_id, entry.warehouse_id, entry.min_quantity
            )

    if entries:
        # The product starts life with stock somewhere; make it visible (at 0)
        # in every other active warehouse, not just the ones it was counted
        # into. Otherwise a warehouse shows no row at all until its first
        # movement, which reads as "no such product here" instead of "0 here".
        await inventory_repo.ensure_snapshots_for_all_warehouses(tenant_id, product_id)


async def _components_in_use(
    session: AsyncSession, tenant_id: UUID, product_ids: list[UUID]
) -> dict[str, list[str]]:
    """Map of component name -> the kits whose recipe depends on it.

    Deleting a component out from under a recipe leaves the kit unbuildable
    and would make the sale explosion deduct something that no longer exists,
    so callers refuse the delete rather than discovering it at the till.
    """
    if not product_ids:
        return {}

    component = aliased(Product)
    kit = aliased(Product)
    result = await session.execute(
        select(component.name, kit.name)
        .select_from(ProductBomLine)
        .join(component, component.id == ProductBomLine.component_product_id)
        .join(kit, kit.id == ProductBomLine.kit_product_id)
        .where(
            ProductBomLine.tenant_id == tenant_id,
            ProductBomLine.component_product_id.in_(product_ids),
            ProductBomLine.deleted_at.is_(None),
            kit.deleted_at.is_(None),
        )
    )
    blocked: dict[str, list[str]] = {}
    for component_name, kit_name in result.all():
        blocked.setdefault(component_name, []).append(kit_name)
    return blocked


async def bulk_delete_products(
    session: AsyncSession, tenant_id: UUID, product_ids: list[UUID]
) -> int:
    """Soft-delete many products in one transaction.

    Deliberately all-or-nothing: a destructive action that silently half-runs
    is worse than one that refuses and says why. If any selected product is a
    component of a kit's recipe, nothing is deleted and the caller is told
    which products and which kits — untick those and retry.
    """
    blocked = await _components_in_use(session, tenant_id, product_ids)
    if blocked:
        detail = "; ".join(
            f"{name} (used by {', '.join(sorted(set(kits)))})" for name, kits in blocked.items()
        )
        raise AppError(
            f"These products are components of a kit recipe: {detail}",
            error_code="product_in_use_by_kit",
        )

    repo = ProductRepository(session)
    deleted = 0
    for product_id in product_ids:
        current = await get_product(session, tenant_id, product_id)
        mutation = _envelope(
            entity_type="product",
            entity_id=product_id,
            operation=ChangeOperation.DELETE,
            base_version=current.version,
            payload={},
        )
        await repo.apply_mutation(tenant_id, mutation)
        deleted += 1

    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")
    return deleted


async def _unique_sku(session: AsyncSession, tenant_id: UUID, base_sku: str) -> str:
    """`SKU-COPY`, then `SKU-COPY2`, ... until one is free."""
    existing = await session.execute(
        select(Product.sku).where(
            Product.tenant_id == tenant_id, Product.sku.like(f"{base_sku}-COPY%")
        )
    )
    taken = set(existing.scalars().all())
    candidate = f"{base_sku}-COPY"
    suffix = 2
    while candidate in taken:
        candidate = f"{base_sku}-COPY{suffix}"
        suffix += 1
    return candidate[:100]


async def duplicate_product(session: AsyncSession, tenant_id: UUID, product_id: UUID) -> Product:
    """Copy a product, and its recipe when it is a kit.

    Copying the recipe is the point: two colours of the same triangle are two
    kit products (a BOM line names a specific variant), so duplicating and
    swapping two lines is how the second colour gets built.

    Not copied: stock, which would invent inventory that isn't on the shelf,
    and the barcode, which is unique per tenant and would collide.
    """
    source = await get_product(session, tenant_id, product_id)

    new_id = generate_uuid7()
    payload: dict[str, object] = {
        "id": str(new_id),
        "name": f"{source.name} (copy)"[:255],
        "sku": await _unique_sku(session, tenant_id, source.sku),
        "barcode": None,
        "description": source.description,
        "price": str(source.price),
        "cost_price": str(source.cost_price) if source.cost_price is not None else None,
        "status": source.status.value if source.status else ProductStatus.ACTIVE.value,
        "product_type": source.product_type.value if source.product_type else "simple",
        "attributes": dict(source.attributes or {}),
        "category_id": str(source.category_id) if source.category_id else None,
        "brand_id": str(source.brand_id) if source.brand_id else None,
        "unit_id": str(source.unit_id) if source.unit_id else None,
        "default_warehouse_id": (
            str(source.default_warehouse_id) if source.default_warehouse_id else None
        ),
    }
    repo = ProductRepository(session)
    copy, _ = await repo.apply_mutation(
        tenant_id,
        _envelope(
            entity_type="product",
            entity_id=new_id,
            operation=ChangeOperation.CREATE,
            base_version=None,
            payload=payload,
        ),
    )

    source_lines = await session.execute(
        select(ProductBomLine).where(
            ProductBomLine.tenant_id == tenant_id,
            ProductBomLine.kit_product_id == product_id,
            ProductBomLine.deleted_at.is_(None),
        )
    )
    for line in source_lines.scalars().all():
        session.add(
            ProductBomLine(
                tenant_id=tenant_id,
                kit_product_id=copy.id,
                component_product_id=line.component_product_id,
                quantity=line.quantity,
                unit=line.unit,
            )
        )

    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")
    return copy


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
