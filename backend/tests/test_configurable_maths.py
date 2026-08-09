"""Configurable-product resolution arithmetic: attribute substitution and the
sale-line description.

Pure functions mirroring `configurable_service`, tested without a database. The
substitution turns a recipe *pattern* into a concrete attribute match (that is
what finds the right Support / Motif / Tube / Bouchon on the shelf), and the
display name is what lands in the ledger as `sold_as` — a slip there names the
sale wrong.
"""

from app.products.configurable_service import build_display_name, substitute_attributes


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
