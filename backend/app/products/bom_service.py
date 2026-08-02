"""Bill-of-materials for KIT products: recipe, costing, and buildable stock.

A kit is sold as one line but holds no stock. Two questions follow from that
and both are answered here:

  * what does it cost to build, against what it sells for (the margin);
  * how many can actually be built from what is on the shelf right now.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import ProductStockSnapshot
from app.products.models import BomUnit, Product, ProductBomLine, ProductType
from app.shared.core.exceptions import AppError, NotFoundError


async def _require_kit(session: AsyncSession, tenant_id: UUID, kit_product_id: UUID) -> Product:
    result = await session.execute(
        select(Product).where(
            Product.id == kit_product_id,
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
        )
    )
    kit = result.scalar_one_or_none()
    if kit is None:
        raise NotFoundError("Product not found")
    if kit.product_type != ProductType.KIT:
        raise AppError("Only kit products have a bill of materials", error_code="product_not_a_kit")
    return kit


async def list_bom_lines(
    session: AsyncSession, tenant_id: UUID, kit_product_id: UUID
) -> list[tuple[ProductBomLine, Product]]:
    """Recipe lines paired with their component product, in name order."""
    result = await session.execute(
        select(ProductBomLine, Product)
        .join(Product, Product.id == ProductBomLine.component_product_id)
        .where(
            ProductBomLine.tenant_id == tenant_id,
            ProductBomLine.kit_product_id == kit_product_id,
            ProductBomLine.deleted_at.is_(None),
        )
        .order_by(Product.name)
    )
    return [(line, product) for line, product in result.all()]


async def replace_bom(
    session: AsyncSession,
    tenant_id: UUID,
    kit_product_id: UUID,
    lines: list[tuple[UUID, int, BomUnit]],
) -> list[tuple[ProductBomLine, Product]]:
    """Set the kit's recipe to exactly these lines.

    Replace rather than incremental add/remove: a recipe is edited as a whole
    on one screen, and diffing it client-side would be a way to get it wrong.
    """
    kit = await _require_kit(session, tenant_id, kit_product_id)

    component_ids = [component_id for component_id, _, _ in lines]
    if len(set(component_ids)) != len(component_ids):
        raise AppError(
            "The same component is listed twice; change its quantity instead",
            error_code="bom_duplicate_component",
        )
    if kit.id in component_ids:
        raise AppError("A kit cannot contain itself", error_code="bom_self_reference")

    if component_ids:
        found = await session.execute(
            select(Product).where(
                Product.id.in_(component_ids),
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
            )
        )
        components = {product.id: product for product in found.scalars().all()}
        missing = [cid for cid in component_ids if cid not in components]
        if missing:
            raise NotFoundError(f"Component product not found: {missing[0]}")

        # Nested kits would need recursive explosion at sale time and open the
        # door to cycles. Not needed for these recipes, so it is refused
        # outright rather than half-supported.
        nested = [cid for cid in component_ids if components[cid].product_type == ProductType.KIT]
        if nested:
            raise AppError("A kit cannot contain another kit", error_code="bom_nested_kit")

    existing = await session.execute(
        select(ProductBomLine).where(
            ProductBomLine.tenant_id == tenant_id,
            ProductBomLine.kit_product_id == kit_product_id,
        )
    )
    for line in existing.scalars().all():
        await session.delete(line)
    await session.flush()

    for component_id, quantity, unit in lines:
        session.add(
            ProductBomLine(
                tenant_id=tenant_id,
                kit_product_id=kit_product_id,
                component_product_id=component_id,
                quantity=quantity,
                unit=unit,
            )
        )

    await session.commit()
    return await list_bom_lines(session, tenant_id, kit_product_id)


async def cost_breakdown(
    session: AsyncSession, tenant_id: UUID, kit_product_id: UUID
) -> dict[str, object]:
    """Component cost roll-up against the kit's selling price.

    Components with no cost price are reported by name instead of being
    treated as free — a margin that silently ignores half the recipe is worse
    than no margin at all.
    """
    kit = await _require_kit(session, tenant_id, kit_product_id)
    lines = await list_bom_lines(session, tenant_id, kit_product_id)

    total = Decimal("0")
    missing_cost: list[str] = []
    components: list[dict[str, object]] = []

    for line, product in lines:
        pieces = line.pieces_required
        if product.cost_price is None:
            missing_cost.append(product.name)
            line_cost: Decimal | None = None
        else:
            line_cost = product.cost_price * pieces
            total += line_cost
        components.append(
            {
                "component_product_id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "quantity": line.quantity,
                "unit": line.unit.value,
                "pieces_required": pieces,
                "unit_cost": str(product.cost_price) if product.cost_price is not None else None,
                "line_cost": str(line_cost) if line_cost is not None else None,
            }
        )

    selling_price = kit.price
    margin = selling_price - total
    margin_pct = float(margin / selling_price * 100) if selling_price else 0.0

    return {
        "kit_product_id": str(kit.id),
        "selling_price": str(selling_price),
        "components_cost": str(total),
        "margin": str(margin),
        "margin_pct": round(margin_pct, 2),
        "cost_is_complete": not missing_cost,
        "components_missing_cost": missing_cost,
        "components": components,
    }


async def buildable_quantity(
    session: AsyncSession, tenant_id: UUID, kit_product_id: UUID, warehouse_id: UUID
) -> dict[str, object]:
    """How many of this kit the given warehouse can currently build.

    The answer is the most constrained component: whichever runs out first
    caps the whole kit. Reported alongside the limiting component so the
    shortage is actionable rather than just a number.
    """
    await _require_kit(session, tenant_id, kit_product_id)
    lines = await list_bom_lines(session, tenant_id, kit_product_id)

    # A kit with no recipe can't be built; returning "unlimited" here would let
    # an unconfigured kit sell forever and deduct nothing.
    if not lines:
        return {
            "buildable": 0,
            "limiting_component": None,
            "reason": "This kit has no components defined",
            "components": [],
        }

    component_ids = [product.id for _, product in lines]
    snapshots = await session.execute(
        select(ProductStockSnapshot).where(
            ProductStockSnapshot.tenant_id == tenant_id,
            ProductStockSnapshot.warehouse_id == warehouse_id,
            ProductStockSnapshot.product_id.in_(component_ids),
        )
    )
    available = {
        snapshot.product_id: snapshot.available_quantity for snapshot in snapshots.scalars().all()
    }

    buildable = None
    limiting: str | None = None
    components: list[dict[str, object]] = []

    for line, product in lines:
        pieces = line.pieces_required
        on_hand = available.get(product.id, 0)
        possible = on_hand // pieces if pieces > 0 else 0
        components.append(
            {
                "component_product_id": str(product.id),
                "name": product.name,
                "pieces_required": pieces,
                "available": on_hand,
                "builds": possible,
            }
        )
        if buildable is None or possible < buildable:
            buildable = possible
            limiting = product.name

    return {
        "buildable": buildable or 0,
        "limiting_component": limiting,
        "reason": None,
        "components": components,
    }
