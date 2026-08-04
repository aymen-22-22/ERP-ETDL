"""Guards the fix for a production 500 on every product update and delete.

`serialize_syncable()` snapshots a row by reading every column. If `updated_at`
is computed database-side via `onupdate=func.now()`, SQLAlchemy expires that
attribute after an UPDATE flush and re-reads it lazily on next access — which
under asyncio is synchronous IO outside the greenlet:

    MissingGreenlet: greenlet_spawn has not been called

Creates were unaffected (INSERT fetches server defaults inline with RETURNING),
so the bug only ever showed up on update and delete.

Asserted here rather than against a live database because the test suite has no
Postgres: the property that matters is a static one — the default must be
resolvable in Python.
"""

from app.inventory.models import InventoryMovement
from app.products.models import Category, Product
from app.shared.database.session import Base

MODELS = [Product, Category, InventoryMovement]


def test_updated_at_is_computed_in_python_not_by_the_database() -> None:
    for model in MODELS:
        onupdate = model.__table__.c.updated_at.onupdate
        assert onupdate is not None, f"{model.__name__}.updated_at has no onupdate"
        assert onupdate.is_callable, (
            f"{model.__name__}.updated_at uses a SQL-side onupdate. That expires "
            "the attribute after flush, and serialize_syncable() then triggers a "
            "lazy load that raises MissingGreenlet under asyncio."
        )


def test_no_mapped_table_has_a_sql_side_onupdate() -> None:
    # The same trap applies to any column read after a flush, so catch a new
    # one being introduced anywhere rather than only on the models above.
    offenders = [
        f"{table.name}.{column.name}"
        for table in Base.metadata.tables.values()
        for column in table.columns
        if column.onupdate is not None and not column.onupdate.is_callable
    ]
    assert offenders == [], (
        "SQL-side onupdate defaults expire the attribute after flush and break "
        f"async reads: {', '.join(offenders)}"
    )
