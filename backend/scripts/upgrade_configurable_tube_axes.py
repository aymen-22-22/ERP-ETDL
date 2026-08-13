"""One-time upgrade: make existing configurable definitions offer a tube model
choice at the till.

Older definitions (created by hand, or seeded before the per-rail tube feature)
bind a tube recipe line's ``model`` attribute to a fixed value ("Liss"), so the
till resolves every triangle to that one model and never offers a choice. This
script rewrites each tube line to bind ``model -> @tube{diameter}`` and ensures
the definition carries a ``tube{diameter}`` axis — the till then derives the
offered models from the catalogue (exactly what the shop actually stocks), per
rail diameter.

It only rewrites ``configurable_definitions`` / ``configurable_recipe_lines``.
No product, stock, movement or sale is touched, and a line already bound to a
per-rail axis is left alone.

Usage:
    python scripts/upgrade_configurable_tube_axes.py <tenant_id>
"""

import asyncio
import re
import sys
from pathlib import Path
from uuid import UUID

# Same trick as seed_prod_catalog.py: make the backend root importable no
# matter how this script is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.products.models import (  # noqa: E402
    Category,
    ConfigurableDefinition,
    ConfigurableRecipeLine,
)
from app.shared.database.session import async_session_factory  # noqa: E402


def _tube_diameter(category_name: str | None, label: str) -> str | None:
    """The rail diameter for a tube line: "Tube 28mm" category -> "28".

    The label is the fallback for lines without a category ("Tube 28").
    """
    if category_name:
        match = re.search(r"(\d+)\s*mm", category_name)
        if match:
            return match.group(1)
    match = re.search(r"(\d+)", label)
    return match.group(1) if match else None


def _is_tube_line(label: str, category_name: str | None) -> bool:
    return label.strip().lower().startswith("tube") or (
        category_name is not None
        and re.match(r"tube\s*\d+\s*mm", category_name, re.IGNORECASE) is not None
    )


async def _upgrade_definition(
    session: AsyncSession, tenant_id: UUID, definition: ConfigurableDefinition
) -> bool:
    """Rewrite one definition's tube lines to per-rail axes. Returns whether
    anything changed."""
    lines = (
        (
            await session.execute(
                select(ConfigurableRecipeLine).where(
                    ConfigurableRecipeLine.tenant_id == tenant_id,
                    ConfigurableRecipeLine.configurable_product_id == definition.product_id,
                    ConfigurableRecipeLine.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not lines:
        return False

    category_ids = {line.category_id for line in lines if line.category_id is not None}
    category_names: dict[UUID, str] = {}
    if category_ids:
        categories = await session.execute(
            select(Category).where(Category.id.in_(list(category_ids)))
        )
        category_names = {category.id: category.name for category in categories.scalars().all()}

    options = dict(definition.options or {})
    definition_changed = False

    for line in lines:
        if not _is_tube_line(line.label, category_names.get(line.category_id)):
            continue
        attributes = dict(line.attributes or {})
        current = attributes.get("model")
        if current == "@" or (current or "").startswith("@"):
            # Already bound to an axis. Only the legacy single "tube" axis is
            # rewritten — a per-rail "@tube28" is already what we want.
            if current == "@tube":
                diameter = _tube_diameter(category_names.get(line.category_id), line.label)
                if diameter is None:
                    continue
                axis = f"tube{diameter}"
                attributes["model"] = f"@{axis}"
                line.attributes = attributes
                options.setdefault(axis, [])
                definition_changed = True
            continue
        # A fixed model ("Liss", "Torsadi", "Sculpté", ...) — bind it to the
        # per-rail axis instead so the till offers a real choice.
        diameter = _tube_diameter(category_names.get(line.category_id), line.label)
        if diameter is None:
            continue
        axis = f"tube{diameter}"
        attributes["model"] = f"@{axis}"
        line.attributes = attributes
        options.setdefault(axis, [])
        definition_changed = True

    if definition_changed:
        # Drop the legacy single "tube" axis now that every tube line binds a
        # per-rail axis (it would otherwise show a duplicate "Tube" step).
        recipe_binds_legacy_tube = any(
            (line.attributes or {}).get("model") == "@tube"
            for line in lines
            if _is_tube_line(line.label, category_names.get(line.category_id))
        )
        if not recipe_binds_legacy_tube:
            options.pop("tube", None)
        definition.options = options

    return definition_changed


async def upgrade(tenant_id: UUID) -> None:
    async with async_session_factory() as session:
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
            {"tenant_id": str(tenant_id)},
        )

        definitions = (
            (
                await session.execute(
                    select(ConfigurableDefinition).where(
                        ConfigurableDefinition.tenant_id == tenant_id,
                        ConfigurableDefinition.deleted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )

        changed: list[str] = []
        for definition in definitions:
            if await _upgrade_definition(session, tenant_id, definition):
                changed.append(str(definition.product_id))

        await session.commit()

    print(f"definitions checked: {len(definitions)}")
    print(f"definitions updated: {len(changed)}")
    if changed:
        print("product ids:")
        for product_id in changed:
            print(f"  - {product_id}")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/upgrade_configurable_tube_axes.py <tenant_id>")
        sys.exit(1)
    tenant_id = UUID(sys.argv[1])
    asyncio.run(upgrade(tenant_id))


if __name__ == "__main__":
    main()
