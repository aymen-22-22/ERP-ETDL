"""changelog payload version

Revision ID: 2358cc175a5b
Revises: 7cc096ddb5ba
Create Date: 2026-07-24 20:48:16.028547

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "2358cc175a5b"
down_revision: str | Sequence[str] | None = "7cc096ddb5ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "change_log",
        sa.Column("payload_version", sa.Integer, nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("change_log", "payload_version")
