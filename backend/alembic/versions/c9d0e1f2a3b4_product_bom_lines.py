"""product bill-of-materials lines

Recipe for a KIT product. A kit holds no stock of its own; selling one
deducts these components from the selling warehouse.

`quantity` + `unit` rather than a plain piece count because the shop talks in
pairs for supports ("1 paire support 19/19") but also orders odd numbers
("3 pce support 28/19"), so the pair/piece multiplier belongs on the line.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-02 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_bom_lines",
        # Same column set as every other TenantScopedAuditMixin table.
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
            "kit_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column(
            "component_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("unit", sa.String(10), nullable=False, server_default="piece"),
        # One line per component: quantity changes are an edit, not a
        # second row, otherwise the same part could appear twice with
        # different units and silently double-deduct.
        sa.UniqueConstraint(
            "kit_product_id", "component_product_id", name="uq_bom_lines_kit_component"
        ),
    )
    op.create_index("ix_product_bom_lines_tenant_id", "product_bom_lines", ["tenant_id"])
    op.create_index("ix_product_bom_lines_kit_product_id", "product_bom_lines", ["kit_product_id"])
    op.create_index(
        "ix_product_bom_lines_component_product_id", "product_bom_lines", ["component_product_id"]
    )

    op.execute("ALTER TABLE product_bom_lines ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE product_bom_lines FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON product_bom_lines "
        "USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON product_bom_lines")
    op.drop_index("ix_product_bom_lines_component_product_id", table_name="product_bom_lines")
    op.drop_index("ix_product_bom_lines_kit_product_id", table_name="product_bom_lines")
    op.drop_index("ix_product_bom_lines_tenant_id", table_name="product_bom_lines")
    op.drop_table("product_bom_lines")
