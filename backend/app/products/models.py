import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.mixins import SyncableMixin, TenantScopedAuditMixin
from app.shared.database.session import Base


class ProductStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class ProductType(StrEnum):
    """How a product behaves for stock and pricing.

    ``SIMPLE``  — one SKU, one price, its own per-warehouse stock. The default,
                  and what every product created before this column existed is.

    ``VARIANT`` — one generated combination of a category's attribute axes
                  (e.g. "Tube 28 2m Torsadi Argent"). It is a full product row
                  with its own SKU, price and stock; ``Product.attributes``
                  holds the axis values it was generated from. Deliberately not
                  a separate entity: a variant *is* what the business sells and
                  counts, so making it a product means inventory, transfers and
                  the POS need no variant-awareness at all.

    ``KIT``     — assembled from components and sold as a single line, but holds
                  **no stock of its own**. Selling one deducts its bill of
                  materials from the selling warehouse instead (see the
                  ``product_bom_lines`` table).

    ``CONFIGURABLE``
                — the shop configures it at the till (support/motif/length/
                  colour), and the configuration determines both the price and
                  the components taken off the shelf. Like a KIT it holds no
                  stock of its own: selling one deducts the resolved recipe
                  from the selling warehouse, never a "triangle" count. The
                  recipe is defined once per product as component *patterns*
                  (category + attribute match + colour) and resolved against
                  the real variant products when a configuration is picked
                  (see the ``configurable_definitions`` / ``configurable_prices``
                  / ``configurable_recipe_lines`` tables).
    """

    SIMPLE = "simple"
    VARIANT = "variant"
    KIT = "kit"
    CONFIGURABLE = "configurable"


class Category(TenantScopedAuditMixin, Base):
    """Hierarchical product category. `parent_id` is a self-reference; a NULL
    parent is a top-level category. Depth is not constrained at the DB level.
    """

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "parent_id", name="uq_categories_tenant_name_parent"),
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), index=True, default=None
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500), default=None)


class CategoryVariantScheme(TenantScopedAuditMixin, Base):
    """Rules for auto-generating VARIANT products inside one category.

    The business names parts by a strict formula so staff never type a name by
    hand, and the formula differs per category:

        Tubes    [Base] [Diameter] [Length] [Model] [Color]
        Motifs   [Base] [Diameter] [Color]  [Model]
        Supports [Base] [Model]    [Color]  [Size]
        Bouchons [Base] [Color]    [Size]

    All four are the same rule — *base name, then the axis values in a fixed
    order* — so rather than four hard-coded formulas this stores the order as
    `attribute_keys` and joins on it. Adding a fifth family is then data, not
    code.

    `allowed_values` seeds the pickers in the UI ({"color": ["Argent",
    "Dorre"]}); it is a convenience, not a constraint, so staff can add a
    colour without a migration.
    """

    __tablename__ = "category_variant_schemes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "category_id", name="uq_variant_schemes_tenant_category"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False, index=True
    )
    # Leading word(s) of every generated name, e.g. "Tube", "Motif Cristal".
    base_name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Leading segment of every generated SKU, e.g. "TUB" -> TUB-28-2M-TOR-ARG.
    sku_prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    # Ordered axis keys, e.g. ["diameter", "length", "model", "color"].
    attribute_keys: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Suggested values per key, e.g. {"color": ["Argent", "Dorre"]}.
    allowed_values: Mapped[dict[str, list[str]]] = mapped_column(JSONB, default=dict)
    # Which key, if any, is excluded from the generated NAME but kept in the
    # SKU and attributes. "Tube 28 Torsadi 2m" is one product with an Argent
    # row and a Dorre row underneath it, not two differently-named products —
    # the business wants the list to read that way, one row per structural
    # combination with colour as a nested stock line, not eleven flat rows
    # that only differ by colour. Each colour is still its own Product row
    # (that is what gives it its own per-warehouse stock); only the display
    # name and the generation flow collapse them together.
    color_key: Mapped[str | None] = mapped_column(String(50), default=None)


class BomUnit(StrEnum):
    """How a BOM line's quantity is expressed.

    Stock is always counted in PIECES. `PAIR` is a convenience for the way the
    shop actually talks about supports ("1 paire support 19/19") and simply
    doubles at deduction time — recipes also legitimately call for an odd
    number ("3 pce support 28/19"), which is why the multiplier lives on the
    line rather than on the product.
    """

    PIECE = "piece"
    PAIR = "pair"


PIECES_PER_UNIT: dict[BomUnit, int] = {BomUnit.PIECE: 1, BomUnit.PAIR: 2}


class ProductBomLine(TenantScopedAuditMixin, Base):
    """One component of a KIT product's recipe.

    A kit ("Triangle 4600da") holds no stock itself; selling one deducts these
    components from the selling warehouse instead.

    `component_product_id` points at a *specific* product — for a generated
    part that means a specific variant ("Tube 28 2m Torsadi Argent"), not the
    family. Two colours of the same triangle are therefore two kits, which
    keeps the till free of a "which colour?" step.
    """

    __tablename__ = "product_bom_lines"
    __table_args__ = (
        UniqueConstraint(
            "kit_product_id", "component_product_id", name="uq_bom_lines_kit_component"
        ),
    )

    kit_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    component_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit: Mapped[BomUnit] = mapped_column(
        Enum(
            BomUnit,
            native_enum=False,
            length=10,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=BomUnit.PIECE,
    )

    @property
    def pieces_required(self) -> int:
        """Quantity converted to the unit stock is actually counted in."""
        return self.quantity * PIECES_PER_UNIT[self.unit]


class ConfigurableDefinition(TenantScopedAuditMixin, Base):
    """What a CONFIGURABLE product can be configured with, and how a chosen
    configuration is turned into a concrete recipe.

    A configurable product ("Triangle Double 28/19 F2-F3-F4") is sold in one
    line but holds no stock. The till walks the shop through picking a value
    for every axis in `options` — support, motif, colour, and (via
    `configurable_prices`) length — then the price comes from the chosen
    length and the components come from the `configurable_recipe_lines`.

    `color_key` names the axis that is applied to *every* recipe component:
    colour is chosen once and one Support / Motif / Tube / Bouchon of that
    colour is resolved for each line. `length_key` is the axis the chosen
    length is injected under for lines marked `substitute_length` (the tube).

    Option values here are convenience, not constraint — mirroring the
    variant scheme's `allowed_values`, so staff can add a colour without a
    migration — but the resolve endpoint does validate against them so a
    typo at the till fails loudly instead of silently resolving nothing.
    """

    __tablename__ = "configurable_definitions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", name="uq_configurable_definitions_product"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    color_key: Mapped[str] = mapped_column(String(50), nullable=False, default="color")
    length_key: Mapped[str] = mapped_column(String(50), nullable=False, default="length")
    # {"support": ["F1", "F2"], "motif": ["K19"], "color": ["GD", "CH"]} — the
    # allowed values per non-length axis, in the order the till should offer them.
    options: Mapped[dict[str, list[str]]] = mapped_column(JSONB, default=dict)


class ConfigurablePrice(TenantScopedAuditMixin, Base):
    """One length option's selling price.

    `length` is the display value ("2m", "2.5m", "5m") and doubles as the
    value injected into a `substitute_length` recipe line, so the length axis
    is data, not code — adding a 6m triangle is one row, not a change.
    """

    __tablename__ = "configurable_prices"
    __table_args__ = (
        UniqueConstraint(
            "configurable_product_id", "length", name="uq_configurable_prices_product_length"
        ),
    )

    configurable_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    length: Mapped[str] = mapped_column(String(50), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)


class ConfigurableRecipeLine(TenantScopedAuditMixin, Base):
    """One component pattern in a configurable product's recipe.

    Unlike a kit's `ProductBomLine` (which points at one concrete product) a
    configurable recipe line is a *pattern*: the category the part lives in
    plus the attribute values that identify it ("Support Cristal" with
    size=28/19 and model=F3). Attribute values written "@axis" are filled
    from the configuration chosen at the till — {"model": "@support"},
    {"length": "@length"}, {"color": "@color"} — so one recipe serves every
    support model, colour and length instead of one kit per combination. The
    definition's `color_key` simply names the axis applied to *every* line:
    the shop picks colour once and gets a Support / Motif / Tube / Bouchon of
    that colour.
    """

    __tablename__ = "configurable_recipe_lines"
    __table_args__ = (
        UniqueConstraint(
            "configurable_product_id", "label", name="uq_configurable_recipe_product_label"
        ),
    )

    configurable_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    # "Support", "Motif", "Tube", "Bouchon" — shown on the till's composition
    # list and used to refer to a line in the admin editor.
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), index=True, default=None
    )
    # Fixed attribute matches, e.g. {"model": "F3", "size": "28/19"}. A value
    # written "@axis" is filled from the configuration at resolve time
    # ("@support", "@length", "@color", ...), so one recipe serves every
    # support model, colour and length instead of one kit per combination.
    attributes: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Length-specific quantities, e.g. {"4m": 3} — a triangle at 4m takes a
    # third support piece while every other length takes two. Keyed by the
    # *priced* length value ("4m", not "4"); effective quantity for a chosen
    # length is the override if present, the base `quantity` otherwise. Empty
    # means the base applies to every length.
    quantity_by_length: Mapped[dict[str, int]] = mapped_column(JSONB, default=dict)
    unit: Mapped[BomUnit] = mapped_column(
        Enum(
            BomUnit,
            native_enum=False,
            length=10,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=BomUnit.PIECE,
    )

    @property
    def pieces_required(self) -> int:
        """Quantity converted to the unit stock is actually counted in."""
        return self.quantity * PIECES_PER_UNIT[self.unit]

    def effective_quantity(self, length_value: str | None) -> int:
        """The quantity that applies to one chosen length, override or base."""
        if length_value is not None:
            override = (self.quantity_by_length or {}).get(length_value)
            if override is not None:
                return int(override)
        return self.quantity


class Brand(TenantScopedAuditMixin, Base):
    __tablename__ = "brands"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_brands_tenant_name"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), default=None)


class Unit(TenantScopedAuditMixin, Base):
    """Unit of measure (piece, kilogram, litre, ...)."""

    __tablename__ = "units"
    __table_args__ = (UniqueConstraint("tenant_id", "abbreviation", name="uq_units_tenant_abbrev"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(20), nullable=False)


class Tag(TenantScopedAuditMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)


class Product(SyncableMixin, Base):
    """Base product. Stays on `SyncableMixin` for offline replication. A
    "simple" product uses its own sku/price; products with variations carry
    `ProductVariant` rows, each with its own sku/barcode/price.
    """

    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("tenant_id", "sku", name="uq_products_tenant_sku"),)

    # Overrides SyncableMixin's plain tenant_id to add the FK, same pattern
    # as ChangeLog once the tenants table existed (Milestone 1).
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), default=None, index=True)
    description: Mapped[str | None] = mapped_column(String(1000), default=None)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(
            ProductStatus,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=ProductStatus.ACTIVE,
    )
    product_type: Mapped[ProductType] = mapped_column(
        Enum(
            ProductType,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=ProductType.SIMPLE,
        index=True,
    )
    # Axis values a VARIANT was generated from, e.g.
    # {"diameter": "28", "length": "2m", "model": "Torsadi", "color": "Argent"}.
    # Empty for SIMPLE and KIT products. Kept as JSONB rather than columns
    # because the axes differ per category (tubes have a length, bouchons
    # don't) and are configured per tenant, not fixed in the schema.
    attributes: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), index=True, default=None
    )
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("brands.id"), index=True, default=None
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id"), default=None
    )
    default_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), index=True, default=None
    )


class ProductVariant(TenantScopedAuditMixin, Base):
    """A concrete sellable variation of a product (e.g. size=L / colour=red).
    `attributes` holds the defining axis values as JSON, e.g.
    {"size": "L", "colour": "red"}. Variant-level inventory is Milestone 6.
    """

    __tablename__ = "product_variants"
    __table_args__ = (UniqueConstraint("tenant_id", "sku", name="uq_variants_tenant_sku"),)

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), default=None, index=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    attributes: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductImage(TenantScopedAuditMixin, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)


class ProductAttribute(TenantScopedAuditMixin, Base):
    """Flexible per-product attribute (name/value), for descriptive specs that
    don't warrant their own column (material, warranty, origin, ...).
    """

    __tablename__ = "product_attributes"
    __table_args__ = (
        UniqueConstraint("product_id", "name", name="uq_product_attributes_product_name"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    value: Mapped[str] = mapped_column(String(500), nullable=False)


class ProductTag(Base):
    """Join table between products and tags. Carries `tenant_id` for RLS."""

    __tablename__ = "product_tags"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
