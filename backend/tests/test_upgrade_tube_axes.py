"""Upgrade-script helpers: recognising tube recipe lines and their rail
diameters.

Pure functions mirroring scripts/upgrade_configurable_tube_axes.py, tested
without a database. Getting these wrong silently rewrites the wrong recipe
lines — or leaves a tube line fixed to "Liss" with no till choice.
"""

from scripts.upgrade_configurable_tube_axes import _is_tube_line, _tube_diameter


def test_diameter_from_category_name() -> None:
    assert _tube_diameter("Tube 28mm", "Tube") == "28"
    assert _tube_diameter("Tube 19mm", "Tube") == "19"


def test_diameter_from_label_when_category_is_missing() -> None:
    assert _tube_diameter(None, "Tube 28") == "28"
    assert _tube_diameter(None, "Tube") is None


def test_diameter_prefers_category_over_label() -> None:
    assert _tube_diameter("Tube 28mm", "Tube 19") == "28"


def test_is_tube_line_matches_by_label_or_category() -> None:
    assert _is_tube_line("Tube 28", "Triangle > Tubes > Tube 28mm")
    assert _is_tube_line("Tube 28", None)
    assert _is_tube_line("Motif", "Triangle > Accessoires > Motif") is False
    assert _is_tube_line("Support", "Triangle > Accessoires > Support Simple") is False
