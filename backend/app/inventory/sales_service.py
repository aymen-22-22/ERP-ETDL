"""Recording a sale, including exploding kits and configurable products into
their components.

A kit ("Triangle Fix 4600 DA") and a CONFIGURABLE product ("Triangle Double
28/19 F2-F3-F4") hold no stock. Selling one must deduct its recipe from the
selling warehouse instead — 1 Tube 28, 1 Tube 19, 1 pair of supports (2
pieces), 1 motif, 2 bouchons — and never touch a "Triangle" count, because
there isn't one. For a configurable product the till's configuration is
re-resolved against the catalog here: the browser's price and component list
are never trusted, only its choices.

The whole sale is one transaction. Previously the till posted one movement per
cart line from the browser, which meant a round trip each and no atomicity: a
failure on line three left lines one and two already deducted, with stock that
no longer matched anything sold.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.day_sales import MovementRow, aggregate_day
from app.inventory.models import MovementType, ProductStockSnapshot
from app.inventory.repository import InventoryRepository
from app.inventory.schemas import (
    MovementCreate,
    SaleDayRow,
    SaleDetail,
    SaleLineRead,
    SaleListItem,
    SaleRequest,
)
from app.products.models import Product, ProductType
from app.shared.core.exceptions import AppError, ConflictError, NotFoundError
from app.shared.core.ids import generate_uuid7
from app.shared.core.pagination import PageParams, PaginationMeta
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.warehouses.service import require_active_warehouse


async def record_sale(
    session: AsyncSession, tenant_id: UUID, data: SaleRequest
) -> dict[str, object]:
    # Imported here, not at module scope: app.products.bom_service reads
    # app.inventory.models, so a top-level import closes the loop
    # inventory -> products -> inventory and fails at startup.
    from app.products.bom_service import list_bom_lines
    from app.products.configurable_schemas import ConfigurableResolveRequest
    from app.products.configurable_service import resolve_configuration

    warehouse = await require_active_warehouse(session, tenant_id, data.warehouse_id)
    # The flag has existed on warehouses since the module was written and was
    # never checked anywhere; a depot could happily be sold from.
    if not warehouse.allow_sales:
        raise AppError(
            f"{warehouse.name} does not allow sales", error_code="warehouse_sales_disabled"
        )

    result = await session.execute(
        select(Product).where(
            Product.id.in_([line.product_id for line in data.lines]),
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
        )
    )
    products = {product.id: product for product in result.scalars().all()}
    for line in data.lines:
        if line.product_id not in products:
            raise NotFoundError(f"Product not found: {line.product_id}")

    # Expand every sold line into the things actually coming off the shelf.
    # `sold_as` is carried through so the ledger and any receipt can say which
    # cart line caused a deduction; `config` is the snapshot of a
    # CONFIGURABLE line as sold, persisted on the movements it creates, plus
    # the unit price the cashier charged (it can differ from the catalog price
    # when they discount a line for a client).
    # Configurable components are recorded by id here and resolved to full
    # products in one batched query after the loop.
    deductions: list[tuple[Product, int, str, dict[str, object] | None]] = []
    pending_configurable: list[tuple[UUID, int, str, dict[str, object] | None]] = []
    for line in data.lines:
        product = products[line.product_id]
        line_config: dict[str, object] | None = (
            {"unit_price_cents": line.unit_price_cents, "quantity": line.quantity}
            if line.unit_price_cents is not None
            else {"quantity": line.quantity}
        )

        if product.product_type == ProductType.KIT:
            bom = await list_bom_lines(session, tenant_id, product.id)
            if not bom:
                # Selling it would deduct nothing at all and silently overstate
                # what the shop has.
                raise AppError(
                    f"{product.name} has no recipe, so it cannot be sold yet",
                    error_code="kit_without_recipe",
                )
            for bom_line, component in bom:
                deductions.append(
                    (
                        component,
                        bom_line.pieces_required * line.quantity,
                        product.name,
                        line_config,
                    )
                )
            continue

        if product.product_type == ProductType.CONFIGURABLE:
            if not line.configuration:
                raise AppError(
                    f"{product.name} must be configured before it can be sold",
                    error_code="configurable_missing_configuration",
                )
            resolution = await resolve_configuration(
                session,
                tenant_id,
                product.id,
                ConfigurableResolveRequest(
                    configuration={key: str(value) for key, value in line.configuration.items()}
                ),
            )
            config_snapshot: dict[str, object] = {
                "product_id": str(product.id),
                "configuration": dict(resolution.configuration),
                "display_name": resolution.display_name,
                "quantity": line.quantity,
                "components": [
                    {
                        "product_id": str(entry.component_product_id),
                        "name": entry.name,
                        "pieces_required": entry.pieces_required,
                    }
                    for entry in resolution.lines
                ],
            }
            if line.unit_price_cents is not None:
                config_snapshot["unit_price_cents"] = line.unit_price_cents
            for entry in resolution.lines:
                pending_configurable.append(
                    (
                        entry.component_product_id,
                        entry.pieces_required * line.quantity,
                        resolution.display_name,
                        config_snapshot,
                    )
                )
            continue

        deductions.append((product, line.quantity, product.name, line_config))

    if pending_configurable:
        component_ids = {entry[0] for entry in pending_configurable}
        missing = [cid for cid in component_ids if cid not in products]
        if missing:
            found = await session.execute(
                select(Product).where(Product.id.in_(missing), Product.tenant_id == tenant_id)
            )
            products.update({product.id: product for product in found.scalars().all()})
            still_missing = [cid for cid in missing if cid not in products]
            if still_missing:
                raise NotFoundError(f"Component product not found: {still_missing[0]}")
        for component_id, quantity, sold_as, config in pending_configurable:
            component = products[component_id]
            deductions.append((component, quantity, sold_as, config))

    # Check the whole basket before writing any of it. Two cart lines can share
    # a component — a Triangle 4600 and a Triangle 3900 both take bouchons — so
    # requirements are summed per product first; checking them independently
    # would let a basket pass that the shelf cannot actually fill.
    required: dict[UUID, int] = {}
    for product, quantity, _, _ in deductions:
        required[product.id] = required.get(product.id, 0) + quantity

    if not warehouse.allow_negative_stock:
        snapshots = await session.execute(
            select(ProductStockSnapshot).where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == data.warehouse_id,
                ProductStockSnapshot.product_id.in_(list(required)),
            )
        )
        available = {
            snapshot.product_id: snapshot.available_quantity
            for snapshot in snapshots.scalars().all()
        }
        names = {product.id: product.name for product, _, _, _ in deductions}
        shortages = [
            f"{names[product_id]} (need {quantity}, have {available.get(product_id, 0)})"
            for product_id, quantity in required.items()
            if available.get(product_id, 0) < quantity
        ]
        if shortages:
            raise ConflictError(
                "Not enough stock: " + "; ".join(sorted(shortages)),
                error_code="insufficient_stock",
            )

    reference_id = generate_uuid7()
    repo = InventoryRepository(session)

    for product, quantity, sold_as, config in deductions:
        movement = MovementCreate(
            id=generate_uuid7(),
            product_id=product.id,
            warehouse_id=data.warehouse_id,
            movement_type=MovementType.SALE,
            quantity_delta=-quantity,
            reference_id=reference_id,
            note=sold_as if sold_as != product.name else None,
            config=config,
        )
        await repo.apply_mutation(
            tenant_id,
            MutationEnvelope(
                client_mutation_id=generate_uuid7(),
                entity_type="inventory_movement",
                entity_id=movement.id or generate_uuid7(),
                operation=ChangeOperation.CREATE,
                base_version=None,
                payload=movement.model_dump(mode="json"),
                client_timestamp=datetime.now(UTC),
            ),
        )

    await session.commit()

    return {
        "reference_id": str(reference_id),
        "movements_created": len(deductions),
        "deductions": [
            {
                "product_id": str(product.id),
                "name": product.name,
                "quantity": quantity,
                "sold_as": sold_as,
            }
            for product, quantity, sold_as, _ in deductions
        ],
    }


async def list_sales(
    session: AsyncSession,
    tenant_id: UUID,
    params: PageParams,
    warehouse_id: UUID | None = None,
) -> tuple[list[SaleListItem], PaginationMeta]:
    """The completed-sales log, newest first.

    Sales are read back from the movement ledger — every sale already writes
    one `InventoryMovement` per deducted product under a shared `reference_id`,
    so the log is derived data, not a second record that could drift.
    """
    repo = InventoryRepository(session)
    rows, total = await repo.list_sale_references(tenant_id, params, warehouse_id)
    items = [
        SaleListItem(
            reference_id=reference_id,
            sold_at=sold_at,
            warehouse_id=warehouse_id,
            line_count=line_count,
            total_quantity=total_quantity,
        )
        for reference_id, sold_at, warehouse_id, line_count, total_quantity in rows
    ]
    return items, PaginationMeta.create(total=total, params=params)


async def get_sale(session: AsyncSession, tenant_id: UUID, reference_id: UUID) -> SaleDetail:
    """One sale's deductions — which products came off the shelf, and how much."""
    repo = InventoryRepository(session)
    movements = await repo.get_sale_movements(tenant_id, reference_id)
    if not movements:
        raise NotFoundError("Sale not found")

    product_ids = {m.product_id for m in movements}
    result = await session.execute(
        select(Product.id, Product.name, Product.sku).where(Product.id.in_(product_ids))
    )
    products = {row.id: (row.name, row.sku) for row in result}
    # All movements of one sale share the same transaction timestamp.
    sold_at = movements[0].created_at

    lines = [
        SaleLineRead(
            product_id=movement.product_id,
            name=products.get(movement.product_id, ("Unknown product", ""))[0],
            sku=products.get(movement.product_id, ("", ""))[1],
            quantity=abs(movement.quantity_delta),
            sold_as=movement.note,
            unit_price_cents=(
                movement.config.get("unit_price_cents")
                if movement.config and movement.config.get("unit_price_cents") is not None
                else None
            ),
        )
        for movement in movements
    ]
    return SaleDetail(
        reference_id=reference_id,
        sold_at=sold_at,
        warehouse_id=movements[0].warehouse_id,
        line_count=len(lines),
        total_quantity=sum(line.quantity for line in lines),
        lines=lines,
    )


async def list_day_sales(
    session: AsyncSession,
    tenant_id: UUID,
    date_from: datetime,
    date_to: datetime,
    warehouse_id: UUID | None = None,
) -> list[SaleDayRow]:
    """All products sold within `[date_from, date_to)`, aggregated per cart
    line: components of kits and CONFIGURABLE products are folded back into
    their parent, so the day's take reads like the till showed it.

    The caller supplies an explicit half-open range so the "day" boundary is
    decided by the browser (which knows the store's timezone), not guessed
    here.
    """
    repo = InventoryRepository(session)
    movements = await repo.list_sale_movements_in_range(tenant_id, date_from, date_to, warehouse_id)
    if not movements:
        return []

    product_ids = {m.product_id for m in movements}
    result = await session.execute(
        select(Product.id, Product.name).where(Product.id.in_(product_ids))
    )
    names = {row.id: row.name for row in result}
    rows = [
        MovementRow(
            reference_id=movement.reference_id,
            product_id=movement.product_id,
            product_name=names.get(movement.product_id, "Unknown product"),
            quantity_delta=movement.quantity_delta,
            note=movement.note,
            config=movement.config,
        )
        for movement in movements
    ]
    return aggregate_day(rows)
