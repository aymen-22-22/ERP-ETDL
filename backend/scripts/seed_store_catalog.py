"""Seed the store's real category tree for a tenant.

Usage:
    python scripts/seed_store_catalog.py <tenant_id>

Idempotent: a category is matched on (tenant_id, name, parent_id) — the same
key as the table's unique constraint — so re-running only fills in what's
missing and never duplicates. Safe to run against a tenant that already has
categories; existing ones are left exactly as they are.

This is a script rather than a data migration because categories are
tenant-scoped: a migration runs once for the whole database and has no way to
know which tenants should get this particular catalog.
"""

import asyncio
import sys
from pathlib import Path
from uuid import UUID

# Python puts the *script's* directory on sys.path, not the working directory,
# so `python scripts/seed_store_catalog.py` from backend/ would fail to import
# `app`. Adding the backend root explicitly makes the script work however it is
# invoked — as a path, as `python -m scripts.seed_store_catalog`, or from any cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.products.models import Category, CategoryVariantScheme  # noqa: E402
from app.shared.database.session import async_session_factory  # noqa: E402

# (name, [children]). Order here becomes sort_order, so the tree renders in
# the same order the business thinks about it.
CATEGORY_TREE: list[tuple[str, list[tuple[str, list[str]]]]] = [
    (
        "Lucter",
        [
            ("Une seule lampe", []),
            ("Deux lampes", []),
            ("Trois / Cinq lampes", []),
            ("LED", []),
        ],
    ),
    (
        "Triangle",
        [
            ("Triangle Extensible", []),
            ("Triangle Fix", []),
            (
                "Accessoires",
                [
                    "Motif",
                    "Motif Cristal",
                    "Support Simple",
                    "Support Cristal",
                    "Bouchon",
                ],
            ),
            ("Tubes", ["Tube 28mm", "Tube 19mm"]),
            ("La Raile", []),
        ],
    ),
    (
        "Meuble",
        [
            ("Porte Chaussure", []),
            ("Porte Manteau", []),
            ("Tables", []),
            ("Porte Clé", []),
        ],
    ),
    (
        "Décoration",
        [
            ("Montres", []),
            ("Veilleuses", []),
            ("Cadres", []),
            ("Plus", []),
        ],
    ),
]


# Naming rules for the six categories whose products are generated rather than
# typed. Keyed by the category's path so the script can resolve it to an id.
#
#   (base_name, sku_prefix, ordered attribute keys, suggested values)
#
# The suggested values are only what the examples confirmed — staff can add
# more from the UI without a migration, so an incomplete list here is not a
# blocker, it just means one extra typed value the first time.
VARIANT_SCHEMES: dict[tuple[str, ...], tuple[str, str, list[str], dict[str, list[str]]]] = {
    ("Triangle", "Tubes", "Tube 28mm"): (
        "Tube",
        "TUB",
        ["diameter", "length", "model", "color"],
        {
            "diameter": ["28"],
            "length": ["2m", "4m"],
            "model": ["Torsadi", "Liss"],
            "color": ["Argent", "Dorre"],
        },
    ),
    ("Triangle", "Tubes", "Tube 19mm"): (
        "Tube",
        "TUB",
        ["diameter", "length", "model", "color"],
        {
            "diameter": ["19"],
            "length": ["2m", "4m"],
            "model": ["Torsadi", "Liss"],
            "color": ["Argent", "Dorre"],
        },
    ),
    ("Triangle", "Accessoires", "Motif"): (
        "Motif",
        "MOT",
        ["diameter", "color", "model"],
        {"diameter": ["19", "28"], "color": ["Argent", "Dorre"], "model": []},
    ),
    ("Triangle", "Accessoires", "Motif Cristal"): (
        "Motif Cristal",
        "MOTC",
        ["diameter", "color", "model"],
        {"diameter": ["19", "28"], "color": ["Argent", "Dorre"], "model": ["K19"]},
    ),
    ("Triangle", "Accessoires", "Support Simple"): (
        "Support",
        "SUP",
        ["model", "color", "size"],
        {
            "model": ["Liss"],
            "color": ["Argent", "Dorre"],
            "size": ["19mm", "19/19mm"],
        },
    ),
    ("Triangle", "Accessoires", "Support Cristal"): (
        "Support",
        "SUPC",
        ["model", "color", "size"],
        {
            "model": ["Cristal"],
            "color": ["Argent", "Dorre"],
            "size": ["19/19mm", "28/19"],
        },
    ),
    ("Triangle", "Accessoires", "Bouchon"): (
        "Bouchon",
        "BOU",
        ["color", "size"],
        {"color": ["Argent", "Dorre"], "size": ["19mm", "28mm"]},
    ),
}


async def _get_or_create(
    session: AsyncSession,
    tenant_id: UUID,
    name: str,
    parent_id: UUID | None,
    sort_order: int,
    created: list[str],
    skipped: list[str],
) -> UUID:
    """Return the id of the category, creating it only when absent."""
    existing = await session.execute(
        select(Category).where(
            Category.tenant_id == tenant_id,
            Category.name == name,
            Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id,
            Category.deleted_at.is_(None),
        )
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        skipped.append(name)
        return row.id

    category = Category(
        tenant_id=tenant_id,
        name=name,
        parent_id=parent_id,
        sort_order=sort_order,
    )
    session.add(category)
    await session.flush()
    created.append(name)
    return category.id


async def _seed_scheme(
    session: AsyncSession,
    tenant_id: UUID,
    category_id: UUID,
    base_name: str,
    sku_prefix: str,
    attribute_keys: list[str],
    allowed_values: dict[str, list[str]],
    created: list[str],
    skipped: list[str],
) -> None:
    existing = await session.execute(
        select(CategoryVariantScheme).where(
            CategoryVariantScheme.tenant_id == tenant_id,
            CategoryVariantScheme.category_id == category_id,
            CategoryVariantScheme.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none() is not None:
        skipped.append(f"scheme {base_name} ({sku_prefix})")
        return

    session.add(
        CategoryVariantScheme(
            tenant_id=tenant_id,
            category_id=category_id,
            base_name=base_name,
            sku_prefix=sku_prefix,
            attribute_keys=attribute_keys,
            allowed_values=allowed_values,
        )
    )
    await session.flush()
    created.append(f"scheme {base_name} ({sku_prefix})")


async def seed(tenant_id: UUID) -> None:
    created: list[str] = []
    skipped: list[str] = []
    # Category path -> id, so the variant schemes can find their category.
    by_path: dict[tuple[str, ...], UUID] = {}

    async with async_session_factory() as session:
        # `categories` has FORCE ROW LEVEL SECURITY, so the tenant GUC must be
        # set before any read or write — otherwise every query sees nothing and
        # every insert is rejected by the policy.
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
            {"tenant_id": str(tenant_id)},
        )

        for top_order, (top_name, children) in enumerate(CATEGORY_TREE, start=1):
            top_id = await _get_or_create(
                session, tenant_id, top_name, None, top_order, created, skipped
            )
            by_path[(top_name,)] = top_id

            for child_order, (child_name, grandchildren) in enumerate(children, start=1):
                child_id = await _get_or_create(
                    session, tenant_id, child_name, top_id, child_order, created, skipped
                )
                by_path[(top_name, child_name)] = child_id

                for gc_order, gc_name in enumerate(grandchildren, start=1):
                    gc_id = await _get_or_create(
                        session, tenant_id, gc_name, child_id, gc_order, created, skipped
                    )
                    by_path[(top_name, child_name, gc_name)] = gc_id

        for path, (base, prefix, keys, values) in VARIANT_SCHEMES.items():
            category_id = by_path.get(path)
            if category_id is None:
                print(f"  ! no category for path {' > '.join(path)}, scheme skipped")
                continue
            await _seed_scheme(
                session,
                tenant_id,
                category_id,
                base,
                prefix,
                keys,
                values,
                created,
                skipped,
            )

        await session.commit()

    print(f"created: {len(created)}")
    for name in created:
        print(f"  + {name}")
    print(f"already present, left alone: {len(skipped)}")
    for name in skipped:
        print(f"  = {name}")


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
