"""Pair/piece conversion and the buildable-quantity rule.

These are pure-arithmetic tests over the model's own conversion, deliberately
free of a database: getting the pair multiplier wrong would under-deduct stock
on every sale, and that is worth pinning down independently of any I/O.
"""

import pytest

from app.products.models import PIECES_PER_UNIT, BomUnit, ProductBomLine


def _line(quantity: int, unit: BomUnit) -> ProductBomLine:
    return ProductBomLine(quantity=quantity, unit=unit)


def test_a_piece_is_one_piece() -> None:
    assert _line(1, BomUnit.PIECE).pieces_required == 1


def test_a_pair_is_two_pieces() -> None:
    # "1 paire support 19/19" must deduct 2 supports, not 1.
    assert _line(1, BomUnit.PAIR).pieces_required == 2


def test_three_pieces_stays_odd() -> None:
    # Kit 7800 calls for "3 pce support 28/19" — an odd count that a
    # pair-only model could not express.
    assert _line(3, BomUnit.PIECE).pieces_required == 3


def test_two_bouchons() -> None:
    assert _line(2, BomUnit.PIECE).pieces_required == 2


def test_every_unit_has_a_multiplier() -> None:
    # A new BomUnit member without an entry here would raise KeyError at
    # deduction time, i.e. mid-sale.
    for unit in BomUnit:
        assert unit in PIECES_PER_UNIT
        assert PIECES_PER_UNIT[unit] >= 1


def _builds(available: int, pieces_required: int) -> int:
    return available // pieces_required


@pytest.mark.parametrize(
    ("available", "pieces_required", "expected"),
    [
        (10, 1, 10),
        (10, 2, 5),
        (9, 2, 4),  # partial pair does not count as buildable
        (1, 2, 0),
        (0, 1, 0),
        (7, 3, 2),
    ],
)
def test_component_build_count_floors(available: int, pieces_required: int, expected: int) -> None:
    assert _builds(available, pieces_required) == expected


def test_kit_is_capped_by_its_scarcest_component() -> None:
    # Triangle 4600: plenty of tubes, only enough supports for two.
    per_component = [
        _builds(20, 1),  # tube 28
        _builds(20, 1),  # tube 19
        _builds(5, 2),  # 1 paire support -> 2 pieces -> builds 2
        _builds(9, 1),  # motif cristal
        _builds(30, 2),  # 2 bouchons
    ]
    assert min(per_component) == 2
