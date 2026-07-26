"""products and inventory ledger

Revision ID: e4b05c0f299b
Revises: f7d4ffb39f19
Create Date: 2026-07-24 01:27:46.403147

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e4b05c0f299b"
down_revision: str | Sequence[str] | None = "f7d4ffb39f19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Fixed ids, same convention as the Milestone 1 role seed — reproducible
# across environments.
PERMISSION_IDS = {
    "products:read": "019f917f-0f9e-7220-ae81-586b520e4b45",
    "products:write": "019f917f-0f9e-7220-ae81-586ce315d7f5",
    "inventory:read": "019f917f-0f9e-7220-ae81-586d1122df76",
    "inventory:write": "019f917f-0f9e-7220-ae81-586e26321a73",
}

ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

# Owner/Manager/Admin get full access; Cashier/Employee can view but not
# create/edit products or record movements directly (that comes through
# Sales/Purchases once those modules exist).
ROLE_GRANTS = {
    "owner": ["products:read", "products:write", "inventory:read", "inventory:write"],
    "manager": ["products:read", "products:write", "inventory:read", "inventory:write"],
    "admin": ["products:read", "products:write", "inventory:read", "inventory:write"],
    "cashier": ["products:read", "inventory:read"],
    "employee": ["products:read", "inventory:read"],
}


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_products_tenant_sku"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"])

    op.create_table(
        "inventory_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("quantity_delta", sa.Integer, nullable=False),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_inventory_movements_tenant_id", "inventory_movements", ["tenant_id"])
    op.create_index("ix_inventory_movements_product_id", "inventory_movements", ["product_id"])

    op.create_table(
        "product_stock_snapshots",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            primary_key=True,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("quantity_on_hand", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_product_stock_snapshots_tenant_id", "product_stock_snapshots", ["tenant_id"]
    )

    # RLS: every tenant-scoped table added this migration gets the same
    # defense-in-depth policy as user_tenant_roles/change_log (Milestone 1).
    for table in ("products", "inventory_movements", "product_stock_snapshots"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
        )

    permissions_table = sa.table(
        "permissions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("description", sa.String),
    )
    op.bulk_insert(
        permissions_table,
        [
            {
                "id": PERMISSION_IDS["products:read"],
                "code": "products:read",
                "description": "View products.",
            },
            {
                "id": PERMISSION_IDS["products:write"],
                "code": "products:write",
                "description": "Create, edit, and delete products.",
            },
            {
                "id": PERMISSION_IDS["inventory:read"],
                "code": "inventory:read",
                "description": "View stock levels and movement history.",
            },
            {
                "id": PERMISSION_IDS["inventory:write"],
                "code": "inventory:write",
                "description": "Record inventory movements.",
            },
        ],
    )

    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", postgresql.UUID(as_uuid=True)),
        sa.column("permission_id", postgresql.UUID(as_uuid=True)),
    )
    op.bulk_insert(
        role_permissions_table,
        [
            {"role_id": ROLE_IDS[role], "permission_id": PERMISSION_IDS[code]}
            for role, codes in ROLE_GRANTS.items()
            for code in codes
        ],
    )


def downgrade() -> None:
    permission_id_list = ", ".join(f"'{pid}'" for pid in PERMISSION_IDS.values())
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({permission_id_list})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({permission_id_list})")

    for table in ("products", "inventory_movements", "product_stock_snapshots"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("product_stock_snapshots")
    op.drop_table("inventory_movements")
    op.drop_table("products")
