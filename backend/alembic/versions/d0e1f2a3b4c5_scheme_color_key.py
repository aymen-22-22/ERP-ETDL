"""category_variant_schemes.color_key

The axis excluded from the generated NAME but kept in the SKU and attributes.
"Tube 28 Torsadi 2m" is one structural product with an Argent row and a Dorre
row underneath it, not two differently-named products.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-08-03 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "category_variant_schemes",
        sa.Column("color_key", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("category_variant_schemes", "color_key")
