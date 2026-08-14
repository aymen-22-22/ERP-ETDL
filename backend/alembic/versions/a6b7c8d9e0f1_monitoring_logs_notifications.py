"""monitoring: error logs and notifications

Revision ID: a6b7c8d9e0f1
Revises: f2a3b4c5d6e7
Create Date: 2026-08-14 12:00:00.000000

Two new tables behind Settings → Logs and the notifications bell:

* `app_error_logs` — persisted errors written by the global exception handlers.
  Deliberately has NO RLS: handlers run outside the dependency graph and an
  error can occur before a tenant context exists, so forcing RLS there would
  either block the insert or silently drop rows. Isolation is enforced in the
  repository instead (every read filters `tenant_id` explicitly, plus
  system-level rows with NULL tenant are surfaced).
* `notifications` — tenant-scoped alerts (low stock per warehouse). Standard
  tenant_isolation policy + FORCE RLS like every business table.

Also seeds the two permissions (`logs:read`, `notifications:read`) and their
role grants so the new endpoints are reachable.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | Sequence[str] | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSION_IDS = {
    "logs:read": "9d4f2c1a-b7e6-4a9d-8f3c-5e2b1a9d7c4e",
    "notifications:read": "1c8a3f6d-e5b4-4c7a-9d2e-6f3b8a1c5d7e",
}

ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

ROLE_GRANTS = {
    "owner": ["logs:read", "notifications:read"],
    "admin": ["logs:read", "notifications:read"],
    "manager": ["logs:read", "notifications:read"],
    "cashier": ["notifications:read"],
    "employee": ["notifications:read"],
}

PERMISSION_DESCRIPTIONS = {
    "logs:read": "View the activity and error logs.",
    "notifications:read": "View and manage notifications and alerts.",
}

_RLS_PREDICATE = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "app_error_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("path", sa.String(500), nullable=True),
        sa.Column("method", sa.String(20), nullable=True),
        sa.Column("traceback", sa.Text(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_app_error_logs_tenant_id", "app_error_logs", ["tenant_id"])

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("kind", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="info"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "data",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"])
    op.create_index("ix_notifications_entity_id", "notifications", ["entity_id"])
    op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON notifications USING ({_RLS_PREDICATE})")
    op.execute("ALTER TABLE notifications FORCE ROW LEVEL SECURITY")

    for code, pid in PERMISSION_IDS.items():
        desc = PERMISSION_DESCRIPTIONS[code]
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES ('{pid}', '{code}', '{desc}') "
            f"ON CONFLICT (code) DO NOTHING"
        )

    for role, codes in ROLE_GRANTS.items():
        rid = ROLE_IDS[role]
        for code in codes:
            op.execute(
                f"INSERT INTO role_permissions (role_id, permission_id) "
                f"SELECT '{rid}'::uuid, id FROM permissions WHERE code = '{code}' "
                f"ON CONFLICT DO NOTHING"
            )


def downgrade() -> None:
    id_list = ", ".join(f"'{pid}'" for pid in PERMISSION_IDS.values())
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({id_list})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({id_list})")

    op.execute("DROP POLICY IF EXISTS tenant_isolation ON notifications")
    op.execute("ALTER TABLE notifications NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE notifications DISABLE ROW LEVEL SECURITY")
    op.drop_table("notifications")
    op.drop_table("app_error_logs")
