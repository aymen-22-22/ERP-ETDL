"""Kit explosion arithmetic: what a sale actually takes off the shelf.

Pure functions mirroring `sales_service.record_sale`, tested without a
database. A mistake here silently corrupts stock — it deducts the wrong
number and nothing complains — so the arithmetic is pinned separately from
the I/O around it.
"""

from app.products.models import PIECES_PER_UNIT, BomUnit


def _pieces(quantity: int, unit: BomUnit) -> int:
    return quantity * PIECES_PER_UNIT[unit]


# Triangle Fix 4600 DA, exactly as specified by the business.
TRIANGLE_4600 = [
    ("Tube 28 2m Torsadi Argent", 1, BomUnit.PIECE),
    ("Tube 19 2m Liss Argent", 1, BomUnit.PIECE),
    ("Support Cristal 28/19 Dorre", 1, BomUnit.PAIR),
    ("Motif Cristal 28 Dorre K19", 1, BomUnit.PIECE),
    ("Bouchon Argent 19mm", 2, BomUnit.PIECE),
]


def _explode(recipe: list[tuple[str, int, BomUnit]], sold: int) -> dict[str, int]:
    required: dict[str, int] = {}
    for name, quantity, unit in recipe:
        required[name] = required.get(name, 0) + _pieces(quantity, unit) * sold
    return required


def test_selling_one_kit_deducts_its_recipe() -> None:
    assert _explode(TRIANGLE_4600, 1) == {
        "Tube 28 2m Torsadi Argent": 1,
        "Tube 19 2m Liss Argent": 1,
        # 1 pair -> 2 individual supports.
        "Support Cristal 28/19 Dorre": 2,
        "Motif Cristal 28 Dorre K19": 1,
        "Bouchon Argent 19mm": 2,
    }


def test_quantity_multiplies_every_component() -> None:
    assert _explode(TRIANGLE_4600, 3) == {
        "Tube 28 2m Torsadi Argent": 3,
        "Tube 19 2m Liss Argent": 3,
        "Support Cristal 28/19 Dorre": 6,
        "Motif Cristal 28 Dorre K19": 3,
        "Bouchon Argent 19mm": 6,
    }


def test_the_kit_itself_is_never_deducted() -> None:
    # The whole point: there is no "Triangle Fix" stock to take from.
    assert "Triangle Fix 4600 DA" not in _explode(TRIANGLE_4600, 1)


def test_shared_components_across_lines_are_summed() -> None:
    # A basket with two different triangles both taking bouchons. Checking the
    # lines independently would let a basket through that the shelf cannot
    # fill; summing first is what catches it.
    triangle_3900 = [
        ("Tube 19 2m Liss Argent", 2, BomUnit.PIECE),
        ("Support Liss 19/19 Dorre", 1, BomUnit.PAIR),
        ("Motif Cristal 28 Dorre K19", 1, BomUnit.PIECE),
        ("Bouchon Argent 19mm", 2, BomUnit.PIECE),
    ]
    combined: dict[str, int] = {}
    for recipe, sold in ((TRIANGLE_4600, 1), (triangle_3900, 1)):
        for name, quantity in _explode(recipe, sold).items():
            combined[name] = combined.get(name, 0) + quantity

    assert combined["Bouchon Argent 19mm"] == 4
    assert combined["Tube 19 2m Liss Argent"] == 3
    assert combined["Motif Cristal 28 Dorre K19"] == 2


def test_shortage_is_detected_against_the_summed_requirement() -> None:
    available = {"Bouchon Argent 19mm": 3}
    required = {"Bouchon Argent 19mm": 4}
    shortages = [name for name, need in required.items() if available.get(name, 0) < need]
    assert shortages == ["Bouchon Argent 19mm"]


def test_a_simple_product_deducts_itself_one_for_one() -> None:
    assert _explode([("Porte Chaussure 3 étages bois", 1, BomUnit.PIECE)], 2) == {
        "Porte Chaussure 3 étages bois": 2
    }
