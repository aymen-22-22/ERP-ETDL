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
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import CategoryVariantScheme, Product, ProductStatus, ProductType
from app.products.repository import ProductRepository
from app.shared.core.exceptions import NotFoundError
from app.shared.core.ids import generate_uuid7
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope

# Alphabetic values are abbreviated to this many characters in a SKU segment
# ("Torsadi" -> TOR). Values containing a digit are kept whole, because that
# digit is usually the defining measurement ("28", "2m", "19/19mm", "K19")
# and truncating it would collide different parts onto one SKU.
_ALPHA_ABBREV_LEN = 3


def build_name(base_name: str, attribute_keys: list[str], attributes: dict[str, str]) -> str:
    """Base name followed by the axis values, in the scheme's key order.

    Keys the caller didn't supply are skipped rather than rendered blank, so a
    partially-specified variant still gets a sensible name.
    """
    parts = [base_name.strip()]
    parts.extend(
        str(attributes[key]).strip()
        for key in attribute_keys
        if str(attributes.get(key, "")).strip()
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


async def generate_variants(
    session: AsyncSession,
    tenant_id: UUID,
    scheme: CategoryVariantScheme,
    items: list[tuple[dict[str, str], Decimal, Decimal | None]],
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
    candidates: list[tuple[str, str, dict[str, str], Decimal, Decimal | None]] = []
    for attributes, price, cost_price in items:
        name = build_name(scheme.base_name, scheme.attribute_keys, attributes)
        sku = build_sku(scheme.sku_prefix, scheme.attribute_keys, attributes)
        candidates.append((name, sku, attributes, price, cost_price))

    taken = await existing_skus(session, tenant_id, [sku for _, sku, _, _, _ in candidates])
    # Guard against the same SKU appearing twice inside one request too — two
    # attribute sets can abbreviate to the same segments.
    seen: set[str] = set()

    repo = ProductRepository(session)
    created: list[Product] = []
    skipped: list[str] = []

    for name, sku, attributes, price, cost_price in candidates:
        if sku in taken or sku in seen:
            skipped.append(sku)
            continue
        seen.add(sku)

        product_id = generate_uuid7()
        payload: dict[str, object] = {
            "id": str(product_id),
            "name": name,
            "sku": sku,
            "price": str(price),
            "cost_price": str(cost_price) if cost_price is not None else None,
            "status": ProductStatus.ACTIVE.value,
            "product_type": ProductType.VARIANT.value,
            "attributes": attributes,
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
        created.append(product)

    await session.commit()
    return created, skipped
