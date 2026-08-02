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
from app.products.models import CategoryVariantScheme, Product, ProductStatus, ProductType
from app.products.repository import ProductRepository
from app.products.variant_schemas import VariantGenerateItem
from app.shared.core.exceptions import NotFoundError
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

    products_result = await session.execute(
        select(Product)
        .where(
            Product.tenant_id == tenant_id,
            Product.category_id == category_id,
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
        name = build_name(
            scheme.base_name, scheme.attribute_keys, item.attributes, scheme.color_key
        )
        sku = build_sku(scheme.sku_prefix, scheme.attribute_keys, item.attributes)
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

        created.append(product)

    await session.commit()
    return created, skipped
