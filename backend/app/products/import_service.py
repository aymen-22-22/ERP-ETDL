from io import BytesIO
from pathlib import Path
from uuid import UUID

from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import Category, Product
from app.products.service import create_product
from app.products.schemas import ProductCreate
from app.shared.core.ids import generate_uuid7

TEMPLATE_COLUMNS = [
    ("name", "Name"),
    ("sku", "SKU"),
    ("price", "Price (DZD)"),
    ("cost_price", "Cost price (DZD)"),
    ("barcode", "Barcode"),
    ("description", "Description"),
    ("category", "Category path (e.g. Lustre > Sous Lustre)"),
]


def generate_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append([label for _, label in TEMPLATE_COLUMNS])
    wb.add_worksheet("Instructions").append([
        "Fill in the Products sheet and upload.",
        "Category path: use > to separate levels, e.g. Lustre > Sous Lustre",
        "Leave category blank for root-level products.",
    ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


async def import_products(
    session: AsyncSession,
    tenant_id: UUID,
    file_bytes: bytes,
) -> list[Product]:
    wb = load_workbook(BytesIO(file_bytes))
    ws = wb.active
    if ws is None:
        raise ValueError("Workbook has no sheets")

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    created: list[Product] = []

    for row in rows:
        if not row or not row[0]:
            continue

        name = str(row[0] or "").strip()
        sku = str(row[1] or "").strip()
        price_raw = row[2]
        cost_raw = row[3]
        barcode = str(row[4] or "").strip() or None
        description = str(row[5] or "").strip() or None
        category_path = str(row[6] or "").strip() or None

        if not name or not sku:
            continue

        price = 0
        if price_raw is not None:
            try:
                price = float(str(price_raw).replace(",", "").replace(" ", ""))
            except (ValueError, TypeError):
                price = 0

        cost_price = None
        if cost_raw is not None:
            try:
                cost_price = float(str(cost_raw).replace(",", "").replace(" ", ""))
            except (ValueError, TypeError):
                pass

        category_id = None
        if category_path:
            parts = [p.strip() for p in category_path.split(">")]
            parent_id: UUID | None = None
            for part in parts:
                stmt = select(Category).where(
                    Category.tenant_id == tenant_id,
                    Category.name == part,
                    Category.parent_id == parent_id,
                    Category.deleted_at.is_(None),
                )
                cat = await session.scalar(stmt)
                if cat is None:
                    cat = Category(
                        id=generate_uuid7(),
                        tenant_id=tenant_id,
                        name=part,
                        parent_id=parent_id,
                    )
                    session.add(cat)
                    await session.flush()
                parent_id = cat.id
                category_id = cat.id

        data = ProductCreate(
            id=generate_uuid7(),
            name=name,
            sku=sku,
            price=price,
            cost_price=cost_price,
            barcode=barcode,
            description=description,
            category_id=category_id,
        )
        product = await create_product(session, tenant_id, data)
        created.append(product)

    return created
