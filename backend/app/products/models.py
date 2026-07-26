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
