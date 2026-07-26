"""null safe rls policies

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-26 09:00:00.000000

The policies compared `tenant_id = current_setting('app.tenant_id', true)::uuid`.
When the setting is absent `current_setting(..., true)` yields NULL (fine — the
predicate is just false), but a *transaction-scoped* `set_config(..., true)`
reverts to an empty string rather than NULL once the transaction ends. Casting
`''::uuid` is a hard SQL error, so any statement issued after a mid-request
commit blew up with `invalid input syntax for type uuid: ""` instead of simply
matching no rows.

Wrapping the setting in `NULLIF(..., '')` makes both the unset and the
reverted-to-empty cases behave identically: NULL, so the predicate is false and
the query returns no rows rather than erroring.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RLS_TABLES = (
    "user_tenant_roles",
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

_NEW_PREDICATE = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid"
_OLD_PREDICATE = "tenant_id = current_setting('app.tenant_id', true)::uuid"


def _recreate(predicate: str) -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({predicate})")


def upgrade() -> None:
    _recreate(_NEW_PREDICATE)


def downgrade() -> None:
    _recreate(_OLD_PREDICATE)
