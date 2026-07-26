"""product catalog domain

Revision ID: 7cc096ddb5ba
Revises: f5c09c0f7f18
Create Date: 2026-07-24 06:31:50.662020

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "7cc096ddb5ba"
down_revision: str | Sequence[str] | None = "f5c09c0f7f18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _audit_columns() -> list[sa.Column]:
    """Columns shared by every TenantScopedAuditMixin table."""
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    ]


NEW_TABLES = (
    "categories",
    "brands",
    "units",
    "tags",
    "product_variants",
    "product_images",
    "product_attributes",
    "product_tags",
)


def upgrade() -> None:
    # --- reference tables (must exist before products' new FKs) ---
    op.create_table(
        "categories",
        *_audit_columns(),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id")),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "tenant_id", "name", "parent_id", name="uq_categories_tenant_name_parent"
        ),
    )
    op.create_index("ix_categories_tenant_id", "categories", ["tenant_id"])
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    op.create_table(
        "brands",
        *_audit_columns(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_brands_tenant_name"),
    )
    op.create_index("ix_brands_tenant_id", "brands", ["tenant_id"])

    op.create_table(
        "units",
        *_audit_columns(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("abbreviation", sa.String(20), nullable=False),
        sa.UniqueConstraint("tenant_id", "abbreviation", name="uq_units_tenant_abbrev"),
    )
    op.create_index("ix_units_tenant_id", "units", ["tenant_id"])

    op.create_table(
        "tags",
        *_audit_columns(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),
    )
    op.create_index("ix_tags_tenant_id", "tags", ["tenant_id"])

    # --- extend products ---
    op.add_column("products", sa.Column("barcode", sa.String(100), nullable=True))
    op.add_column("products", sa.Column("cost_price", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "products",
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
    )
    op.add_column(
        "products",
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id")),
    )
    op.add_column(
        "products",
        sa.Column("brand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("brands.id")),
    )
    op.add_column(
        "products",
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id")),
    )
    op.create_index("ix_products_barcode", "products", ["barcode"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_brand_id", "products", ["brand_id"])
    # Barcode unique per tenant, ignoring soft-deleted rows and NULL barcodes.
    op.create_index(
        "uq_products_tenant_barcode",
        "products",
        ["tenant_id", "barcode"],
        unique=True,
        postgresql_where=sa.text("barcode IS NOT NULL AND deleted_at IS NULL"),
    )

    # --- product child tables ---
    op.create_table(
        "product_variants",
        *_audit_columns(),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("barcode", sa.String(100), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("attributes", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_variants_tenant_sku"),
    )
    op.create_index("ix_product_variants_tenant_id", "product_variants", ["tenant_id"])
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_product_variants_barcode", "product_variants", ["barcode"])

    op.create_table(
        "product_images",
        *_audit_columns(),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_product_images_tenant_id", "product_images", ["tenant_id"])
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"])

    op.create_table(
        "product_attributes",
        *_audit_columns(),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("value", sa.String(500), nullable=False),
        sa.UniqueConstraint("product_id", "name", name="uq_product_attributes_product_name"),
    )
    op.create_index("ix_product_attributes_tenant_id", "product_attributes", ["tenant_id"])
    op.create_index("ix_product_attributes_product_id", "product_attributes", ["product_id"])

    op.create_table(
        "product_tags",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tags.id"), primary_key=True
        ),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_product_tags_tenant_id", "product_tags", ["tenant_id"])

    # --- RLS: same tenant_isolation policy as every other tenant-scoped table ---
    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
        )


def downgrade() -> None:
    for table in NEW_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("product_tags")
    op.drop_table("product_attributes")
    op.drop_table("product_images")
    op.drop_table("product_variants")

    op.drop_index("uq_products_tenant_barcode", table_name="products")
    op.drop_index("ix_products_brand_id", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_column("products", "unit_id")
    op.drop_column("products", "brand_id")
    op.drop_column("products", "category_id")
    op.drop_column("products", "status")
    op.drop_column("products", "cost_price")
    op.drop_column("products", "barcode")

    op.drop_table("tags")
    op.drop_table("units")
    op.drop_table("brands")
    op.drop_table("categories")
