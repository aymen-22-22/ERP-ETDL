"""multi tenant foundation

Revision ID: 5d18e55ab7c9
Revises:
Create Date: 2026-07-23 23:10:31.064020

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "5d18e55ab7c9"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Fixed ids for the baseline roles so they're reproducible across
# environments and referenceable by later migrations/seed scripts.
ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}


def upgrade() -> None:
    # users first: created_by/updated_by below are self-referential FKs, so
    # the table must exist before the constraint can be added — every other
    # table's created_by/updated_by also points here.
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    )

    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    )

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    )

    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    )

    op.create_table(
        "role_permissions",
        sa.Column(
            "role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id"), primary_key=True
        ),
        sa.Column(
            "permission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permissions.id"),
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_tenant_roles",
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            primary_key=True,
        ),
        sa.Column(
            "role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "change_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("server_seq", sa.BigInteger, autoincrement=True, nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_change_log_tenant_seq", "change_log", ["tenant_id", "server_seq"])

    # Row-Level Security: defense-in-depth so a bug in a repository query
    # can't leak cross-tenant rows even if the WHERE clause is wrong. The app
    # sets app.tenant_id via SET LOCAL on every request that touches these
    # tables (see app.shared.database.session.get_tenant_db). `true` as the
    # second arg to current_setting means "return NULL instead of erroring"
    # for sessions that never set it (e.g. migrations, admin tooling).
    for table in ("user_tenant_roles", "change_log"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
        )

    # Baseline roles only — permissions are seeded by each business module
    # when it actually defines what it needs, not invented ahead of time here.
    roles_table = sa.table(
        "roles",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
    )
    op.bulk_insert(
        roles_table,
        [
            {
                "id": ROLE_IDS["owner"],
                "name": "owner",
                "description": "Full access to everything.",
            },
            {
                "id": ROLE_IDS["manager"],
                "name": "manager",
                "description": "Manages day-to-day operations.",
            },
            {
                "id": ROLE_IDS["cashier"],
                "name": "cashier",
                "description": "Point-of-sale operations.",
            },
            {
                "id": ROLE_IDS["employee"],
                "name": "employee",
                "description": "General staff access.",
            },
            {"id": ROLE_IDS["admin"], "name": "admin", "description": "Platform administrator."},
        ],
    )


def downgrade() -> None:
    for table in ("user_tenant_roles", "change_log"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("change_log")
    op.drop_table("user_tenant_roles")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("tenants")
    op.drop_table("users")
