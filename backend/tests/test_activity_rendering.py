"""Human-readable rendering of change_log entries into the activity feed.

Pure-string tests, deliberately free of a database: the activity feed's whole
point is that a non-technical owner can read "Sale: 3 × Tube 28 2m Torsadi
Argent at Main Warehouse" at a glance, so the rendering rules are pinned down
independently of any I/O.
"""

from app.monitoring.service import MOVEMENT_LABELS, render_activity_message
from app.sync.models import ChangeOperation


def _product_payload(name: str, sku: str) -> dict[str, object]:
    return {"name": name, "sku": sku}


def _movement_payload(
    movement_type: str, quantity_delta: int, note: str | None = None
) -> dict[str, object]:
    payload: dict[str, object] = {
        "product_id": "019f9108-974e-7103-ba73-c5c91a695b43",
        "warehouse_id": "019f9108-974e-7103-ba73-c5caef7fca88",
        "movement_type": movement_type,
        "quantity_delta": quantity_delta,
    }
    if note is not None:
        payload["note"] = note
    return payload


def test_product_create_message() -> None:
    message = render_activity_message(
        ChangeOperation.CREATE,
        "product",
        _product_payload("Tube 28 2m Torsadi Argent", "TUB-28-2M"),
    )
    assert message == "Created product 'Tube 28 2m Torsadi Argent' (SKU TUB-28-2M)"


def test_product_update_message() -> None:
    message = render_activity_message(
        ChangeOperation.UPDATE,
        "product",
        _product_payload("Tube 28 2m Torsadi Argent", "TUB-28-2M"),
    )
    assert message == "Updated product 'Tube 28 2m Torsadi Argent' (SKU TUB-28-2M)"


def test_product_delete_message() -> None:
    message = render_activity_message(
        ChangeOperation.DELETE, "product", _product_payload("Old Motif", "MOT-OLD")
    )
    assert message == "Deleted product 'Old Motif' (SKU MOT-OLD)"


def test_sale_movement_message_with_names() -> None:
    message = render_activity_message(
        ChangeOperation.CREATE,
        "inventory_movement",
        _movement_payload("sale", -3),
        product_name="Tube 28 2m Torsadi Argent",
        warehouse_name="Main Warehouse",
    )
    assert message == "Sale: 3 × Tube 28 2m Torsadi Argent at Main Warehouse"


def test_purchase_movement_message_with_names() -> None:
    message = render_activity_message(
        ChangeOperation.CREATE,
        "inventory_movement",
        _movement_payload("purchase", 10),
        product_name="Bouchon Cristal",
        warehouse_name="Depot",
    )
    assert message == "Purchase: 10 × Bouchon Cristal at Depot"


def test_transfer_out_movement_message() -> None:
    message = render_activity_message(
        ChangeOperation.CREATE,
        "inventory_movement",
        _movement_payload("transfer_out", -5),
        product_name="Support 19/19",
        warehouse_name="Store",
    )
    assert message == "Transfer out: 5 × Support 19/19 at Store"


def test_movement_message_appends_note() -> None:
    message = render_activity_message(
        ChangeOperation.CREATE,
        "inventory_movement",
        _movement_payload("adjustment", 2, note="count correction"),
        product_name="Tube 19 1m",
        warehouse_name="Depot",
    )
    assert message == "Adjustment: 2 × Tube 19 1m at Depot — count correction"


def test_movement_message_with_deleted_references() -> None:
    # The product/warehouse may be soft-deleted; rendering must not crash and
    # should say so plainly rather than produce an empty string.
    message = render_activity_message(
        ChangeOperation.CREATE, "inventory_movement", _movement_payload("sale", -1)
    )
    assert "(deleted product)" in message
    assert "(deleted warehouse)" in message


def test_every_movement_type_has_a_label() -> None:
    movement_types = (
        "purchase",
        "sale",
        "return",
        "damage",
        "adjustment",
        "transfer_out",
        "transfer_in",
    )
    for movement_type in movement_types:
        assert movement_type in MOVEMENT_LABELS
        assert MOVEMENT_LABELS[movement_type].strip()
