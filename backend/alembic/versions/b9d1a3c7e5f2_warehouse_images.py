"""warehouse images

Revision ID: b9d1a3c7e5f2
Revises: a6b7c8d9e0f1
Create Date: 2026-08-16 03:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b9d1a3c7e5f2"
down_revision: str | Sequence[str] | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("warehouses", sa.Column("image_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("warehouses", "image_url")
