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
from app.products.image_service import primary_image_map
from app.products.models import (
    PIECES_PER_UNIT,
    Category,
    ConfigurableDefinition,
    ConfigurablePrice,
    ConfigurableRecipeLine,
    Product,
    ProductStatus,
    ProductType,
)
from app.shared.core.exceptions import AppError, NotFoundError


def motif_binding(line: ConfigurableRecipeLine) -> tuple[str, dict[str, str]] | None:
    """Which product attribute a recipe line binds to the motif axis.

    A line "Motif" with attributes {"model": "@motif", "diameter": "28"} binds
    the till's motif choice to the product's ``model`` attribute. Returns
    ``(attribute_key, fixed_attributes)`` — the two things needed to derive
    which motifs actually exist on the shelf. ``None`` when the line does not
    reference the motif at all.
    """
    attributes = line.attributes or {}
    bound_key = next((key for key, value in attributes.items() if value == "@motif"), None)
    if bound_key is None:
        return None
    fixed = {key: value for key, value in attributes.items() if not value.startswith("@")}
    return bound_key, fixed


async def _catalogue_motif_options(
    session: AsyncSession, tenant_id: UUID, recipe: list[ConfigurableRecipeLine]
) -> list[str] | None:
    """The motif choices that actually exist in the catalogue.

    The till's motif axis offers exactly the products the recipe's "@motif"
    binding can resolve, so the cashier can never pick a motif whose product is
    missing ("le produit motif 28 cristal k19 doit exister"). Returns ``None``
    when no recipe line binds the motif (a fixed motif, or no motif axis), in
    which case the stored options stand untouched.
    """
    values: set[str] = set()
    bound_any = False
    for line in recipe:
        binding = motif_binding(line)
        if binding is None:
            continue
        bound_any = True
        bound_key, fixed = binding
        query = select(Product).where(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.status == ProductStatus.ACTIVE,
            Product.product_type.in_([ProductType.VARIANT, ProductType.SIMPLE]),
        )
        if line.category_id is not None:
            query = query.where(Product.category_id == line.category_id)
        else:
            # No category means the family is what the line is called: "Motif"
            # matches "Motif 28 Cristal" but not a "Tube 28 …" or a support,
            # whose models would otherwise leak into the motif picker.
            prefix = (line.label or "").strip()
            if prefix:
                query = query.where(Product.name.ilike(f"{prefix}%"))
        if fixed:
            query = query.where(Product.attributes.contains(fixed))
        products = (await session.execute(query)).scalars().all()
        for product in products:
            value = (product.attributes or {}).get(bound_key)
            if value:
                values.add(value)
    if not bound_any:
        return None
    return sorted(values)


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
        category_names = {category.id: category.name for category in categories.scalars().all()}

    # The motif axis is the catalogue: values are the motif products that
    # exist, so the till offers exactly what can be resolved. Stored values
    # are ignored for this axis (they were hand-typed and can drift from
    # reality); every other axis still comes from the definition.
    options = dict(definition.options or {})
    motif_options = await _catalogue_motif_options(session, tenant_id, recipe)
    if motif_options is not None:
        options["motif"] = motif_options

    return ConfigurableDefinitionRead(
        product_id=product.id,
        name=product.name,
        sku=product.sku,
        color_key=definition.color_key,
        length_key=definition.length_key,
        options=options,
        prices=[
            ConfigurablePriceRead(length=price.length, price=str(price.price)) for price in prices
        ],
        recipe=[
            ConfigurableRecipeLineRead(
                label=line.label,
                category_id=line.category_id,
                category_name=category_names.get(line.category_id) if line.category_id else None,
                attributes=line.attributes or {},
                quantity=line.quantity,
                quantity_by_length=line.quantity_by_length or {},
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
        raise AppError("Recipe labels must be unique", error_code="configurable_dup_recipe_label")
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
    priced_lengths = [price.length for price in data.prices]
    for line in data.recipe:
        for value in line.attributes.values():
            if value.startswith("@") and value[1:] not in known_axes:
                raise AppError(
                    f'Recipe line "{line.label}" references unknown axis "{value[1:]}"',
                    error_code="configurable_unknown_axis",
                )
        for length, quantity in (line.quantity_by_length or {}).items():
            if length not in priced_lengths:
                raise AppError(
                    f'Recipe line "{line.label}" overrides quantity for unknown length "{length}"',
                    error_code="configurable_unknown_length_override",
                )
            if int(quantity) <= 0:
                raise AppError(
                    f'Recipe line "{line.label}" needs a quantity greater than zero at "{length}"',
                    error_code="configurable_invalid_quantity_override",
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
    # The replacements reuse the same (product, length) unique keys, so the
    # deletes must hit the DB before the inserts. SQLAlchemy's unit of work
    # would otherwise INSERT the new rows first (the `_load_recipe` query
    # below autoflushes them) and trip the unique constraint, 500-ing an
    # edit of an existing definition.
    await session.flush()
    for input_price in data.prices:
        session.add(
            ConfigurablePrice(
                tenant_id=tenant_id,
                configurable_product_id=product_id,
                length=input_price.length,
                price=input_price.price,
            )
        )

    existing_recipe = await _load_recipe(session, tenant_id, product_id)
    for existing_line in existing_recipe:
        await session.delete(existing_line)
    await session.flush()
    for recipe_line in data.recipe:
        session.add(
            ConfigurableRecipeLine(
                tenant_id=tenant_id,
                configurable_product_id=product_id,
                label=recipe_line.label,
                category_id=recipe_line.category_id,
                attributes=recipe_line.attributes,
                quantity=recipe_line.quantity,
                quantity_by_length=recipe_line.quantity_by_length,
                unit=recipe_line.unit,
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
    recipe = await _load_recipe(session, tenant_id, product_id)
    if not recipe:
        raise AppError(
            f"{product.name} has no recipe, so it cannot be configured yet",
            error_code="configurable_no_recipe",
        )

    # Validate against the same derived motif options the till was offered, so
    # a motif that no longer exists on the shelf fails loudly here instead of
    # resolving an empty recipe.
    options = dict(definition.options or {})
    motif_options = await _catalogue_motif_options(session, tenant_id, recipe)
    if motif_options is not None:
        options["motif"] = motif_options
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
        available_lengths = ", ".join(entry.length for entry in prices) or "none"
        raise AppError(
            f'Unknown length "{length_value}" (available: {available_lengths})',
            error_code="configurable_unknown_length",
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
        # A length override can change the quantity (a triangle at 4m takes a
        # third support), so both the pieces deducted and the build count use
        # the effective quantity for the chosen length.
        quantity = line.effective_quantity(length_value)
        pieces = quantity * PIECES_PER_UNIT[line.unit]
        on_hand = available.get(component.id, 0) if warehouse_id is not None else 0
        builds = on_hand // pieces if pieces > 0 else 0
        builds_per_line.append(builds)
        lines.append(
            ConfigurableResolvedLine(
                label=line.label,
                component_product_id=component.id,
                name=component.name,
                sku=component.sku,
                quantity=quantity,
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


async def delete_definition(session: AsyncSession, tenant_id: UUID, product_id: UUID) -> None:
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

    images = await primary_image_map(session, tenant_id, [product.id for product in products])

    return [
        ConfigurableListItem(
            product_id=product.id,
            name=product.name,
            sku=product.sku,
            category_id=product.category_id,
            price_from=(
                str(price_by_product[product.id])
                if price_by_product.get(product.id) is not None
                else None
            ),
            has_definition=product.id in recipe_product_ids,
            image_url=images.get(product.id),
        )
        for product in products
    ]
