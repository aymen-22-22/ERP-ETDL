"""complete old draft transfers

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f7
Create Date: 2026-07-26 12:00:00.000000

All pre-existing transfers in draft/pending/approved status are set to
completed so the new direct-transfer workflow starts clean.  Cancelled
transfers are left untouched.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        UPDATE stock_transfers
        SET status = 'completed',
            completed_at = COALESCE(completed_at, now())
        WHERE status IN ('draft', 'pending', 'approved')
        """)


def downgrade() -> None:
    op.execute("""
        UPDATE stock_transfers
        SET status = 'draft',
            completed_at = NULL
        WHERE status = 'completed'
          AND completed_at IS NOT NULL
        """)
