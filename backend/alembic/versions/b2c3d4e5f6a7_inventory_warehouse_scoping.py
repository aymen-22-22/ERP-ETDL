"""inventory warehouse scoping

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-25 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- inventory_movements: add warehouse_id, backfill to each tenant's
    # default warehouse, then enforce NOT NULL. ---
    op.add_column(
        "inventory_movements",
        sa.Column("warehouse_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("warehouses.id")),
    )
    op.execute("""
        UPDATE inventory_movements im
        SET warehouse_id = w.id
        FROM warehouses w
        WHERE w.tenant_id = im.tenant_id AND w.is_default
        """)
    op.alter_column("inventory_movements", "warehouse_id", nullable=False)
    op.create_index("ix_inventory_movements_warehouse_id", "inventory_movements", ["warehouse_id"])

    # --- product_stock_snapshots: PK changes from (product_id) to
    # (product_id, warehouse_id), which SQLAlchemy/Postgres can't do as an
    # in-place ALTER — rebuild via a new table + data copy. ---
    op.create_table(
        "product_stock_snapshots_new",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            primary_key=True,
        ),
        sa.Column(
            "warehouse_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("warehouses.id"),
            primary_key=True,
        ),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("quantity_on_hand", sa.Integer, nullable=False, server_default="0"),
        sa.Column("reserved_quantity", sa.Integer, nullable=False, server_default="0"),
        sa.Column("min_quantity", sa.Integer, nullable=True),
        sa.Column("max_quantity", sa.Integer, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("""
        INSERT INTO product_stock_snapshots_new (
            product_id, warehouse_id, tenant_id, quantity_on_hand,
            reserved_quantity, min_quantity, max_quantity, updated_at
        )
        SELECT ps.product_id, w.id, ps.tenant_id, ps.quantity_on_hand,
               0, NULL, NULL, ps.updated_at
        FROM product_stock_snapshots ps
        JOIN warehouses w ON w.tenant_id = ps.tenant_id AND w.is_default
        """)
    op.drop_table("product_stock_snapshots")
    op.rename_table("product_stock_snapshots_new", "product_stock_snapshots")
    op.create_index(
        "ix_product_stock_snapshots_tenant_id", "product_stock_snapshots", ["tenant_id"]
    )
    op.create_index(
        "ix_product_stock_snapshots_warehouse_id", "product_stock_snapshots", ["warehouse_id"]
    )

    # RLS policies don't survive a drop/recreate — re-enable.
    op.execute("ALTER TABLE product_stock_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON product_stock_snapshots "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON product_stock_snapshots")
    op.execute("ALTER TABLE product_stock_snapshots DISABLE ROW LEVEL SECURITY")

    op.create_table(
        "product_stock_snapshots_old",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            primary_key=True,
        ),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("quantity_on_hand", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("""
        INSERT INTO product_stock_snapshots_old
            (product_id, tenant_id, quantity_on_hand, updated_at)
        SELECT product_id, tenant_id, SUM(quantity_on_hand), MAX(updated_at)
        FROM product_stock_snapshots
        GROUP BY product_id, tenant_id
        """)
    op.drop_index("ix_product_stock_snapshots_warehouse_id", table_name="product_stock_snapshots")
    op.drop_index("ix_product_stock_snapshots_tenant_id", table_name="product_stock_snapshots")
    op.drop_table("product_stock_snapshots")
    op.rename_table("product_stock_snapshots_old", "product_stock_snapshots")
    op.create_index(
        "ix_product_stock_snapshots_tenant_id", "product_stock_snapshots", ["tenant_id"]
    )
    op.execute("ALTER TABLE product_stock_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON product_stock_snapshots "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )

    op.drop_index("ix_inventory_movements_warehouse_id", table_name="inventory_movements")
    op.drop_column("inventory_movements", "warehouse_id")
