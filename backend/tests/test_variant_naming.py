"""The four real naming formulas from the business, as executable cases.

Each expectation below is a name the shop already uses, so a regression here
means the ERP would start generating names staff don't recognise.
"""

from app.products.variant_service import build_name, build_sku, expand_combinations

TUBE_KEYS = ["diameter", "length", "model", "color"]
MOTIF_KEYS = ["diameter", "color", "model"]
SUPPORT_KEYS = ["model", "color", "size"]
BOUCHON_KEYS = ["color", "size"]


def test_tube_name_and_sku() -> None:
    attrs = {"diameter": "28", "length": "2m", "model": "Torsadi", "color": "Argent"}
    assert build_name("Tube", TUBE_KEYS, attrs) == "Tube 28 2m Torsadi Argent"
    assert build_sku("TUB", TUBE_KEYS, attrs) == "TUB-28-2M-TOR-ARG"


def test_tube_sku_matches_the_convention_already_in_production() -> None:
    # An existing product carries SKU TUB-19-4M-TOR-ARG; the generator has to
    # reproduce that exactly or it would create a duplicate alongside it.
    attrs = {"diameter": "19", "length": "4m", "model": "Torsadi", "color": "Argent"}
    assert build_sku("TUB", TUBE_KEYS, attrs) == "TUB-19-4M-TOR-ARG"


def test_motif_reorders_color_before_model() -> None:
    attrs = {"diameter": "28", "color": "Dorre", "model": "K19"}
    assert build_name("Motif Cristal", MOTIF_KEYS, attrs) == "Motif Cristal 28 Dorre K19"
    # K19 keeps its digit: truncating to "K" would collide K19 with K20.
    assert build_sku("MOTC", MOTIF_KEYS, attrs) == "MOTC-28-DOR-K19"


def test_support_size_with_a_slash_survives_the_sku() -> None:
    attrs = {"model": "Liss", "color": "Dorre", "size": "19/19mm"}
    assert build_name("Support", SUPPORT_KEYS, attrs) == "Support Liss Dorre 19/19mm"
    assert build_sku("SUP", SUPPORT_KEYS, attrs) == "SUP-LIS-DOR-1919MM"


def test_bouchon_uses_only_two_axes() -> None:
    attrs = {"color": "Argent", "size": "19mm"}
    assert build_name("Bouchon", BOUCHON_KEYS, attrs) == "Bouchon Argent 19mm"
    assert build_sku("BOU", BOUCHON_KEYS, attrs) == "BOU-ARG-19MM"


def test_missing_axis_is_skipped_not_rendered_blank() -> None:
    attrs = {"diameter": "19", "model": "Liss", "color": "Argent"}
    assert build_name("Tube", TUBE_KEYS, attrs) == "Tube 19 Liss Argent"
    assert "  " not in build_name("Tube", TUBE_KEYS, attrs)
    assert build_sku("TUB", TUBE_KEYS, attrs) == "TUB-19-LIS-ARG"


def test_whitespace_in_values_does_not_leak_into_the_name() -> None:
    attrs = {"color": " Argent ", "size": "19mm"}
    assert build_name("Bouchon", BOUCHON_KEYS, attrs) == "Bouchon Argent 19mm"


def test_expand_combinations_is_a_cartesian_product_in_key_order() -> None:
    combos = expand_combinations(
        TUBE_KEYS,
        {
            "diameter": ["28", "19"],
            "length": ["2m", "4m"],
            "model": ["Torsadi"],
            "color": ["Argent", "Dorre"],
        },
    )
    assert len(combos) == 2 * 2 * 1 * 2
    assert combos[0] == {
        "diameter": "28",
        "length": "2m",
        "model": "Torsadi",
        "color": "Argent",
    }
    # Every combination is unique — a duplicate would mean a SKU collision.
    assert len({build_sku("TUB", TUBE_KEYS, c) for c in combos}) == len(combos)


def test_expand_combinations_drops_axes_with_no_selection() -> None:
    combos = expand_combinations(
        TUBE_KEYS, {"diameter": ["28"], "length": [], "model": ["Liss"], "color": []}
    )
    assert combos == [{"diameter": "28", "model": "Liss"}]


def test_expand_combinations_with_nothing_selected_generates_nothing() -> None:
    assert expand_combinations(TUBE_KEYS, {}) == []


def test_color_key_is_dropped_from_the_name_but_kept_in_the_sku() -> None:
    # "Tube 28 Torsadi 2m" is one structural product; Argent and Dorre are
    # colour rows underneath it, not two differently-named products.
    argent = {"diameter": "28", "length": "2m", "model": "Torsadi", "color": "Argent"}
    dorre = {"diameter": "28", "length": "2m", "model": "Torsadi", "color": "Dorre"}

    name_argent = build_name("Tube", TUBE_KEYS, argent, color_key="color")
    name_dorre = build_name("Tube", TUBE_KEYS, dorre, color_key="color")

    assert name_argent == name_dorre == "Tube 28 2m Torsadi"

    # The SKU must still tell them apart, or the second colour would collide
    # with the first and get silently skipped as "already exists".
    sku_argent = build_sku("TUB", TUBE_KEYS, argent)
    sku_dorre = build_sku("TUB", TUBE_KEYS, dorre)
    assert sku_argent == "TUB-28-2M-TOR-ARG"
    assert sku_dorre == "TUB-28-2M-TOR-DOR"
    assert sku_argent != sku_dorre


def test_without_a_color_key_every_axis_still_lands_in_the_name() -> None:
    # Backward compatible: a scheme that never sets color_key (the default)
    # behaves exactly as it did before this existed.
    attrs = {"diameter": "28", "length": "2m", "model": "Torsadi", "color": "Argent"}
    assert build_name("Tube", TUBE_KEYS, attrs) == "Tube 28 2m Torsadi Argent"
    assert build_name("Tube", TUBE_KEYS, attrs, color_key=None) == "Tube 28 2m Torsadi Argent"
