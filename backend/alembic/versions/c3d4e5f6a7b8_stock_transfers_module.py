"""stock transfers module

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-25 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSION_IDS = {
    "transfers:read": "1c6a363d-de11-4502-be45-4ca2d403dbf4",
    "transfers:write": "8411e8e5-f212-4ff6-9792-a2ae731adcdf",
    "transfers:approve": "a7b0f824-1e08-424e-a4d6-b0356554fec4",
}

ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

ROLE_GRANTS = {
    "owner": ["transfers:read", "transfers:write", "transfers:approve"],
    "manager": ["transfers:read", "transfers:write", "transfers:approve"],
    "admin": ["transfers:read", "transfers:write", "transfers:approve"],
    "cashier": ["transfers:read"],
    "employee": ["transfers:read", "transfers:write"],
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


NEW_TABLES = ("stock_transfers", "stock_transfer_lines")


def upgrade() -> None:
    op.create_table(
        "stock_transfers",
        *_audit_columns(),
        sa.Column(
            "source_warehouse_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("warehouses.id"),
            nullable=False,
        ),
        sa.Column(
            "dest_warehouse_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("warehouses.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("source_warehouse_id != dest_warehouse_id", name="ck_transfer_diff_wh"),
    )
    op.create_index("ix_stock_transfers_tenant_id", "stock_transfers", ["tenant_id"])
    op.create_index(
        "ix_stock_transfers_source_warehouse_id", "stock_transfers", ["source_warehouse_id"]
    )
    op.create_index(
        "ix_stock_transfers_dest_warehouse_id", "stock_transfers", ["dest_warehouse_id"]
    )

    op.create_table(
        "stock_transfer_lines",
        *_audit_columns(),
        sa.Column(
            "transfer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("stock_transfers.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_transfer_line_qty_positive"),
    )
    op.create_index("ix_stock_transfer_lines_tenant_id", "stock_transfer_lines", ["tenant_id"])
    op.create_index("ix_stock_transfer_lines_transfer_id", "stock_transfer_lines", ["transfer_id"])

    for table in NEW_TABLES:
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
                "id": PERMISSION_IDS["transfers:read"],
                "code": "transfers:read",
                "description": "View stock transfers.",
            },
            {
                "id": PERMISSION_IDS["transfers:write"],
                "code": "transfers:write",
                "description": "Create, edit, submit, and cancel stock transfers.",
            },
            {
                "id": PERMISSION_IDS["transfers:approve"],
                "code": "transfers:approve",
                "description": "Approve and complete stock transfers.",
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

    for table in NEW_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("stock_transfer_lines")
    op.drop_table("stock_transfers")
