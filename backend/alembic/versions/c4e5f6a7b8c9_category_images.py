"""category images

Revision ID: c4e5f6a7b8c9
Revises: b9d1a3c7e5f2
Create Date: 2026-08-16 03:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "b9d1a3c7e5f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("image_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "image_url")
