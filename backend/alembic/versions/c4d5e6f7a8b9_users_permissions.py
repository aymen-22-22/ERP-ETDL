"""users permissions

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-26 12:00:00.000000

Seeds the permissions guarding the new tenant user-management endpoints.

Only owner and admin get `users:write`: adding members and changing roles is
account administration, not day-to-day operations. Manager gets read access so
they can see who is on the team without being able to grant themselves rights.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSION_IDS = {
    "users:read": "46322f2a-e3e2-4539-8649-fc94bbab4d67",
    "users:write": "cc4a5893-ef33-4de3-a18e-815dd5fdca13",
}

ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

ROLE_GRANTS = {
    "owner": ["users:read", "users:write"],
    "admin": ["users:read", "users:write"],
    "manager": ["users:read"],
}


def upgrade() -> None:
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
                "id": PERMISSION_IDS["users:read"],
                "code": "users:read",
                "description": "View the people in this business.",
            },
            {
                "id": PERMISSION_IDS["users:write"],
                "code": "users:write",
                "description": "Add people, change their role, and remove them.",
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
