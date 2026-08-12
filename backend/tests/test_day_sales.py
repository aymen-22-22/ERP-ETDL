"""Day-sales aggregation: folding a day's movements back into cart lines.

A sale of a kit or a CONFIGURABLE product writes one movement per component.
The "by day" view must read like the till did — `2x Triangle 28/19 2m`, not a
wall of component rows — so the merge arithmetic is pinned here without a
database, mirroring `day_sales.aggregate_day`.
"""

from uuid import uuid4

from app.inventory.day_sales import MovementRow, aggregate_day
from app.inventory.schemas import SaleDayRow


def _row(
    name: str,
    quantity_delta: int,
    note: str | None,
    config: dict[str, object] | None,
    product_id=None,
    reference_id=None,
) -> MovementRow:
    return MovementRow(
        reference_id=reference_id or uuid4(),
        product_id=product_id or uuid4(),
        product_name=name,
        quantity_delta=quantity_delta,
        note=note,
        config=config,
    )


# The Triangle 28/19 2m, as record_sale writes it: every component movement of
# one sale shares the same reference and the same snapshot, and the snapshot's
# component ids match the movements they created.
def _triangle(reference_id, quantity: int = 1) -> list[MovementRow]:
    tube28, tube19, support, motif = uuid4(), uuid4(), uuid4(), uuid4()
    snapshot: dict[str, object] = {
        "quantity": quantity,
        "unit_price_cents": 5000,
        "components": [
            {"product_id": tube28, "name": "Tube 28 2m", "pieces_required": 1},
            {"product_id": tube19, "name": "Tube 19 2m", "pieces_required": 1},
            {"product_id": support, "name": "Support 28/19", "pieces_required": 2},
            {"product_id": motif, "name": "Motif 28", "pieces_required": 1},
        ],
    }
    return [
        _row("Tube 28 2m", -quantity, "Triangle 28/19 2m", snapshot, tube28, reference_id),
        _row("Tube 19 2m", -quantity, "Triangle 28/19 2m", snapshot, tube19, reference_id),
        _row("Support 28/19", -2 * quantity, "Triangle 28/19 2m", snapshot, support, reference_id),
        _row("Motif 28", -quantity, "Triangle 28/19 2m", snapshot, motif, reference_id),
    ]


def test_components_fold_back_into_a_single_parent_row() -> None:
    assert aggregate_day(_triangle(uuid4())) == [
        SaleDayRow(name="Triangle 28/19 2m", quantity=1, unit_price_cents=5000, total_cents=5000)
    ]


def test_selling_two_units_shows_quantity_two() -> None:
    result = aggregate_day(_triangle(uuid4(), quantity=2))
    assert len(result) == 1
    assert result[0].quantity == 2
    assert result[0].total_cents == 10000


def test_same_triangle_sold_in_two_sales_is_summed() -> None:
    rows = _triangle(uuid4()) + _triangle(uuid4(), quantity=2)
    result = aggregate_day(rows)
    assert result == [
        SaleDayRow(name="Triangle 28/19 2m", quantity=3, unit_price_cents=5000, total_cents=15000)
    ]


def test_simple_product_shows_itself() -> None:
    reference_id = uuid4()
    result = aggregate_day(
        [
            _row(
                "Porte Chaussure 3 étages bois",
                -3,
                None,
                {"quantity": 3, "unit_price_cents": 2000},
                reference_id=reference_id,
            )
        ]
    )
    assert result == [
        SaleDayRow(
            name="Porte Chaussure 3 étages bois",
            quantity=3,
            unit_price_cents=2000,
            total_cents=6000,
        )
    ]


def test_same_product_across_two_sales_is_summed() -> None:
    rows = [
        _row("Porte Chaussure", -2, None, {"quantity": 2, "unit_price_cents": 1000}),
        _row("Porte Chaussure", -1, None, {"quantity": 1, "unit_price_cents": 1000}),
    ]
    result = aggregate_day(rows)
    assert result == [
        SaleDayRow(name="Porte Chaussure", quantity=3, unit_price_cents=1000, total_cents=3000)
    ]


def test_two_sales_at_different_prices_keep_separate_revenue() -> None:
    rows = [
        _row("Porte Chaussure", -2, None, {"quantity": 2, "unit_price_cents": 1000}),
        _row("Porte Chaussure", -1, None, {"quantity": 1, "unit_price_cents": 1500}),
    ]
    result = aggregate_day(rows)
    assert result[0].quantity == 3
    assert result[0].total_cents == 3500


def test_legacy_configurable_derives_quantity_from_components() -> None:
    # Sold before `quantity` was recorded: the snapshot still lists the
    # components, so the unit count divides out of the summed deltas.
    reference_id = uuid4()
    legacy: dict[str, object] = {
        "unit_price_cents": 5000,
        "components": [{"name": "Support 28/19", "pieces_required": 2}],
    }
    rows = [
        _row("Support 28/19", -4, "Triangle 28/19 2m", legacy, reference_id=reference_id),
        _row("Tube 28 2m", -2, "Triangle 28/19 2m", legacy, reference_id=reference_id),
    ]
    result = aggregate_day(rows)
    assert result == [
        SaleDayRow(name="Triangle 28/19 2m", quantity=2, unit_price_cents=5000, total_cents=10000)
    ]


def test_legacy_kit_without_snapshot_stays_unmerged() -> None:
    # Pre-snapshot kits have no config at all: there is no reliable unit count,
    # so the components stay as their own product rows instead of guessing.
    reference_id = uuid4()
    rows = [
        _row("Tube 28 2m", -1, "Triangle Fix 4600 DA", None, reference_id=reference_id),
        _row("Bouchon Argent 19mm", -2, "Triangle Fix 4600 DA", None, reference_id=reference_id),
    ]
    result = aggregate_day(rows)
    assert sorted(row.name for row in result) == ["Bouchon Argent 19mm", "Tube 28 2m"]
    assert {row.quantity for row in result} == {1, 2}


def test_kit_with_snapshot_folds_into_the_kit_name() -> None:
    # New kits store the units sold in the snapshot even though they have no
    # component list, so they fold too.
    reference_id = uuid4()
    snapshot: dict[str, object] = {"quantity": 1, "unit_price_cents": 8000}
    rows = [
        _row("Tube 28 2m", -1, "Triangle Fix 4600 DA", snapshot, reference_id=reference_id),
        _row(
            "Bouchon Argent 19mm", -2, "Triangle Fix 4600 DA", snapshot, reference_id=reference_id
        ),
    ]
    result = aggregate_day(rows)
    assert result == [
        SaleDayRow(name="Triangle Fix 4600 DA", quantity=1, unit_price_cents=8000, total_cents=8000)
    ]


def test_row_without_a_price_records_units_but_no_total() -> None:
    rows = [_row("Tube 28 2m", -1, "Triangle 28/19 2m", {"quantity": 1})]
    result = aggregate_day(rows)
    assert result[0].quantity == 1
    assert result[0].unit_price_cents is None
    assert result[0].total_cents is None
