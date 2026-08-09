"""Configurable products: definitions, price-per-length, and configuration
resolution.

A configurable product ("Triangle Double 28/19 F2-F3-F4") holds no stock of
its own, like a KIT. The difference is that *whoever rings it up* picks the
concrete variant: support (F2/F3/F4), motif, length and colour, each of which
decides something:

  * length        -> the selling price (``configurable_prices``) and the tube's
                     resolved length;
  * support/motif -> which component pattern resolves to which real product;
  * colour        -> applied to every component, because the shop chooses it
                     once and expects a whole triangle of that colour.

Resolution turns a recipe of *patterns* (category + attribute match, with
"@axis" placeholders for the till's choices) into concrete products, then
computes price and buildability — the two things the till needs to show
before the cashier commits.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import ProductStockSnapshot
from app.products.configurable_schemas import (
    ConfigurableDefinitionInput,
    ConfigurableDefinitionRead,
    ConfigurableListItem,
    ConfigurablePriceRead,
    ConfigurableRecipeLineRead,
    ConfigurableResolvedLine,
    ConfigurableResolveRequest,
    ConfigurableResolveResult,
)
from app.products.models import (
    Category,
    ConfigurableDefinition,
    ConfigurablePrice,
    ConfigurableRecipeLine,
    Product,
    ProductStatus,
    ProductType,
)
from app.shared.core.exceptions import AppError, NotFoundError


def substitute_attributes(
    attributes: dict[str, str], configuration: dict[str, str]
) -> dict[str, str]:
    """Fill "@axis" placeholders from the till's configuration.

    {"model": "@support", "size": "28/19"} with configuration
    {"support": "F3"} resolves to {"model": "F3", "size": "28/19"}. A
    placeholder naming an axis the configuration doesn't carry is left as-is;
    the resolution query simply won't match a product on it, which fails
    loudly instead of silently over-matching.
    """
    resolved: dict[str, str] = {}
    for key, value in attributes.items():
        if value.startswith("@") and value[1:] in configuration:
            resolved[key] = configuration[value[1:]]
        else:
            resolved[key] = value
    return resolved


def build_display_name(
    name: str,
    options: dict[str, list[str]],
    color_key: str,
    length_key: str,
    configuration: dict[str, str],
) -> str:
    """The sale-line description, e.g. "Triangle Double 28/19 F3 GD 4m".

    Structure options first (support), then colour, then length — the order
    the shop reads a triangle in. Axes with a single allowed value (a fixed
    motif, say) are skipped: they are part of the product's identity, not of
    the choice being described.
    """
    parts = [name]
    for key, values in options.items():
        if key in (color_key, length_key) or len(values) <= 1:
            continue
        value = configuration.get(key)
        if value:
            parts.append(value)
    for key in (color_key, length_key):
        value = configuration.get(key)
        if value:
            parts.append(value)
    return " ".join(parts)


async def _require_configurable(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> Product:
    result = await session.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
        )
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product not found")
    if product.product_type != ProductType.CONFIGURABLE:
        raise AppError(
            "Only configurable products have a configuration definition",
            error_code="product_not_configurable",
        )
    return product


async def _load_definition(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> ConfigurableDefinition:
    result = await session.execute(
        select(ConfigurableDefinition).where(
            ConfigurableDefinition.tenant_id == tenant_id,
            ConfigurableDefinition.product_id == product_id,
            ConfigurableDefinition.deleted_at.is_(None),
        )
    )
    definition = result.scalar_one_or_none()
    if definition is None:
        raise AppError(
            "This product has no configuration defined yet",
            error_code="configurable_no_definition",
        )
    return definition


async def _load_prices(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> list[ConfigurablePrice]:
    result = await session.execute(
        select(ConfigurablePrice)
        .where(
            ConfigurablePrice.tenant_id == tenant_id,
            ConfigurablePrice.configurable_product_id == product_id,
            ConfigurablePrice.deleted_at.is_(None),
        )
        .order_by(ConfigurablePrice.length)
    )
    return list(result.scalars().all())


async def _load_recipe(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> list[ConfigurableRecipeLine]:
    result = await session.execute(
        select(ConfigurableRecipeLine)
        .where(
            ConfigurableRecipeLine.tenant_id == tenant_id,
            ConfigurableRecipeLine.configurable_product_id == product_id,
            ConfigurableRecipeLine.deleted_at.is_(None),
        )
        .order_by(ConfigurableRecipeLine.label)
    )
    return list(result.scalars().all())


async def get_definition(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> ConfigurableDefinitionRead:
    product = await _require_configurable(session, tenant_id, product_id)
    definition = await _load_definition(session, tenant_id, product_id)
    prices = await _load_prices(session, tenant_id, product_id)
    recipe = await _load_recipe(session, tenant_id, product_id)

    category_ids = {line.category_id for line in recipe if line.category_id is not None}
    category_names: dict[UUID, str] = {}
    if category_ids:
        categories = await session.execute(
            select(Category).where(Category.id.in_(list(category_ids)))
        )
        category_names = {
            category.id: category.name for category in categories.scalars().all()
        }

    return ConfigurableDefinitionRead(
        product_id=product.id,
        name=product.name,
        sku=product.sku,
        color_key=definition.color_key,
        length_key=definition.length_key,
        options=definition.options or {},
        prices=[
            ConfigurablePriceRead(length=price.length, price=str(price.price))
            for price in prices
        ],
        recipe=[
            ConfigurableRecipeLineRead(
                label=line.label,
                category_id=line.category_id,
                category_name=category_names.get(line.category_id) if line.category_id else None,
                attributes=line.attributes or {},
                quantity=line.quantity,
                unit=line.unit,
                pieces_required=line.pieces_required,
            )
            for line in recipe
        ],
    )


async def save_definition(
    session: AsyncSession,
    tenant_id: UUID,
    product_id: UUID,
    data: ConfigurableDefinitionInput,
) -> ConfigurableDefinitionRead:
    """Create or replace the product's whole definition.

    Prices and recipe are replaced as a unit (the editor works on the whole
    definition on one screen), mirroring how a kit's BOM is edited. The
    product row itself is not touched here — creating a CONFIGURABLE product
    is the normal product flow, this just gives it meaning.
    """
    await _require_configurable(session, tenant_id, product_id)

    lengths = [price.length for price in data.prices]
    if len(set(lengths)) != len(lengths):
        raise AppError("Each length can only have one price", error_code="configurable_dup_length")
    labels = [line.label for line in data.recipe]
    if len(set(labels)) != len(labels):
        raise AppError(
            "Recipe labels must be unique", error_code="configurable_dup_recipe_label"
        )
    if data.length_key in data.options:
        raise AppError(
            "The length axis is priced per length; it cannot also be an option",
            error_code="configurable_length_is_option",
        )
    if data.color_key not in data.options:
        raise AppError(
            "The color axis needs allowed values so the till can offer them",
            error_code="configurable_color_missing",
        )

    known_axes = set(data.options) | {data.length_key}
    for line in data.recipe:
        for value in line.attributes.values():
            if value.startswith("@") and value[1:] not in known_axes:
                raise AppError(
                    f'Recipe line "{line.label}" references unknown axis "{value[1:]}"',
                    error_code="configurable_unknown_axis",
                )
        if line.category_id is not None:
            category = await session.get(Category, line.category_id)
            if category is None or category.tenant_id != tenant_id or category.deleted_at:
                raise NotFoundError(f"Category not found: {line.category_id}")

    definition_result = await session.execute(
        select(ConfigurableDefinition).where(
            ConfigurableDefinition.tenant_id == tenant_id,
            ConfigurableDefinition.product_id == product_id,
        )
    )
    definition = definition_result.scalar_one_or_none()
    if definition is None:
        definition = ConfigurableDefinition(tenant_id=tenant_id, product_id=product_id)
        session.add(definition)
    definition.color_key = data.color_key
    definition.length_key = data.length_key
    definition.options = data.options
    await session.flush()

    existing_prices = await _load_prices(session, tenant_id, product_id)
    for price in existing_prices:
        await session.delete(price)
    for price in data.prices:
        session.add(
            ConfigurablePrice(
                tenant_id=tenant_id,
                configurable_product_id=product_id,
                length=price.length,
                price=price.price,
            )
        )

    existing_recipe = await _load_recipe(session, tenant_id, product_id)
    for line in existing_recipe:
        await session.delete(line)
    for line in data.recipe:
        session.add(
            ConfigurableRecipeLine(
                tenant_id=tenant_id,
                configurable_product_id=product_id,
                label=line.label,
                category_id=line.category_id,
                attributes=line.attributes,
                quantity=line.quantity,
                unit=line.unit,
            )
        )

    await session.commit()
    return await get_definition(session, tenant_id, product_id)


async def resolve_configuration(
    session: AsyncSession,
    tenant_id: UUID,
    product_id: UUID,
    data: ConfigurableResolveRequest,
    warehouse_id: UUID | None = None,
) -> ConfigurableResolveResult:
    product = await _require_configurable(session, tenant_id, product_id)
    definition = await _load_definition(session, tenant_id, product_id)
    options = definition.options or {}
    configuration = dict(data.configuration)

    missing = [key for key in options if key not in configuration]
    if missing:
        raise AppError(
            "Missing configuration values: " + ", ".join(sorted(missing)),
            error_code="configurable_missing_values",
        )
    for key, values in options.items():
        value = configuration.get(key)
        if value not in values:
            raise AppError(
                f'"{value}" is not a valid {key} (choose from {", ".join(values)})',
                error_code="configurable_invalid_value",
            )

    prices = await _load_prices(session, tenant_id, product.id)
    length_value = configuration.get(definition.length_key)
    price = next((entry for entry in prices if entry.length == length_value), None)
    if price is None:
        available = ", ".join(entry.length for entry in prices) or "none"
        raise AppError(
            f'Unknown length "{length_value}" (available: {available})',
            error_code="configurable_unknown_length",
        )

    recipe = await _load_recipe(session, tenant_id, product.id)
    if not recipe:
        raise AppError(
            f"{product.name} has no recipe, so it cannot be configured yet",
            error_code="configurable_no_recipe",
        )

    # Resolve every pattern to exactly one concrete product.
    resolved: list[tuple[ConfigurableRecipeLine, Product]] = []
    for line in recipe:
        match = substitute_attributes(line.attributes or {}, configuration)
        if line.category_id is None and not match:
            raise AppError(
                f'Recipe line "{line.label}" has nothing to match a product on',
                error_code="configurable_unmatchable_line",
            )
        query = select(Product).where(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.status == ProductStatus.ACTIVE,
            Product.product_type.in_([ProductType.VARIANT, ProductType.SIMPLE]),
            Product.attributes.contains(match),
        )
        if line.category_id is not None:
            query = query.where(Product.category_id == line.category_id)
        found = (await session.execute(query)).scalars().all()
        if not found:
            raise AppError(
                f'Recipe line "{line.label}" matched no product for '
                f"{', '.join(f'{k}={v}' for k, v in match.items())}",
                error_code="configurable_no_component",
            )
        if len(found) > 1:
            raise AppError(
                f'Recipe line "{line.label}" is ambiguous — {len(found)} products '
                f"match {', '.join(f'{k}={v}' for k, v in match.items())}",
                error_code="configurable_ambiguous_component",
            )
        resolved.append((line, found[0]))

    component_ids = [product.id for _, product in resolved]
    available: dict[UUID, int] = {}
    if warehouse_id is not None and component_ids:
        snapshots = await session.execute(
            select(ProductStockSnapshot).where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == warehouse_id,
                ProductStockSnapshot.product_id.in_(component_ids),
            )
        )
        available = {
            snapshot.product_id: snapshot.available_quantity
            for snapshot in snapshots.scalars().all()
        }

    lines: list[ConfigurableResolvedLine] = []
    builds_per_line: list[int] = []
    for line, component in resolved:
        pieces = line.pieces_required
        on_hand = available.get(component.id, 0) if warehouse_id is not None else 0
        builds = on_hand // pieces if pieces > 0 else 0
        builds_per_line.append(builds)
        lines.append(
            ConfigurableResolvedLine(
                label=line.label,
                component_product_id=component.id,
                name=component.name,
                sku=component.sku,
                quantity=line.quantity,
                unit=line.unit,
                pieces_required=pieces,
                available=on_hand,
                builds=builds,
            )
        )

    return ConfigurableResolveResult(
        product_id=product.id,
        name=product.name,
        display_name=build_display_name(
            product.name, options, definition.color_key, definition.length_key, configuration
        ),
        price=str(price.price),
        configuration=configuration,
        lines=lines,
        buildable=min(builds_per_line) if builds_per_line else 0,
    )


async def delete_definition(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> None:
    """Remove the product's configuration (soft-delete the whole definition).

    The product stays a CONFIGURABLE row — this just makes it unconfigured,
    i.e. unsellable, until a definition is saved again. Deleting the product
    itself is the normal product flow.
    """
    await _require_configurable(session, tenant_id, product_id)

    definition_result = await session.execute(
        select(ConfigurableDefinition).where(
            ConfigurableDefinition.tenant_id == tenant_id,
            ConfigurableDefinition.product_id == product_id,
        )
    )
    for definition in definition_result.scalars().all():
        definition.deleted_at = datetime.now(UTC)

    for price in await _load_prices(session, tenant_id, product_id):
        price.deleted_at = datetime.now(UTC)
    for line in await _load_recipe(session, tenant_id, product_id):
        line.deleted_at = datetime.now(UTC)

    await session.commit()


async def list_configurable_products(
    session: AsyncSession, tenant_id: UUID
) -> list[ConfigurableListItem]:
    """Every configurable product with the lowest length price and whether it
    is actually configured yet — the two things the till and the admin list
    need before a configuration is chosen."""
    products_result = await session.execute(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.product_type == ProductType.CONFIGURABLE,
            Product.deleted_at.is_(None),
        )
    )
    products = list(products_result.scalars().all())
    if not products:
        return []

    prices_result = await session.execute(
        select(ConfigurablePrice).where(
            ConfigurablePrice.tenant_id == tenant_id,
            ConfigurablePrice.configurable_product_id.in_([p.id for p in products]),
            ConfigurablePrice.deleted_at.is_(None),
        )
    )
    price_by_product: dict[UUID, Decimal | None] = {}
    for price in prices_result.scalars().all():
        current = price_by_product.get(price.configurable_product_id)
        if current is None or price.price < current:
            price_by_product[price.configurable_product_id] = price.price

    recipe_result = await session.execute(
        select(ConfigurableRecipeLine.configurable_product_id).where(
            ConfigurableRecipeLine.tenant_id == tenant_id,
            ConfigurableRecipeLine.configurable_product_id.in_([p.id for p in products]),
            ConfigurableRecipeLine.deleted_at.is_(None),
        )
    )
    recipe_product_ids = {row[0] for row in recipe_result.all()}

    return [
        ConfigurableListItem(
            product_id=product.id,
            name=product.name,
            sku=product.sku,
            category_id=product.category_id,
            price_from=str(price_by_product[product.id])
            if price_by_product.get(product.id) is not None
            else None,
            has_definition=product.id in recipe_product_ids,
        )
        for product in products
    ]
