"""warehouses module

Revision ID: a1b2c3d4e5f6
Revises: 2358cc175a5b
Create Date: 2026-07-25 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "2358cc175a5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSION_IDS = {
    "warehouses:read": "bfc039c7-d0cb-4619-be2a-a4237dc56786",
    "warehouses:write": "5eceb839-1916-463a-9573-d94f5139eee1",
}

# Same fixed role ids seeded in e4b05c0f299b.
ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

ROLE_GRANTS = {
    "owner": ["warehouses:read", "warehouses:write"],
    "manager": ["warehouses:read", "warehouses:write"],
    "admin": ["warehouses:read", "warehouses:write"],
    "cashier": ["warehouses:read"],
    "employee": ["warehouses:read"],
}


def _audit_columns() -> list[sa.Column]:
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


def upgrade() -> None:
    op.create_table(
        "warehouses",
        *_audit_columns(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("code", sa.String(30), nullable=True),
        sa.Column("warehouse_type", sa.String(20), nullable=False, server_default="depot"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("allow_sales", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("allow_purchases", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("allow_transfers", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("allow_negative_stock", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_warehouses_tenant_name"),
    )
    op.create_index("ix_warehouses_tenant_id", "warehouses", ["tenant_id"])
    # Defense-in-depth alongside the service-level check in set_default_warehouse:
    # at most one default warehouse per tenant.
    op.create_index(
        "uq_warehouses_tenant_default",
        "warehouses",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND deleted_at IS NULL"),
    )

    op.execute("ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON warehouses "
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
                "id": PERMISSION_IDS["warehouses:read"],
                "code": "warehouses:read",
                "description": "View warehouses.",
            },
            {
                "id": PERMISSION_IDS["warehouses:write"],
                "code": "warehouses:write",
                "description": "Create, edit, and delete warehouses.",
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

    # Backfill: every existing tenant gets a "Main Warehouse" so existing
    # single-location data (products, movements, snapshots) has somewhere to
    # attach in the follow-up migration.
    op.execute(
        """
        INSERT INTO warehouses (
            id, tenant_id, created_at, updated_at, name, warehouse_type,
            is_default, is_active, allow_sales, allow_purchases,
            allow_transfers, allow_negative_stock
        )
        SELECT gen_random_uuid(), id, now(), now(), 'Main Warehouse', 'depot',
               true, true, true, true, true, false
        FROM tenants
        """
    )


def downgrade() -> None:
    permission_id_list = ", ".join(f"'{pid}'" for pid in PERMISSION_IDS.values())
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({permission_id_list})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({permission_id_list})")

    op.execute("DROP POLICY IF EXISTS tenant_isolation ON warehouses")
    op.execute("ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY")

    op.drop_table("warehouses")
