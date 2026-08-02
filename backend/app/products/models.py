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
    """

    SIMPLE = "simple"
    VARIANT = "variant"
    KIT = "kit"


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
