"""Configurable-product resolution arithmetic: attribute substitution and the
sale-line description.

Pure functions mirroring `configurable_service`, tested without a database. The
substitution turns a recipe *pattern* into a concrete attribute match (that is
what finds the right Support / Motif / Tube / Bouchon on the shelf), and the
display name is what lands in the ledger as `sold_as` — a slip there names the
sale wrong.
"""

from app.products.configurable_service import build_display_name, substitute_attributes
from app.products.models import BomUnit, ConfigurableRecipeLine


def test_substitution_fills_till_axes_into_attributes() -> None:
    attributes = {"model": "@support", "size": "28/19"}
    configuration = {"support": "F3", "length": "4m", "color": "GD"}
    assert substitute_attributes(attributes, configuration) == {
        "model": "F3",
        "size": "28/19",
    }


def test_color_and_length_are_substituted_like_any_axis() -> None:
    attributes = {"length": "@length", "color": "@color"}
    configuration = {"support": "F3", "length": "4m", "color": "GD"}
    assert substitute_attributes(attributes, configuration) == {
        "length": "4m",
        "color": "GD",
    }


def test_unknown_placeholder_is_left_alone() -> None:
    # A typo'd "@motiff" must not silently vanish into an unconstrained match —
    # it stays literal, so no product matches and the error points at the axis.
    attributes = {"model": "@motiff"}
    assert substitute_attributes(attributes, {"motif": "K19"}) == {"model": "@motiff"}


def test_plain_values_survive_substitution() -> None:
    assert substitute_attributes({"model": "Cristal"}, {}) == {"model": "Cristal"}


def test_display_name_is_structure_then_colour_then_length() -> None:
    options = {
        "support": ["F1", "F2", "F3", "F4"],
        "motif": ["K19"],
        "color": ["GD", "CH"],
    }
    name = build_display_name(
        "Triangle Double 28/19",
        options,
        color_key="color",
        length_key="length",
        configuration={"support": "F3", "motif": "K19", "color": "GD", "length": "4m"},
    )
    assert name == "Triangle Double 28/19 F3 GD 4m"


def test_single_value_axes_are_omitted_from_the_name() -> None:
    # A fixed motif is part of the product's identity, not of the choice being
    # described — "Triangle Double 28/19 F3 GD 4m", not "... F3 K19 GD 4m".
    options = {"support": ["F1", "F2", "F3"], "motif": ["K19"], "color": ["GD"]}
    name = build_display_name(
        "Triangle Double 28/19",
        options,
        color_key="color",
        length_key="length",
        configuration={"support": "F2", "motif": "K19", "color": "GD", "length": "2m"},
    )
    assert name == "Triangle Double 28/19 F2 GD 2m"


def test_missing_optional_values_are_omitted() -> None:
    options = {"support": ["F1", "F2"], "color": ["GD", "CH"]}
    name = build_display_name(
        "Triangle Double 28/19",
        options,
        color_key="color",
        length_key="length",
        configuration={"support": "F3", "length": "4m"},
    )
    assert name == "Triangle Double 28/19 F3 4m"


def _line(
    quantity: int, quantity_by_length: dict[str, int] | None = None
) -> ConfigurableRecipeLine:
    return ConfigurableRecipeLine(
        label="Support",
        quantity=quantity,
        quantity_by_length=quantity_by_length or {},
        unit=BomUnit.PIECE,
    )


def test_effective_quantity_uses_the_length_override() -> None:
    # 2 supports normally, 3 at 4m — the third piece only comes off the shelf
    # when the chosen length is exactly the one with the override.
    line = _line(2, {"4m": 3})
    assert line.effective_quantity("4m") == 3
    assert line.effective_quantity("2m") == 2
    assert line.effective_quantity("5m") == 2


def test_effective_quantity_falls_back_without_overrides() -> None:
    assert _line(2).effective_quantity("4m") == 2


def test_effective_quantity_handles_pairs() -> None:
    # A length override applies to the base quantity, before the pair doubling:
    # "3 pce" at 4m stays 3 pieces, "1 paire" elsewhere is 2 pieces.
    pair_line = ConfigurableRecipeLine(
        label="Support", quantity=1, quantity_by_length={"4m": 1}, unit=BomUnit.PAIR
    )
    assert pair_line.effective_quantity("4m") == 1
    assert pair_line.effective_quantity("2m") == 1
    assert pair_line.pieces_required == 2
