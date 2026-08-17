from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import InventoryMovement, ProductStockSnapshot
from app.inventory.repository import InventoryRepository
from app.inventory.schemas import MovementCreate
from app.products.image_service import primary_image_map
from app.products.models import Product
from app.shared.core.exceptions import NotFoundError
from app.shared.core.ids import generate_uuid7
from app.shared.core.pagination import PageParams, PaginationMeta
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.warehouses.models import Warehouse
from app.warehouses.service import require_active_warehouse


async def record_movement(
    session: AsyncSession, tenant_id: UUID, data: MovementCreate
) -> InventoryMovement:
    await require_active_warehouse(session, tenant_id, data.warehouse_id)

    repo = InventoryRepository(session)
    movement_id = data.id or generate_uuid7()
    payload = data.model_dump(mode="json")
    payload["id"] = str(movement_id)
    mutation = MutationEnvelope(
        client_mutation_id=generate_uuid7(),
        entity_type="inventory_movement",
        entity_id=movement_id,
        operation=ChangeOperation.CREATE,
        base_version=None,
        payload=payload,
        client_timestamp=datetime.now(UTC),
    )
    movement, _ = await repo.apply_mutation(tenant_id, mutation)
    await session.commit()
    return movement


async def get_stock_snapshot(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, warehouse_id: UUID
) -> ProductStockSnapshot:
    repo = InventoryRepository(session)
    snapshot = await repo.get_snapshot(tenant_id, product_id, warehouse_id)
    if snapshot is None:
        raise NotFoundError("No stock recorded for this product at this warehouse")
    return snapshot


async def list_stock_by_warehouse(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> list[ProductStockSnapshot]:
    repo = InventoryRepository(session)
    return await repo.list_snapshots_for_product(tenant_id, product_id)


async def list_movements_for_product(
    session: AsyncSession,
    tenant_id: UUID,
    product_id: UUID,
    params: PageParams,
    warehouse_id: UUID | None = None,
) -> tuple[list[InventoryMovement], PaginationMeta]:
    repo = InventoryRepository(session)
    items, total = await repo.list_for_product(tenant_id, product_id, params, warehouse_id)
    return items, PaginationMeta.create(total=total, params=params)


async def list_warehouse_stock(
    session: AsyncSession, tenant_id: UUID, warehouse_id: UUID
) -> list[dict[str, object]]:
    await require_active_warehouse(session, tenant_id, warehouse_id)
    repo = InventoryRepository(session)
    snapshots = await repo.list_snapshots_for_warehouse(tenant_id, warehouse_id)

    if not snapshots:
        return []

    product_ids = [s.product_id for s in snapshots]
    from sqlalchemy import select as sa_select

    result = await session.execute(
        sa_select(
            Product.id,
            Product.name,
            Product.sku,
            Product.category_id,
            Product.price,
            Product.product_type,
            Product.attributes,
        ).where(Product.id.in_(product_ids), Product.tenant_id == tenant_id)
    )
    # price is shipped in the same row so the till can render and charge the
    # catalog price without a second lookup that depends on a product-list page
    # the stocked item may not fall inside. image_url is the product's primary
    # photo, resolved the same way as the products list (mount-relative URL).
    product_map = {
        row.id: (row.name, row.sku, row.category_id, row.price, row.product_type, row.attributes)
        for row in result
    }
    image_map = await primary_image_map(session, tenant_id, product_ids)

    # Look the product up once per snapshot. The previous form repeated
    # `.get()` with a different default each time — including a 1-tuple that
    # was then indexed at [2], an IndexError for any snapshot whose product
    # the query didn't return (a soft-deleted product, for instance).
    _default: tuple[str, str, UUID | None, Decimal, str, dict[str, str]] = (
        "Unknown product",
        "",
        None,
        Decimal("0"),
        "simple",
        {},
    )

    def _row(
        snapshot_product_id: UUID,
    ) -> tuple[str, str, UUID | None, Decimal, str, dict[str, str]]:
        return product_map.get(snapshot_product_id, _default)

    return [
        {
            "product_id": str(s.product_id),
            "product_name": _row(s.product_id)[0],
            "sku": _row(s.product_id)[1],
            "category_id": str(_row(s.product_id)[2]) if _row(s.product_id)[2] else None,
            "price": str(_row(s.product_id)[3]),
            "product_type": _row(s.product_id)[4],
            "attributes": _row(s.product_id)[5] or {},
            "image_url": image_map.get(s.product_id),
            "quantity_on_hand": s.quantity_on_hand,
            "available_quantity": s.available_quantity,
            "reserved_quantity": s.reserved_quantity,
            "min_quantity": s.min_quantity,
            "max_quantity": s.max_quantity,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in snapshots
    ]


async def get_warehouse_summary(
    session: AsyncSession, tenant_id: UUID, warehouse_id: UUID
) -> dict[str, int]:
    await require_active_warehouse(session, tenant_id, warehouse_id)
    repo = InventoryRepository(session)
    total_products = await repo.count_products_with_stock(tenant_id, warehouse_id)
    total_quantity = await repo.sum_quantity_for_warehouse(tenant_id, warehouse_id)
    low_stock_count = await repo.count_low_stock(tenant_id, warehouse_id)
    return {
        "total_products": total_products,
        "total_quantity": total_quantity,
        "low_stock_count": low_stock_count,
    }


async def list_warehouse_summaries(
    session: AsyncSession, tenant_id: UUID
) -> list[dict[str, object]]:
    """Summary for every warehouse in one call, one row per warehouse.

    Deliberately skips the per-warehouse `require_active_warehouse` check:
    the list page renders inactive warehouses too, and an inactive row still
    needs its numbers (it just cannot move stock). Warehouses with no stock
    snapshots come back as zeros rather than being dropped.
    """
    repo = InventoryRepository(session)
    summaries = await repo.summarize_warehouses(tenant_id)

    result = await session.execute(
        select(Warehouse.id)
        .where(Warehouse.tenant_id == tenant_id, Warehouse.deleted_at.is_(None))
        .order_by(Warehouse.name)
    )
    return [
        {
            "warehouse_id": str(warehouse_id),
            **summaries.get(
                warehouse_id,
                {"total_products": 0, "total_quantity": 0, "low_stock_count": 0},
            ),
        }
        for (warehouse_id,) in result
    ]
