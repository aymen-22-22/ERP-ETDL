"""configurable products

Definition, pricing and recipe tables for `ProductType.CONFIGURABLE` — the
shop configures the product at the till (support/motif/length/colour) and the
configuration determines both the price and the components taken off the
shelf.

Unlike a kit (whose `product_bom_lines` point at one concrete component each)
a configurable recipe line is a *pattern* — the category plus the attribute
values that identify the part. Attribute values written "@axis" (e.g.
{"length": "@length"}, {"color": "@color"}) are filled from the till's
configuration at resolve time, which is what lets one recipe serve every
support model, colour and length instead of one kit per combination.

Also adds `inventory_movements.config`: the full configuration as rung up,
snapshotted onto the movements a configurable sale creates so the ledger can
reproduce exactly what was sold.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AUDIT_COLUMNS = (
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
)


def _create_tenant_isolation(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {table} "
        "USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)"
    )


def upgrade() -> None:
    op.create_table(
        "configurable_definitions",
        *_AUDIT_COLUMNS,
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("color_key", sa.String(50), nullable=False, server_default="color"),
        sa.Column("length_key", sa.String(50), nullable=False, server_default="length"),
        sa.Column(
            "options",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.UniqueConstraint("tenant_id", "product_id", name="uq_configurable_definitions_product"),
    )
    op.create_index(
        "ix_configurable_definitions_tenant_id", "configurable_definitions", ["tenant_id"]
    )
    op.create_index(
        "ix_configurable_definitions_product_id", "configurable_definitions", ["product_id"]
    )
    _create_tenant_isolation("configurable_definitions")

    op.create_table(
        "configurable_prices",
        *_AUDIT_COLUMNS,
        sa.Column(
            "configurable_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("length", sa.String(50), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint(
            "configurable_product_id", "length", name="uq_configurable_prices_product_length"
        ),
    )
    op.create_index("ix_configurable_prices_tenant_id", "configurable_prices", ["tenant_id"])
    op.create_index(
        "ix_configurable_prices_product_id",
        "configurable_prices",
        ["configurable_product_id"],
    )
    _create_tenant_isolation("configurable_prices")

    op.create_table(
        "configurable_recipe_lines",
        *_AUDIT_COLUMNS,
        sa.Column(
            "configurable_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id"),
            nullable=True,
        ),
        sa.Column(
            "attributes",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("unit", sa.String(10), nullable=False, server_default="piece"),
        sa.UniqueConstraint(
            "configurable_product_id", "label", name="uq_configurable_recipe_product_label"
        ),
    )
    op.create_index(
        "ix_configurable_recipe_lines_tenant_id", "configurable_recipe_lines", ["tenant_id"]
    )
    op.create_index(
        "ix_configurable_recipe_lines_product_id",
        "configurable_recipe_lines",
        ["configurable_product_id"],
    )
    op.create_index(
        "ix_configurable_recipe_lines_category_id",
        "configurable_recipe_lines",
        ["category_id"],
    )
    _create_tenant_isolation("configurable_recipe_lines")

    op.add_column(
        "inventory_movements",
        sa.Column("config", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inventory_movements", "config")

    for table, indexes in (
        (
            "configurable_definitions",
            ["ix_configurable_definitions_product_id", "ix_configurable_definitions_tenant_id"],
        ),
        (
            "configurable_prices",
            ["ix_configurable_prices_product_id", "ix_configurable_prices_tenant_id"],
        ),
        (
            "configurable_recipe_lines",
            [
                "ix_configurable_recipe_lines_category_id",
                "ix_configurable_recipe_lines_product_id",
                "ix_configurable_recipe_lines_tenant_id",
            ],
        ),
    ):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        for index in indexes:
            op.drop_index(index, table_name=table)
        op.drop_table(table)
