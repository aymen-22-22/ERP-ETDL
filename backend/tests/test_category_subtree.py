"""Subtree expansion for category filtering.

A top-level category is a folder in this catalogue: products live in its
children ("Accessories > Tube 19 mm"), so filtering on "Accessories" has to
match products whose category is any descendant. The pure part — walking a
(parent_id) forest — is covered here; the SQL wrapper just feeds it rows.
"""

from uuid import uuid4

from app.products.catalog_service import _descendant_ids


def _ids(*ids: str) -> list[str]:
    return list(ids)


def test_leaf_category_is_just_itself() -> None:
    root, tube19 = uuid4(), uuid4()
    rows = [(tube19, root)]
    assert [str(i) for i in _descendant_ids(rows, tube19)] == _ids(str(tube19))


def test_parent_includes_every_descendant_depth() -> None:
    root = uuid4()
    child = uuid4()
    grandchild = uuid4()
    great = uuid4()
    rows = [
        (child, root),
        (grandchild, child),
        (great, grandchild),
    ]
    assert [str(i) for i in _descendant_ids(rows, root)] == _ids(
        str(root), str(child), str(grandchild), str(great)
    )


def test_forest_branches_are_all_collected() -> None:
    root = uuid4()
    tube19, tube28, motif = uuid4(), uuid4(), uuid4()
    rows = [
        (tube19, root),
        (tube28, root),
        (motif, root),
    ]
    result = {str(i) for i in _descendant_ids(rows, root)}
    assert result == set(_ids(str(root), str(tube19), str(tube28), str(motif)))


def test_unrelated_branches_are_not_included() -> None:
    root = uuid4()
    other_root = uuid4()
    child = uuid4()
    other_child = uuid4()
    rows = [
        (child, root),
        (other_child, other_root),
    ]
    assert [str(i) for i in _descendant_ids(rows, root)] == _ids(str(root), str(child))


def test_rootless_rows_do_not_break_the_walk() -> None:
    root = uuid4()
    child = uuid4()
    rows = [(child, root), (uuid4(), None)]
    assert [str(i) for i in _descendant_ids(rows, root)] == _ids(str(root), str(child))
