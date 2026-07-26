"""add product default warehouse

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-07-25 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "default_warehouse_id",
            UUID(as_uuid=True),
            sa.ForeignKey("warehouses.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_products_default_warehouse_id",
        "products",
        ["default_warehouse_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_products_default_warehouse_id", table_name="products")
    op.drop_column("products", "default_warehouse_id")
