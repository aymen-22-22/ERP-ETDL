"""Configurable-product resolution arithmetic: attribute substitution and the
sale-line description.

Pure functions mirroring `configurable_service`, tested without a database. The
substitution turns a recipe *pattern* into a concrete attribute match (that is
what finds the right Support / Motif / Tube / Bouchon on the shelf), and the
display name is what lands in the ledger as `sold_as` — a slip there names the
sale wrong.
"""

from app.products.configurable_service import (
    axis_binding,
    bound_catalogue_axes,
    build_display_name,
    substitute_attributes,
)
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


def _recipe_line(attributes: dict[str, str]) -> ConfigurableRecipeLine:
    return ConfigurableRecipeLine(
        label="Motif", attributes=attributes, quantity=1, unit=BomUnit.PIECE
    )


def test_axis_binding_finds_the_placeholder_and_fixed_attributes() -> None:
    # "Motif 28 Cristal K19" lives as a variant whose `model` attribute holds
    # the full value; the binding is the pair the catalogue derivation needs:
    # which attribute to collect, and the fixed matches that scope it.
    binding = axis_binding(
        _recipe_line({"color": "@color", "model": "@motif", "diameter": "28"}), "motif"
    )
    assert binding == ("model", {"diameter": "28"})


def test_axis_binding_skips_lines_without_the_placeholder() -> None:
    assert axis_binding(_recipe_line({"size": "28/19", "model": "@support"}), "motif") is None
    assert axis_binding(_recipe_line({"model": "Cristal"}), "motif") is None
    assert axis_binding(_recipe_line({}), "motif") is None


def test_axis_binding_matches_only_its_own_axis() -> None:
    # The same "model" attribute can bind tube on one line and motif on
    # another; each call must only see its own placeholder.
    line = _recipe_line({"model": "@tube", "diameter": "28"})
    assert axis_binding(line, "tube") == ("model", {"diameter": "28"})
    assert axis_binding(line, "motif") is None


def test_bound_catalogue_axes_lists_derived_axes_in_recipe() -> None:
    recipe = [
        _recipe_line({"model": "@tube", "diameter": "28"}),
        _recipe_line({"model": "@tube", "diameter": "19"}),
        _recipe_line({"model": "@motif", "diameter": "28"}),
        _recipe_line({"model": "@support", "size": "28/19"}),
        _recipe_line({"model": "Liss"}),
    ]
    assert bound_catalogue_axes(recipe) == ["motif", "tube"]


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
