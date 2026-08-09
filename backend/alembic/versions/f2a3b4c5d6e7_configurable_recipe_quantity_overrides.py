"""configurable recipe: length-specific quantities

Adds `configurable_recipe_lines.quantity_by_length`: a JSONB map from priced
length ("4m") to quantity, letting one recipe line take a different number of
a component for a specific length. The triangle at 4m needs a third support
piece while 2m/2.5m/3m/5m take two; without this the recipe would need one
product per length.

A column addition to a row-level-security table needs no policy — the existing
tenant_isolation policy covers the row, not its columns.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-09 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "configurable_recipe_lines",
        sa.Column(
            "quantity_by_length",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("configurable_recipe_lines", "quantity_by_length")
