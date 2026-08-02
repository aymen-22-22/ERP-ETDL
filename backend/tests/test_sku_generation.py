"""SKU prefix derivation.

Only the pure part is covered here — picking the next free number needs a
database. The prefix is where the interesting cases are: the catalogue is
French, so accents and punctuation are the norm, not the exception.
"""

import pytest

from app.products.service import _sku_prefix_from


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        # The examples from the brief.
        ("Porte Chaussure", "PC"),
        ("Triangle Fix", "TF"),
        # Accents must not leak into a SKU.
        ("Décoration", "D"),
        ("Porte Clé", "PC"),
        ("Veilleuses", "V"),
        # Digits and punctuation are not initials.
        ("Trois / Cinq lampes", "TCL"),
        ("Tube 28mm", "TM"),
        ("2.1 Triangle Extensible", "TE"),
        # Long names are capped so the prefix stays a prefix.
        ("Alpha Beta Gamma Delta Epsilon", "ABGD"),
    ],
)
def test_prefix_from_name(name: str, expected: str) -> None:
    assert _sku_prefix_from(name) == expected


def test_prefix_falls_back_when_there_are_no_letters() -> None:
    # A category named only with digits would otherwise yield an empty prefix
    # and produce a SKU of "-001".
    assert _sku_prefix_from("2.4.1") == "PRD"
    assert _sku_prefix_from("") == "PRD"


def test_prefix_is_always_ascii_and_non_empty() -> None:
    for name in ["Décoration", "Porte Clé", "Trois / Cinq lampes", "", "123"]:
        prefix = _sku_prefix_from(name)
        assert prefix
        assert prefix.isascii()
        assert prefix.isupper()
