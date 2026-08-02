"""Recording a sale, including exploding kits into their components.

A kit ("Triangle Fix 4600 DA") holds no stock. Selling one must deduct its
recipe from the selling warehouse instead — 1 Tube 28, 1 Tube 19, 1 pair of
supports (2 pieces), 1 motif, 2 bouchons — and never touch a "Triangle" count,
because there isn't one.

The whole sale is one transaction. Previously the till posted one movement per
cart line from the browser, which meant a round trip each and no atomicity: a
failure on line three left lines one and two already deducted, with stock that
no longer matched anything sold.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import MovementType, ProductStockSnapshot
from app.inventory.repository import InventoryRepository
from app.inventory.schemas import MovementCreate, SaleRequest
from app.products.models import Product, ProductType
from app.shared.core.exceptions import AppError, ConflictError, NotFoundError
from app.shared.core.ids import generate_uuid7
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
    # cart line caused a deduction.
    deductions: list[tuple[Product, int, str]] = []
    for line in data.lines:
        product = products[line.product_id]

        if product.product_type != ProductType.KIT:
            deductions.append((product, line.quantity, product.name))
            continue

        bom = await list_bom_lines(session, tenant_id, product.id)
        if not bom:
            # Selling it would deduct nothing at all and silently overstate
            # what the shop has.
            raise AppError(
                f"{product.name} has no recipe, so it cannot be sold yet",
                error_code="kit_without_recipe",
            )
        for bom_line, component in bom:
            deductions.append((component, bom_line.pieces_required * line.quantity, product.name))

    # Check the whole basket before writing any of it. Two cart lines can share
    # a component — a Triangle 4600 and a Triangle 3900 both take bouchons — so
    # requirements are summed per product first; checking them independently
    # would let a basket pass that the shelf cannot actually fill.
    required: dict[UUID, int] = {}
    for product, quantity, _ in deductions:
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
        names = {product.id: product.name for product, _, _ in deductions}
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

    for product, quantity, sold_as in deductions:
        movement = MovementCreate(
            id=generate_uuid7(),
            product_id=product.id,
            warehouse_id=data.warehouse_id,
            movement_type=MovementType.SALE,
            quantity_delta=-quantity,
            reference_id=reference_id,
            note=sold_as if sold_as != product.name else None,
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
            for product, quantity, sold_as in deductions
        ],
    }
