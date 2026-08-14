"""Name and SKU generation for VARIANT products.

Staff never type a variant name by hand — the business has a strict formula
per family, and typos there mean duplicate products and wrong stock. Every
formula reduces to the same rule: the scheme's base name, then the chosen
axis values in the scheme's fixed key order.

    Tube     + {diameter:28, length:2m, model:Torsadi, color:Argent}
             -> "Tube 28 2m Torsadi Argent" / TUB-28-2M-TOR-ARG
"""

import itertools
import re
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import MovementType
from app.inventory.repository import InventoryRepository
from app.inventory.schemas import MovementCreate
from app.products.catalog_service import category_ids_with_descendants
from app.products.models import (
    CategoryVariantScheme,
    Product,
    ProductImage,
    ProductStatus,
    ProductType,
)
from app.products.repository import ProductRepository
from app.products.variant_schemas import VariantAddRequest, VariantGenerateItem, VariantSchemeUpsert
from app.shared.core.cache import get_tenant_cache
from app.shared.core.exceptions import ConflictError, NotFoundError
from app.shared.core.ids import generate_uuid7
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.warehouses.service import require_active_warehouse

# Alphabetic values are abbreviated to this many characters in a SKU segment
# ("Torsadi" -> TOR). Values containing a digit are kept whole, because that
# digit is usually the defining measurement ("28", "2m", "19/19mm", "K19")
# and truncating it would collide different parts onto one SKU.
_ALPHA_ABBREV_LEN = 3


def build_name(
    base_name: str,
    attribute_keys: list[str],
    attributes: dict[str, str],
    color_key: str | None = None,
) -> str:
    """Base name followed by the axis values, in the scheme's key order.

    Keys the caller didn't supply are skipped rather than rendered blank, so a
    partially-specified variant still gets a sensible name.

    `color_key` is skipped here too: "Tube 28 Torsadi 2m" is the name for
    every colour of that structural product, not just one of them. It still
    goes into the SKU (`build_sku` doesn't take this parameter) — the name can
    repeat across the colour rows, but the SKU has to keep disambiguating them.
    """
    parts = [base_name.strip()]
    parts.extend(
        str(attributes[key]).strip()
        for key in attribute_keys
        if key != color_key and str(attributes.get(key, "")).strip()
    )
    return " ".join(parts)


def _sku_segment(value: str) -> str:
    """One SKU segment from one attribute value."""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    if not cleaned:
        return ""
    if cleaned.isalpha():
        return cleaned[:_ALPHA_ABBREV_LEN]
    return cleaned


def build_sku(sku_prefix: str, attribute_keys: list[str], attributes: dict[str, str]) -> str:
    """`TUB-28-2M-TOR-ARG` — matches the SKU convention already in use."""
    segments = [sku_prefix.strip().upper()]
    for key in attribute_keys:
        segment = _sku_segment(str(attributes.get(key, "")))
        if segment:
            segments.append(segment)
    return "-".join(segments)


def expand_combinations(
    attribute_keys: list[str], selected_values: dict[str, list[str]]
) -> list[dict[str, str]]:
    """Cartesian product of the selected values, in the scheme's key order.

    Picking 2 diameters x 2 lengths x 1 model x 2 colours yields 8 variants.
    Keys with no selected values are dropped rather than producing zero
    combinations, so you can generate on a subset of the axes.
    """
    keys = [key for key in attribute_keys if selected_values.get(key)]
    if not keys:
        return []
    value_lists = [selected_values[key] for key in keys]
    return [dict(zip(keys, combo, strict=True)) for combo in itertools.product(*value_lists)]


async def get_scheme(
    session: AsyncSession, tenant_id: UUID, category_id: UUID
) -> CategoryVariantScheme:
    result = await session.execute(
        select(CategoryVariantScheme).where(
            CategoryVariantScheme.tenant_id == tenant_id,
            CategoryVariantScheme.category_id == category_id,
            CategoryVariantScheme.deleted_at.is_(None),
        )
    )
    scheme = result.scalar_one_or_none()
    if scheme is None:
        raise NotFoundError("This category has no variant scheme")
    return scheme


async def upsert_scheme(
    session: AsyncSession,
    tenant_id: UUID,
    category_id: UUID,
    data: VariantSchemeUpsert,
) -> CategoryVariantScheme:
    """Create or update the variant generation formula for a category.

    The category must exist and belong to the tenant.
    """
    from app.products.models import Category

    cat_result = await session.execute(
        select(Category).where(
            Category.id == category_id,
            Category.tenant_id == tenant_id,
            Category.deleted_at.is_(None),
        )
    )
    if cat_result.scalar_one_or_none() is None:
        raise NotFoundError("Category not found")

    result = await session.execute(
        select(CategoryVariantScheme).where(
            CategoryVariantScheme.tenant_id == tenant_id,
            CategoryVariantScheme.category_id == category_id,
            CategoryVariantScheme.deleted_at.is_(None),
        )
    )
    scheme = result.scalar_one_or_none()
    if scheme is None:
        scheme = CategoryVariantScheme(tenant_id=tenant_id, category_id=category_id)
        session.add(scheme)
    scheme.base_name = data.base_name
    scheme.sku_prefix = data.sku_prefix
    scheme.attribute_keys = data.attribute_keys
    scheme.allowed_values = data.allowed_values
    scheme.color_key = data.color_key
    await session.flush()
    return scheme


async def family_rows(session: AsyncSession, tenant_id: UUID, product: Product) -> list[Product]:
    """Every row of a product's colour family: same structural name and
    category. This is the grouping rule the family view and the family image
    endpoints share, so "which products belong to this product" never drifts
    between them."""
    if product.category_id is None:
        return []
    result = await session.execute(
        select(Product)
        .where(
            Product.tenant_id == tenant_id,
            Product.category_id == product.category_id,
            Product.name == product.name,
            Product.deleted_at.is_(None),
        )
        .order_by(Product.created_at)
    )
    return list(result.scalars().all())


async def rename_family(
    session: AsyncSession, tenant_id: UUID, product: Product, new_name: str
) -> dict[str, object]:
    """Rename the product and every colour that shares its structural name.

    The family groups by `Product.name`, so a colour renamed on its own would
    silently split off into a new family; renaming all of them together in one
    transaction keeps the group intact. One mutation per row feeds the sync
    queue exactly like the normal product update does.
    """
    rows = await family_rows(session, tenant_id, product)
    repo = ProductRepository(session)
    for row in rows:
        mutation = MutationEnvelope(
            client_mutation_id=generate_uuid7(),
            entity_type="product",
            entity_id=row.id,
            operation=ChangeOperation.UPDATE,
            base_version=row.version,
            payload={"name": new_name},
            client_timestamp=datetime.now(UTC),
        )
        await repo.apply_mutation(tenant_id, mutation)
    await session.commit()
    await get_tenant_cache().invalidate_pattern(tenant_id, "products")

    base_result = await session.execute(
        select(Product).where(Product.id == product.id, Product.tenant_id == tenant_id)
    )
    base = base_result.scalar_one()
    return await get_product_family(session, tenant_id, base)


async def existing_skus(session: AsyncSession, tenant_id: UUID, skus: list[str]) -> set[str]:
    """Which of these SKUs the tenant already has.

    Checked in one query rather than per-candidate: generating a full grid can
    easily be 50+ variants, and the preview has to be fast enough to feel
    instant while someone ticks boxes.
    """
    if not skus:
        return set()
    result = await session.execute(
        select(Product.sku).where(Product.tenant_id == tenant_id, Product.sku.in_(skus))
    )
    return set(result.scalars().all())


async def list_grouped_variants(
    session: AsyncSession, tenant_id: UUID, category_id: UUID
) -> list[dict[str, object]]:
    """Variant products in one category, grouped by their structural name.

    "Tube 28 Torsadi 2m" is one entry with an Argent row and a Dorre row
    nested inside it, each with its own stock — this is what makes the
    business's "11 flat products" complaint into "4 clean products, colours
    inside each". Every colour is still its own `Product` row underneath
    (that is what gives it independent stock); only the presentation groups
    them back together by the name they now share.
    """
    from app.inventory.models import ProductStockSnapshot
    from app.warehouses.models import Warehouse

    category_ids = await category_ids_with_descendants(session, tenant_id, category_id)
    products_result = await session.execute(
        select(Product)
        .where(
            Product.tenant_id == tenant_id,
            Product.category_id.in_(category_ids),
            Product.product_type == ProductType.VARIANT,
            Product.deleted_at.is_(None),
        )
        .order_by(Product.name)
    )
    products = list(products_result.scalars().all())
    if not products:
        return []

    snapshots_result = await session.execute(
        select(ProductStockSnapshot, Warehouse.name)
        .join(Warehouse, Warehouse.id == ProductStockSnapshot.warehouse_id)
        .where(
            ProductStockSnapshot.tenant_id == tenant_id,
            ProductStockSnapshot.product_id.in_([p.id for p in products]),
        )
    )
    stock_by_product: dict[UUID, list[dict[str, str | int]]] = {}
    quantities_by_product: dict[UUID, list[int]] = {}
    for snapshot, warehouse_name in snapshots_result.all():
        stock_by_product.setdefault(snapshot.product_id, []).append(
            {
                "warehouse_id": str(snapshot.warehouse_id),
                "warehouse_name": warehouse_name,
                "quantity": snapshot.quantity_on_hand,
            }
        )
        quantities_by_product.setdefault(snapshot.product_id, []).append(snapshot.quantity_on_hand)

    groups: dict[str, list[dict[str, object]]] = {}
    group_totals: dict[str, int] = {}
    for product in products:
        total = sum(quantities_by_product.get(product.id, []))
        groups.setdefault(product.name, []).append(
            {
                "product_id": str(product.id),
                "sku": product.sku,
                "attributes": product.attributes or {},
                "price": str(product.price),
                "cost_price": str(product.cost_price) if product.cost_price is not None else None,
                "stock": stock_by_product.get(product.id, []),
                "total_quantity": total,
            }
        )
        group_totals[product.name] = group_totals.get(product.name, 0) + total

    return [
        {"name": name, "colors": colors, "total_quantity": group_totals[name]}
        for name, colors in groups.items()
    ]


async def generate_variants(
    session: AsyncSession,
    tenant_id: UUID,
    scheme: CategoryVariantScheme,
    items: list[VariantGenerateItem],
    default_warehouse_id: UUID | None,
) -> tuple[list[Product], list[str]]:
    """Create one VARIANT product per item. Returns (created, skipped_skus).

    Deliberately does not call `create_product` per item: that commits on every
    call, and against a remote database a 50-variant grid would then be 50
    round-trip commits. Here everything is flushed into one transaction and
    committed once.

    A SKU that already exists is skipped rather than failing the whole batch —
    regenerating a grid after adding one new colour is a normal thing to do,
    and it should create the one missing variant, not error out.
    """
    candidates: list[tuple[str, str, VariantGenerateItem]] = []
    for item in items:
        name = item.name or build_name(
            scheme.base_name, scheme.attribute_keys, item.attributes, scheme.color_key
        )
        sku = item.sku or build_sku(scheme.sku_prefix, scheme.attribute_keys, item.attributes)
        candidates.append((name, sku, item))

    taken = await existing_skus(session, tenant_id, [sku for _, sku, _ in candidates])
    # Guard against the same SKU appearing twice inside one request too — two
    # attribute sets can abbreviate to the same segments.
    seen: set[str] = set()

    repo = ProductRepository(session)
    inventory_repo = InventoryRepository(session)
    created: list[Product] = []
    skipped: list[str] = []

    for name, sku, item in candidates:
        if sku in taken or sku in seen:
            skipped.append(sku)
            continue
        seen.add(sku)

        product_id = generate_uuid7()
        payload: dict[str, object] = {
            "id": str(product_id),
            "name": name,
            "sku": sku,
            "price": str(item.price),
            "cost_price": str(item.cost_price) if item.cost_price is not None else None,
            "status": ProductStatus.ACTIVE.value,
            "product_type": ProductType.VARIANT.value,
            "attributes": item.attributes,
            "category_id": str(scheme.category_id),
            "default_warehouse_id": str(default_warehouse_id) if default_warehouse_id else None,
        }
        mutation = MutationEnvelope(
            client_mutation_id=generate_uuid7(),
            entity_type="product",
            entity_id=product_id,
            operation=ChangeOperation.CREATE,
            base_version=None,
            payload=payload,
            client_timestamp=datetime.now(UTC),
        )
        product, _ = await repo.apply_mutation(tenant_id, mutation)

        for entry in item.opening_stock:
            await require_active_warehouse(session, tenant_id, entry.warehouse_id)
            if entry.quantity > 0:
                movement = MovementCreate(
                    id=generate_uuid7(),
                    product_id=product_id,
                    warehouse_id=entry.warehouse_id,
                    movement_type=MovementType.ADJUSTMENT,
                    quantity_delta=entry.quantity,
                    note="Initial stock",
                )
                await inventory_repo.apply_mutation(
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
            if entry.min_quantity is not None:
                await inventory_repo.set_min_quantity(
                    tenant_id, product_id, entry.warehouse_id, entry.min_quantity
                )

        if item.opening_stock:
            # A variant counted into one warehouse must exist (at 0) in every
            # other active warehouse too, so the family table always shows a
            # full row of warehouse columns instead of one warehouse vanishing.
            await inventory_repo.ensure_snapshots_for_all_warehouses(tenant_id, product_id)

        created.append(product)

    await session.commit()
    return created, skipped


async def add_variant(
    session: AsyncSession,
    tenant_id: UUID,
    base_product: Product,
    data: VariantAddRequest,
) -> Product:
    """Create one sibling colour of an existing product.

    The base product is never touched: the new colour is its own `Product`
    row (that is what gives it independent stock), sharing the base's
    structural name while the SKU gains the new colour's segment. When the
    base's stored attributes carry the scheme's full formula the generated
    name/SKU match the bulk generator exactly; a hand-typed base product
    instead keeps its own name and appends the new value to its SKU.
    """
    if base_product.category_id is None:
        raise NotFoundError("This product has no category to derive a variant from")
    scheme = await get_scheme(session, tenant_id, base_product.category_id)

    attributes = dict(base_product.attributes or {})
    attributes.update(data.attributes)

    structural_keys = [key for key in scheme.attribute_keys if key != scheme.color_key]
    has_full_structure = all(str(attributes.get(key, "")).strip() for key in structural_keys)
    if has_full_structure:
        name = build_name(scheme.base_name, scheme.attribute_keys, attributes, scheme.color_key)
        sku = build_sku(scheme.sku_prefix, scheme.attribute_keys, attributes)
    else:
        name = base_product.name
        color_value = data.attributes.get(scheme.color_key, "") if scheme.color_key else ""
        color_segment = _sku_segment(color_value)
        sku = f"{base_product.sku}-{color_segment}" if color_segment else base_product.sku

    item = VariantGenerateItem(
        attributes=attributes,
        price=data.price,
        cost_price=data.cost_price,
        opening_stock=data.opening_stock,
        name=name,
        sku=sku,
    )
    created, _ = await generate_variants(
        session, tenant_id, scheme, [item], data.default_warehouse_id
    )
    if not created:
        raise ConflictError("A product with this SKU already exists")
    return created[0]


async def get_product_family(
    session: AsyncSession, tenant_id: UUID, product: Product
) -> dict[str, object]:
    """One product as a colour family, for the detail page.

    "Support Cristal 28/19" is really several `Product` rows (one per colour,
    each with its own stock); this flattens them back into the card the user
    recognises: a name, and a table of colours with Dépôt / Store / Total
    quantities. Rows are matched by the structural name within the category,
    the same rule the grouped variant list uses, so a hand-typed base product
    groups with the colours added to it.
    """
    from app.inventory.models import ProductStockSnapshot
    from app.warehouses.models import Warehouse

    if product.category_id is None:
        raise NotFoundError("This product has no category")

    scheme_result = await session.execute(
        select(CategoryVariantScheme).where(
            CategoryVariantScheme.tenant_id == tenant_id,
            CategoryVariantScheme.category_id == product.category_id,
            CategoryVariantScheme.deleted_at.is_(None),
        )
    )
    scheme = scheme_result.scalar_one_or_none()
    color_key = scheme.color_key if scheme else None

    rows = await family_rows(session, tenant_id, product)
    if not rows:
        return {
            "name": product.name,
            "category_id": str(product.category_id),
            "has_scheme": scheme is not None,
            "color_key": color_key,
            "rows": [],
            "total_quantity": 0,
            "image_url": None,
        }

    snapshots_result = await session.execute(
        select(ProductStockSnapshot, Warehouse.name)
        .join(Warehouse, Warehouse.id == ProductStockSnapshot.warehouse_id)
        .where(
            ProductStockSnapshot.tenant_id == tenant_id,
            ProductStockSnapshot.product_id.in_([row.id for row in rows]),
        )
    )
    stock_by_product: dict[UUID, list[dict[str, str | int]]] = {}
    quantities_by_product: dict[UUID, list[int]] = {}
    for snapshot, warehouse_name in snapshots_result.all():
        stock_by_product.setdefault(snapshot.product_id, []).append(
            {
                "warehouse_id": str(snapshot.warehouse_id),
                "warehouse_name": warehouse_name,
                "quantity": snapshot.quantity_on_hand,
            }
        )
        quantities_by_product.setdefault(snapshot.product_id, []).append(snapshot.quantity_on_hand)

    images_result = await session.execute(
        select(ProductImage.product_id, ProductImage.url).where(
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id.in_([row.id for row in rows]),
            ProductImage.is_primary.is_(True),
            ProductImage.deleted_at.is_(None),
        )
    )
    image_by_product = {product_id: url for product_id, url in images_result.all()}

    color_rows: list[dict[str, object]] = []
    total_quantity = 0
    for row in rows:
        attributes = row.attributes or {}
        row_total = sum(quantities_by_product.get(row.id, []))
        total_quantity += row_total
        color_rows.append(
            {
                "product_id": str(row.id),
                "sku": row.sku,
                "attributes": attributes,
                "color_label": str(attributes.get(color_key, "")) if color_key else "",
                "price": str(row.price),
                "cost_price": str(row.cost_price) if row.cost_price is not None else None,
                "stock": stock_by_product.get(row.id, []),
                "total_quantity": row_total,
                "image_url": image_by_product.get(row.id),
            }
        )

    # A hand-typed base product carries no colour; keep it first, then the
    # colours alphabetically so the same family reads the same every visit.
    color_rows.sort(key=lambda entry: (str(entry["color_label"]) == "", str(entry["color_label"])))

    # The family photo is whatever colour's primary image the user last set;
    # because family photos are replicated to every colour row, they all agree.
    family_image = next((entry["image_url"] for entry in color_rows if entry["image_url"]), None)

    return {
        "name": product.name,
        "category_id": str(product.category_id),
        "has_scheme": scheme is not None,
        "color_key": color_key,
        "rows": color_rows,
        "total_quantity": total_quantity,
        "image_url": family_image,
    }
