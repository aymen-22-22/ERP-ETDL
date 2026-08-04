"""product_type discriminator and variant attributes

Adds the two columns Types A/B/C need on `products`:

* `product_type` — simple | variant | kit. Everything that exists today is a
  simple product, which is why the server default backfills to "simple".
* `attributes`   — the axis values a variant was generated from. Empty for
  simple and kit products.

Stored as VARCHAR + JSONB rather than a native PG enum, matching how
`products.status` was created (see 7cc096ddb5ba): the app validates the value
through a Python StrEnum, so a DB-level enum type would only add migration
friction whenever a member is added.

Revision ID: a7b8c9d0e1f2
Revises: e6f7a8b9c0d1
Create Date: 2026-08-01 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("product_type", sa.String(20), nullable=False, server_default="simple"),
    )
    op.add_column(
        "products",
        sa.Column(
            "attributes",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    # Every list/POS query will filter on this (kits and variants are shown
    # differently from simple products), and it has very low cardinality.
    op.create_index("ix_products_product_type", "products", ["product_type"])


def downgrade() -> None:
    op.drop_index("ix_products_product_type", table_name="products")
    op.drop_column("products", "attributes")
    op.drop_column("products", "product_type")
