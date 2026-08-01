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
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import Category
from app.shared.database.session import async_session_factory

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


async def seed(tenant_id: UUID) -> None:
    created: list[str] = []
    skipped: list[str] = []

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

            for child_order, (child_name, grandchildren) in enumerate(children, start=1):
                child_id = await _get_or_create(
                    session, tenant_id, child_name, top_id, child_order, created, skipped
                )

                for gc_order, gc_name in enumerate(grandchildren, start=1):
                    await _get_or_create(
                        session, tenant_id, gc_name, child_id, gc_order, created, skipped
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
