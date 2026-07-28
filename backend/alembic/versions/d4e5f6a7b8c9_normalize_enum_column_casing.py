"""normalize enum column casing

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-26 08:00:00.000000

SQLAlchemy's `Enum(SomeStrEnum, native_enum=False)` stores the enum
member's *name* (e.g. "ACTIVE") by default, not its `.value`
("active"), unless `values_callable` is passed. The ORM-facing models
now pass `values_callable` to store lowercase values consistently with
the JSON API contract — this migration normalizes any rows written
before that fix (via the ORM, which wrote uppercase names) down to
lowercase so they match. Rows already lowercase (e.g. from raw-SQL
migration backfills) are unaffected by `lower()`.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = [
    ("products", "status"),
    ("inventory_movements", "movement_type"),
    ("warehouses", "warehouse_type"),
    ("stock_transfers", "status"),
]


def upgrade() -> None:
    for table, column in _COLUMNS:
        op.execute(
            f"UPDATE {table} SET {column} = lower({column}) " f"WHERE {column} <> lower({column})"
        )


def downgrade() -> None:
    # Casing normalization is not reversible (the pre-fix uppercase rows
    # and any always-lowercase rows are indistinguishable after upgrade).
    pass
