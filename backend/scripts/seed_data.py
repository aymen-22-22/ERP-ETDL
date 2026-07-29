"""Seed DTF decoration products, categories, brands, and units for a tenant.

Usage:
    python scripts/seed_data.py <tenant_id>
"""
import asyncio
import sys
from uuid import UUID

from sqlalchemy import text

from app.products.models import Brand, Category, Product, ProductStatus, Tag, Unit
from app.shared.database.session import async_session_factory
from app.warehouses.models import Warehouse


DTF_CATEGORIES = [
    {"name": "Films", "description": "DTF transfer films — rolls and sheets", "sort_order": 1},
    {"name": "Powders", "description": "Hot-melt adhesive powders for DTF", "sort_order": 2},
    {"name": "Inks", "description": "DTF pigment inks and CMYK sets", "sort_order": 3},
    {
        "name": "Printers & Parts",
        "description": "DTF printers, printheads, and spare parts",
        "sort_order": 4,
    },
    {
        "name": "Heat Presses",
        "description": "Heat press machines and accessories",
        "sort_order": 5,
    },
    {
        "name": "Consumables",
        "description": "General consumables — tapes, gloves, cleaning kits",
        "sort_order": 6,
    },
    {"name": "Accessories", "description": "Miscellaneous DTF accessories", "sort_order": 7},
]

DTF_BRANDS = [
    {"name": "DTF Pro", "description": "Professional-grade DTF supplies"},
    {"name": "PrintMaster", "description": "Printers and printing equipment"},
    {"name": "HeatCraft", "description": "Heat press machines and accessories"},
    {"name": "ColorJet", "description": "DTF inks and color management"},
    {"name": "FilmTech", "description": "Transfer films and media"},
]

DTF_UNITS = [
    {"name": "Piece", "abbreviation": "pc"},
    {"name": "Roll", "abbreviation": "rl"},
    {"name": "Kilogram", "abbreviation": "kg"},
    {"name": "Liter", "abbreviation": "L"},
    {"name": "Meter", "abbreviation": "m"},
    {"name": "Set", "abbreviation": "set"},
    {"name": "Box", "abbreviation": "bx"},
]

DTF_TAGS = [
    "DTF", "direct-to-film", "consumable", "printer", "ink",
    "powder", "film", "heat-press", "accessory", "bulk",
]

DTF_PRODUCTS = [
    {"name": "DTF Pro Film Roll 60cm x 100m", "sku": "FLM-60-100",
     "price": 89.99, "cost_price": 65.00, "category": "Films",
     "brand": "FilmTech", "unit": "Roll"},
    {"name": "DTF Pro Film Roll 30cm x 100m", "sku": "FLM-30-100",
     "price": 49.99, "cost_price": 35.00, "category": "Films",
     "brand": "FilmTech", "unit": "Roll"},
    {"name": "DTF Pro Film A4 Sheets (100pk)", "sku": "FLM-A4-100",
     "price": 24.99, "cost_price": 17.00, "category": "Films",
     "brand": "FilmTech", "unit": "Box"},
    {"name": "Hot-Melt Adhesive Powder — Fine 20kg", "sku": "PWD-FINE-20",
     "price": 79.99, "cost_price": 55.00, "category": "Powders",
     "brand": "DTF Pro", "unit": "Kilogram"},
    {"name": "Hot-Melt Adhesive Powder — Coarse 20kg", "sku": "PWD-CRS-20",
     "price": 74.99, "cost_price": 52.00, "category": "Powders",
     "brand": "DTF Pro", "unit": "Kilogram"},
    {"name": "Hot-Melt Adhesive Powder — Fine 1kg", "sku": "PWD-FINE-1",
     "price": 5.99, "cost_price": 3.50, "category": "Powders",
     "brand": "DTF Pro", "unit": "Kilogram"},
    {"name": "ColorJet CMYK Ink Set 1L x 4", "sku": "INK-CMYK-1L",
     "price": 129.99, "cost_price": 90.00, "category": "Inks",
     "brand": "ColorJet", "unit": "Set"},
    {"name": "ColorJet White DTF Ink 1L", "sku": "INK-WHT-1L",
     "price": 44.99, "cost_price": 30.00, "category": "Inks",
     "brand": "ColorJet", "unit": "Liter"},
    {"name": "ColorJet CMYK Ink Set 500ml x 4", "sku": "INK-CMYK-500",
     "price": 74.99, "cost_price": 52.00, "category": "Inks",
     "brand": "ColorJet", "unit": "Set"},
    {"name": "PrintMaster A3 DTF Printer", "sku": "PRN-A3-DTF",
     "price": 3499.99, "cost_price": 2500.00, "category": "Printers & Parts",
     "brand": "PrintMaster", "unit": "Piece"},
    {"name": "PrintMaster A4 DTF Printer", "sku": "PRN-A4-DTF",
     "price": 2199.99, "cost_price": 1600.00, "category": "Printers & Parts",
     "brand": "PrintMaster", "unit": "Piece"},
    {"name": "PrintHead — Epson I3200", "sku": "PRNH-EPS-I3200",
     "price": 299.99, "cost_price": 210.00, "category": "Printers & Parts",
     "brand": "PrintMaster", "unit": "Piece"},
    {"name": "Damping Damper Kit", "sku": "PRNH-DMP-KIT",
     "price": 39.99, "cost_price": 25.00, "category": "Printers & Parts",
     "brand": "PrintMaster", "unit": "Set"},
    {"name": "HeatCraft Pro 38x38 Clamshell Press", "sku": "HPR-38C-CLM",
     "price": 599.99, "cost_price": 420.00, "category": "Heat Presses",
     "brand": "HeatCraft", "unit": "Piece"},
    {"name": "HeatCraft Pro 40x50 Swing-Away Press", "sku": "HPR-40S-SW",
     "price": 799.99, "cost_price": 560.00, "category": "Heat Presses",
     "brand": "HeatCraft", "unit": "Piece"},
    {"name": "HeatCraft Mini Press 15x15", "sku": "HPR-15-MINI",
     "price": 249.99, "cost_price": 175.00, "category": "Heat Presses",
     "brand": "HeatCraft", "unit": "Piece"},
    {"name": "Heat Tape — 2 inch x 50m Roll", "sku": "CON-TAPE-2",
     "price": 12.99, "cost_price": 8.00, "category": "Consumables",
     "brand": "DTF Pro", "unit": "Roll"},
    {"name": "Silicone Sheet A3 (3pk)", "sku": "CON-SIL-A3",
     "price": 29.99, "cost_price": 20.00, "category": "Consumables",
     "brand": "DTF Pro", "unit": "Set"},
    {"name": "Nitrile Gloves Box (100pk)", "sku": "CON-GLV-100",
     "price": 14.99, "cost_price": 9.00, "category": "Consumables",
     "brand": "DTF Pro", "unit": "Box"},
    {"name": "Cleaning Kit — PrintHead & Lines", "sku": "ACC-CLN-KIT",
     "price": 34.99, "cost_price": 22.00, "category": "Accessories",
     "brand": "DTF Pro", "unit": "Set"},
    {"name": "Curing Oven — Small", "sku": "ACC-OVN-S",
     "price": 1499.99, "cost_price": 1050.00, "category": "Accessories",
     "brand": "HeatCraft", "unit": "Piece"},
    {"name": "Shake Powder Machine", "sku": "ACC-SHK-MC",
     "price": 899.99, "cost_price": 630.00, "category": "Accessories",
     "brand": "HeatCraft", "unit": "Piece"},
]


async def seed() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/seed_data.py <tenant_id>", file=sys.stderr)
        sys.exit(1)

    tenant_id = UUID(sys.argv[1])

    async with async_session_factory() as session:
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
            {"tenant_id": str(tenant_id)},
        )

        warehouse = await session.get(Warehouse, tenant_id)
        print(f"Using tenant {tenant_id} (warehouse: {warehouse.name if warehouse else 'N/A'})")

        brand_map: dict[str, UUID] = {}
        for b in DTF_BRANDS:
            obj = Brand(tenant_id=tenant_id, name=b["name"],
                        description=b["description"])
            session.add(obj)
            await session.flush()
            brand_map[b["name"]] = obj.id

        unit_map: dict[str, UUID] = {}
        for u in DTF_UNITS:
            obj = Unit(tenant_id=tenant_id, name=u["name"],
                       abbreviation=u["abbreviation"])
            session.add(obj)
            await session.flush()
            unit_map[u["name"]] = obj.id

        cat_map: dict[str, UUID] = {}
        for c in DTF_CATEGORIES:
            obj = Category(tenant_id=tenant_id, name=c["name"],
                           description=c["description"],
                           sort_order=c["sort_order"])
            session.add(obj)
            await session.flush()
            cat_map[c["name"]] = obj.id

        for t in DTF_TAGS:
            session.add(Tag(tenant_id=tenant_id, name=t))

        warehouse_id = warehouse.id if warehouse else None

        for p in DTF_PRODUCTS:
            product = Product(
                tenant_id=tenant_id,
                name=p["name"],
                sku=p["sku"],
                price=p["price"],
                cost_price=p["cost_price"],
                category_id=cat_map.get(p["category"]),
                brand_id=brand_map.get(p["brand"]),
                unit_id=unit_map.get(p["unit"]),
                default_warehouse_id=warehouse_id,
                status=ProductStatus.ACTIVE,
            )
            session.add(product)

        await session.commit()
        print(f"Seeded {len(DTF_CATEGORIES)} categories, "
              f"{len(DTF_BRANDS)} brands, {len(DTF_UNITS)} units, "
              f"{len(DTF_PRODUCTS)} products, {len(DTF_TAGS)} tags")


if __name__ == "__main__":
    asyncio.run(seed())
