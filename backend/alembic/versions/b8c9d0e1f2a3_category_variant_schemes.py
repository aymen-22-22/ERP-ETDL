"""category variant schemes

Per-category rules for auto-generating variant names and SKUs. See
`CategoryVariantScheme` for why the naming formula is stored as an ordered
key list rather than four hard-coded format strings.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-01 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "category_variant_schemes",
        # Same column set as every other TenantScopedAuditMixin table
        # (cf. _audit_columns() in 7cc096ddb5ba) — including created_by /
        # updated_by, which the mixin writes on every insert.
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id"),
            nullable=False,
        ),
        sa.Column("base_name", sa.String(150), nullable=False),
        sa.Column("sku_prefix", sa.String(20), nullable=False),
        sa.Column(
            "attribute_keys",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "allowed_values",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.UniqueConstraint("tenant_id", "category_id", name="uq_variant_schemes_tenant_category"),
    )
    op.create_index(
        "ix_category_variant_schemes_tenant_id", "category_variant_schemes", ["tenant_id"]
    )
    op.create_index(
        "ix_category_variant_schemes_category_id", "category_variant_schemes", ["category_id"]
    )

    # Same tenant isolation as every other tenant-scoped table: RLS on, FORCED
    # so it applies to the table owner too (see e5f6a7b8c9d0), with the
    # NULL-safe predicate from f6a7b8c9d0e1.
    op.execute("ALTER TABLE category_variant_schemes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE category_variant_schemes FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON category_variant_schemes "
        "USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON category_variant_schemes")
    op.drop_index("ix_category_variant_schemes_category_id", table_name="category_variant_schemes")
    op.drop_index("ix_category_variant_schemes_tenant_id", table_name="category_variant_schemes")
    op.drop_table("category_variant_schemes")
