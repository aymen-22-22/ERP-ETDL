"""force row level security

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-26 08:30:00.000000

Every prior migration did `ALTER TABLE x ENABLE ROW LEVEL SECURITY`, but
Postgres RLS policies are silently skipped for the table owner unless
`FORCE ROW LEVEL SECURITY` is also set. Since the app connects to Postgres
as the same role that owns these tables (the role that ran the
migrations), every RLS policy in this schema has been a no-op for the
running application since Milestone 1 — a cross-tenant query returned
rows from every tenant. This migration closes that gap for every
tenant-scoped business table.

`user_tenant_roles` is deliberately excluded: `AuthRepository.
has_tenant_membership` (login) and `require_permission()` (every
permission check) both query it via a plain `get_db` session with no
`app.tenant_id` set, filtering `tenant_id` explicitly in the WHERE clause
instead — that's intentional, since login has to check membership before
a tenant context exists. Forcing RLS there would AND a false predicate
onto every one of those queries and break auth entirely.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RLS_TABLES = (
    "change_log",
    "products",
    "inventory_movements",
    "product_stock_snapshots",
    "categories",
    "brands",
    "units",
    "tags",
    "product_variants",
    "product_images",
    "product_attributes",
    "product_tags",
    "warehouses",
    "stock_transfers",
    "stock_transfer_lines",
)


def upgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
