"""Seed one tenant's real production catalogue from scratch.

Removes every product for the tenant — the category tree is kept exactly as
``seed_store_catalog.py`` left it — then rebuilds the triangle business:

    * component parts: Tube 28mm / Tube 19mm (Torsadi + Liss), Motif and
      Motif Cristal, one Support family (Liss + F1-F4), and Bouchons, each in
      the seven real colours (GD CH AC AB WH BK SN) and, where a part has a
      length, the five real lengths (2m 2.5m 3m 4m 5m);
    * seven CONFIGURABLE triangle products under Triangle > Triangle Fix,
      each with its length-priced definition and a recipe of component
      *patterns* resolved against those parts at the till.

Usage:
    python scripts/seed_prod_catalog.py <tenant_id>

Safe to re-run: the tenant's products are wiped first, so the catalogue always
ends at exactly this state. Component SKUs and names come from the same
formulas the app uses (``variant_service.build_name`` / ``build_sku``), so they
match what the admin UI generates.

Pricing: only the flagship "Triangle 28/19 F2-F3-F4" line carries real prices
(4600-8900 by length). Every other product and every component part is seeded
at a 1.00 placeholder and must be priced in the UI before it is sold — the
script prints a warning naming them.
"""

import asyncio
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

# Same trick as seed_store_catalog.py: make the backend root importable no
# matter how this script is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import seed_store_catalog  # noqa: E402  (sibling script, same directory)
from sqlalchemy import delete, select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.inventory.models import InventoryMovement, ProductStockSnapshot  # noqa: E402
from app.inventory.repository import InventoryRepository  # noqa: E402
from app.products.models import (  # noqa: E402
    BomUnit,
    CategoryVariantScheme,
    ConfigurableDefinition,
    ConfigurablePrice,
    ConfigurableRecipeLine,
    Product,
    ProductAttribute,
    ProductBomLine,
    ProductImage,
    ProductStatus,
    ProductTag,
    ProductType,
    ProductVariant,
)
from app.products.variant_service import build_name, build_sku  # noqa: E402
from app.shared.core.ids import generate_uuid7  # noqa: E402
from app.shared.database.session import async_session_factory  # noqa: E402
from app.transfers.models import StockTransferLine  # noqa: E402

COLORS = ["GD", "CH", "AC", "AB", "WH", "BK", "SN"]
LENGTHS = ["2m", "2.5m", "3m", "4m", "5m"]

# Tube models by rail diameter — the shop stocks 28mm tubes in every model but
# 19mm tubes only as Liss. This drives both the generated parts and the recipe
# per-rail "tube" axes (the till offers exactly these, per diameter).
TUBE_MODELS: dict[str, list[str]] = {
    "28": ["Liss", "Torsadi", "Sculpté"],
    "19": ["Liss"],
}

# Everything not explicitly priced is seeded at this placeholder; the shop
# fills the real prices in via the UI (definition page / product form).
PLACEHOLDER_PRICE = Decimal("1.00")

# Real prices for the flagship line, by length.
FLAGSHIP_PRICES: dict[str, str] = {
    "2m": "4600",
    "2.5m": "5600",
    "3m": "6200",
    "4m": "7800",
    "5m": "8900",
}

# A triangle takes two support pieces at every length except 4m, where it
# takes a third. Expressed as a per-length override on the recipe line so the
# stock deduction matches what actually comes off the shelf.
SUPPORT_QUANTITY = 2
SUPPORT_QUANTITY_OVERRIDES: dict[str, int] = {"4m": 3}

# Variant schemes are created/updated to these values so the UI pickers offer
# the parts that now exist. Keyed by the same category paths as the tree.
# (base_name, sku_prefix, attribute_keys, allowed_values)
SCHEME_UPDATES: dict[tuple[str, ...], tuple[str, str, list[str], dict[str, list[str]]]] = {
    ("Triangle", "Tubes", "Tube 28mm"): (
        "Tube",
        "TUB",
        ["diameter", "length", "model", "color"],
        {
            "diameter": ["28"],
            "length": LENGTHS,
            "model": TUBE_MODELS["28"],
            "color": COLORS,
        },
    ),
    ("Triangle", "Tubes", "Tube 19mm"): (
        "Tube",
        "TUB",
        ["diameter", "length", "model", "color"],
        {
            "diameter": ["19"],
            "length": LENGTHS,
            "model": TUBE_MODELS["19"],
            "color": COLORS,
        },
    ),
    ("Triangle", "Accessoires", "Motif"): (
        "Motif",
        "MOT",
        ["diameter", "color", "model"],
        {"diameter": ["28", "19"], "color": COLORS, "model": ["Simple"]},
    ),
    # base_name is "Motif" (not "Motif Cristal") so the product reads
    # "Motif 28 Cristal" rather than "Motif Cristal 28 Cristal"; the MOTC
    # SKU prefix and the category keep it distinct from a Simple motif.
    ("Triangle", "Accessoires", "Motif Cristal"): (
        "Motif",
        "MOTC",
        ["diameter", "color", "model"],
        {"diameter": ["28", "19"], "color": COLORS, "model": ["Cristal"]},
    ),
    # One Support family holds every model (the catalogue has no separate
    # "cristal" support); "Support Cristal" stays empty.
    ("Triangle", "Accessoires", "Support Simple"): (
        "Support",
        "SUP",
        ["model", "color", "size"],
        {
            "model": ["Liss", "F1", "F2", "F3", "F4"],
            "color": COLORS,
            "size": ["28/19", "19/19", "28", "19"],
        },
    ),
    ("Triangle", "Accessoires", "Support Cristal"): (
        "Support",
        "SUPC",
        ["model", "color", "size"],
        {"model": ["Cristal"], "color": COLORS, "size": ["19/19mm", "28/19"]},
    ),
    ("Triangle", "Accessoires", "Bouchon"): (
        "Bouchon",
        "BOU",
        ["color", "size"],
        {"color": COLORS, "size": ["19mm", "28mm"]},
    ),
}

# (model, size) support combinations the catalogue actually sells. Not the
# full grid — a grid would create parts nothing ever resolves to.
SUPPORT_PAIRS: list[tuple[str, str]] = [
    ("F1", "28/19"),
    ("F2", "28/19"),
    ("F3", "28/19"),
    ("F4", "28/19"),
    ("F2", "19/19"),
    ("F3", "19/19"),
    ("F4", "19/19"),
    ("Liss", "19/19"),
    ("Liss", "28"),
    ("F1", "28"),
    ("Liss", "19"),
]

# One entry per CONFIGURABLE product.
# (name, sku, support values, support size, motif values, motif diameter,
#  [(tube diameter, rail count)], prices by length or None for placeholder)
CONFIGURABLES: list[
    tuple[str, str, list[str], str, list[str], str, list[tuple[str, int]], dict[str, str] | None]
] = [
    (
        "Triangle 28/19",
        "TRI-28-19",
        ["F2", "F3", "F4"],
        "28/19",
        ["Cristal", "Simple"],
        "28",
        [("28", 1), ("19", 1)],
        FLAGSHIP_PRICES,
    ),
    (
        "Triangle 28/19 F1",
        "TRI-28-19-F1",
        ["F1"],
        "28/19",
        ["Simple"],
        "28",
        [("28", 1), ("19", 1)],
        None,
    ),
    (
        "Triangle 19/19",
        "TRI-19-19",
        ["F2", "F3", "F4"],
        "19/19",
        ["Cristal", "Simple"],
        "19",
        [("19", 2)],
        None,
    ),
    (
        "Triangle 28/19 Liss",
        "TRI-28-19-LISS",
        ["Liss"],
        "19/19",
        ["Simple"],
        "28",
        [("28", 1), ("19", 1)],
        None,
    ),
    (
        "Triangle 28 Liss",
        "TRI-28-LISS",
        ["Liss"],
        "28",
        ["Simple"],
        "28",
        [("28", 1)],
        None,
    ),
    (
        "Triangle 28 F1",
        "TRI-28-F1",
        ["F1"],
        "28",
        ["Simple"],
        "28",
        [("28", 1)],
        None,
    ),
    (
        "Triangle 19 Liss",
        "TRI-19-LISS",
        ["Liss"],
        "19",
        ["Simple"],
        "19",
        [("19", 1)],
        None,
    ),
]


def _component_items() -> list[tuple[tuple[str, ...], dict[str, str]]]:
    """(category path, attributes) for every component part to create."""
    items: list[tuple[tuple[str, ...], dict[str, str]]] = []

    for diameter, models in TUBE_MODELS.items():
        for length in LENGTHS:
            for model in models:
                for color in COLORS:
                    items.append(
                        (
                            ("Triangle", "Tubes", f"Tube {diameter}mm"),
                            {
                                "diameter": diameter,
                                "length": length,
                                "model": model,
                                "color": color,
                            },
                        )
                    )

    for diameter in ("28", "19"):
        for color in COLORS:
            items.append(
                (
                    ("Triangle", "Accessoires", "Motif"),
                    {"diameter": diameter, "model": "Simple", "color": color},
                )
            )
            items.append(
                (
                    ("Triangle", "Accessoires", "Motif Cristal"),
                    {"diameter": diameter, "model": "Cristal", "color": color},
                )
            )

    for model, size in SUPPORT_PAIRS:
        for color in COLORS:
            items.append(
                (
                    ("Triangle", "Accessoires", "Support Simple"),
                    {"model": model, "size": size, "color": color},
                )
            )

    for size in ("19mm", "28mm"):
        for color in COLORS:
            items.append(
                (
                    ("Triangle", "Accessoires", "Bouchon"),
                    {"size": size, "color": color},
                )
            )

    return items


async def _upsert_scheme(
    session: AsyncSession,
    tenant_id: UUID,
    category_id: UUID,
    base_name: str,
    sku_prefix: str,
    attribute_keys: list[str],
    allowed_values: dict[str, list[str]],
) -> None:
    """Create the scheme, or overwrite its naming/allowed values in place.

    The colour key stays whatever the axis set implies ("color" for every
    scheme here), derived rather than hard-coded so it cannot drift.
    """
    existing = (
        await session.execute(
            select(CategoryVariantScheme).where(
                CategoryVariantScheme.tenant_id == tenant_id,
                CategoryVariantScheme.category_id == category_id,
                CategoryVariantScheme.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = CategoryVariantScheme(tenant_id=tenant_id, category_id=category_id)
        session.add(existing)
    existing.base_name = base_name
    existing.sku_prefix = sku_prefix
    existing.attribute_keys = attribute_keys
    existing.allowed_values = allowed_values
    existing.color_key = "color" if "color" in attribute_keys else None
    await session.flush()


async def _wipe_products(session: AsyncSession, tenant_id: UUID) -> tuple[int, int]:
    """Remove every product the tenant has, keeping categories intact.

    Returns (hard_deleted, soft_deleted). A product referenced by inventory
    history (a movement or a transfer line) cannot be hard-deleted without
    dragging the ledger with it, so it is soft-deleted and its SKU renamed to
    free the unique (tenant, sku) key for the fresh catalogue.
    """
    product_ids = (
        (await session.execute(select(Product.id).where(Product.tenant_id == tenant_id)))
        .scalars()
        .all()
    )
    if not product_ids:
        return 0, 0

    for model in (
        ProductTag,
        ProductImage,
        ProductAttribute,
        ProductBomLine,
        ConfigurableRecipeLine,
        ConfigurablePrice,
        ConfigurableDefinition,
        ProductVariant,
        ProductStockSnapshot,
    ):
        await session.execute(delete(model).where(model.tenant_id == tenant_id))

    referenced: set[UUID] = set()
    for table in (InventoryMovement, StockTransferLine):
        rows = (
            await session.execute(select(table.product_id).where(table.tenant_id == tenant_id))
        ).all()
        referenced.update(row[0] for row in rows)

    hard_deleted = 0
    soft_deleted = 0
    for product_id in product_ids:
        if product_id in referenced:
            product = await session.get(Product, product_id)
            product.deleted_at = datetime.now(UTC)
            product.sku = f"{product.sku[:60]}-OLD" if product.sku else product.sku
            soft_deleted += 1
        else:
            await session.execute(delete(Product).where(Product.id == product_id))
            hard_deleted += 1
    return hard_deleted, soft_deleted


async def _create_components(
    session: AsyncSession,
    tenant_id: UUID,
    category_by_path: dict[tuple[str, ...], UUID],
) -> list[Product]:
    """Create the component VARIANT products (tubes, motifs, supports, bouchons)."""
    schemes: dict[tuple[str, ...], CategoryVariantScheme] = {}
    for path in SCHEME_UPDATES:
        schemes[path] = (
            await session.execute(
                select(CategoryVariantScheme).where(
                    CategoryVariantScheme.tenant_id == tenant_id,
                    CategoryVariantScheme.category_id == category_by_path[path],
                    CategoryVariantScheme.deleted_at.is_(None),
                )
            )
        ).scalar_one()

    created: list[Product] = []
    for path, attributes in _component_items():
        scheme = schemes[path]
        product = Product(
            id=generate_uuid7(),
            tenant_id=tenant_id,
            name=build_name(scheme.base_name, scheme.attribute_keys, attributes, scheme.color_key),
            sku=build_sku(scheme.sku_prefix, scheme.attribute_keys, attributes),
            price=PLACEHOLDER_PRICE,
            cost_price=None,
            status=ProductStatus.ACTIVE,
            product_type=ProductType.VARIANT,
            attributes=attributes,
            category_id=category_by_path[path],
        )
        session.add(product)
        created.append(product)
    return created


async def _create_configurables(
    session: AsyncSession,
    tenant_id: UUID,
    category_by_path: dict[tuple[str, ...], UUID],
    warnings: list[str],
) -> list[Product]:
    """Create the seven CONFIGURABLE triangle products with their definitions."""
    fix_category_id = category_by_path[("Triangle", "Triangle Fix")]
    created: list[Product] = []

    for spec in CONFIGURABLES:
        name, sku, supports, support_size, motifs, motif_diameter, tubes, prices = spec
        product = Product(
            id=generate_uuid7(),
            tenant_id=tenant_id,
            name=name,
            sku=sku,
            price=PLACEHOLDER_PRICE,
            cost_price=None,
            status=ProductStatus.ACTIVE,
            product_type=ProductType.CONFIGURABLE,
            attributes={},
            category_id=fix_category_id,
        )
        session.add(product)
        await session.flush()
        created.append(product)

        # Tube choices are per rail: each diameter is its own axis, so a 28/19
        # triangle offers its 28mm models (Liss/Torsadi/Sculpté) and its 19mm
        # models (Liss) as two separate till steps instead of one shared choice
        # collapsed to the models stocked at every diameter. The stored lists
        # are seed-time placeholders — at the till they are replaced by
        # whatever the catalogue actually holds.
        definition = ConfigurableDefinition(
            tenant_id=tenant_id,
            product_id=product.id,
            color_key="color",
            length_key="length",
            options={
                "support": supports,
                **{
                    f"tube{diameter}": list(TUBE_MODELS[diameter])
                    for diameter, _ in tubes
                    if diameter in TUBE_MODELS
                },
                "motif": motifs,
                "color": COLORS,
            },
        )
        session.add(definition)

        price_by_length = prices or {length: str(PLACEHOLDER_PRICE) for length in LENGTHS}
        if prices is None:
            warnings.append(f"  ! {name} ({sku}) seeded at placeholder 1.00 — price it in the UI")
        for length in LENGTHS:
            session.add(
                ConfigurablePrice(
                    tenant_id=tenant_id,
                    configurable_product_id=product.id,
                    length=length,
                    price=Decimal(price_by_length[length]),
                )
            )

        # Tube lines: one per distinct rail diameter, quantity = rail count.
        # The model follows the till's per-rail choice (@tube28, @tube19), so
        # a 28/19 triangle can take Torsadi 28 rails and only Liss 19 rails;
        # each axis is derived from the catalogue at the till.
        for diameter, rail_count in tubes:
            session.add(
                ConfigurableRecipeLine(
                    tenant_id=tenant_id,
                    configurable_product_id=product.id,
                    label=f"Tube {diameter}",
                    category_id=category_by_path[("Triangle", "Tubes", f"Tube {diameter}mm")],
                    attributes={
                        "diameter": diameter,
                        "length": "@length",
                        "model": f"@tube{diameter}",
                        "color": "@color",
                    },
                    quantity=rail_count,
                    unit=BomUnit.PIECE,
                )
            )

        # Support line: the size is fixed by the product, the model follows
        # the till's "support" choice. 4m takes a third piece.
        session.add(
            ConfigurableRecipeLine(
                tenant_id=tenant_id,
                configurable_product_id=product.id,
                label="Support",
                category_id=category_by_path[("Triangle", "Accessoires", "Support Simple")],
                attributes={"model": "@support", "size": support_size, "color": "@color"},
                quantity=SUPPORT_QUANTITY,
                quantity_by_length=SUPPORT_QUANTITY_OVERRIDES,
                unit=BomUnit.PIECE,
            )
        )

        # Motif line: spans the "Motif" and "Motif Cristal" categories, so it
        # carries no category and is matched globally by model (@motif) +
        # diameter + colour — unique because "Simple"/"Cristal" are only ever
        # motif model values.
        session.add(
            ConfigurableRecipeLine(
                tenant_id=tenant_id,
                configurable_product_id=product.id,
                label="Motif",
                category_id=None,
                attributes={"diameter": motif_diameter, "model": "@motif", "color": "@color"},
                quantity=1,
                unit=BomUnit.PIECE,
            )
        )

        # Bouchon lines: two per rail end of each diameter.
        for diameter, rail_count in tubes:
            session.add(
                ConfigurableRecipeLine(
                    tenant_id=tenant_id,
                    configurable_product_id=product.id,
                    label=f"Bouchon {diameter}",
                    category_id=category_by_path[("Triangle", "Accessoires", "Bouchon")],
                    attributes={"size": f"{diameter}mm", "color": "@color"},
                    quantity=rail_count * 2,
                    unit=BomUnit.PIECE,
                )
            )

    return created


async def seed(tenant_id: UUID) -> None:
    # Categories first, idempotently (the tree and helper live in the sibling
    # script; a re-run leaves existing categories exactly as they are).
    await seed_store_catalog.seed(tenant_id)

    warnings: list[str] = []
    async with async_session_factory() as session:
        # RLS: every read/write below is scoped by this GUC.
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
            {"tenant_id": str(tenant_id)},
        )

        category_by_path: dict[tuple[str, ...], UUID] = {}
        for top_order, (top_name, children) in enumerate(seed_store_catalog.CATEGORY_TREE, 1):
            created: list[str] = []
            skipped: list[str] = []
            top_id = await seed_store_catalog._get_or_create(
                session, tenant_id, top_name, None, top_order, created, skipped
            )
            category_by_path[(top_name,)] = top_id
            for child_order, (child_name, grandchildren) in enumerate(children, 1):
                child_id = await seed_store_catalog._get_or_create(
                    session, tenant_id, child_name, top_id, child_order, created, skipped
                )
                category_by_path[(top_name, child_name)] = child_id
                for gc_order, gc_name in enumerate(grandchildren, 1):
                    gc_id = await seed_store_catalog._get_or_create(
                        session, tenant_id, gc_name, child_id, gc_order, created, skipped
                    )
                    category_by_path[(top_name, child_name, gc_name)] = gc_id

        for path, (base, prefix, keys, values) in SCHEME_UPDATES.items():
            await _upsert_scheme(
                session, tenant_id, category_by_path[path], base, prefix, keys, values
            )

        hard_deleted, soft_deleted = await _wipe_products(session, tenant_id)

        components = await _create_components(session, tenant_id, category_by_path)
        await session.flush()
        inventory = InventoryRepository(session)
        for component in components:
            await inventory.ensure_snapshots_for_all_warehouses(tenant_id, component.id)

        configurables = await _create_configurables(session, tenant_id, category_by_path, warnings)

        await session.commit()

    print(
        f"products removed: {hard_deleted} hard-deleted, "
        f"{soft_deleted} soft-deleted (had ledger history)"
    )
    print(f"component parts created: {len(components)}")
    print(f"configurable products created: {len(configurables)}")
    for product in configurables:
        print(f"  + {product.name} ({product.sku})")
    if warnings:
        print("warnings:")
        for warning in warnings:
            print(warning)


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(1)
    try:
        tenant_id = UUID(sys.argv[1])
    except ValueError:
        print(f"Not a valid UUID: {sys.argv[1]}")
        raise SystemExit(1) from None
    asyncio.run(seed(tenant_id))


if __name__ == "__main__":
    main()
