"""Folding a day's sale movements back into the cart lines that caused them.

A sale writes one movement per product deducted. A kit or a CONFIGURABLE
product expands into its components, so one "Triangle 28/19 2m" sold twice
looks like several movements (Tube 28, Tube 19, support, motif). The "by day"
view wants what the cashier actually rung up: `2x Triangle 28/19 2m`, not a
wall of component rows.

The fold happens in two passes. First the movements of each sale are grouped
by their `note` (the cart line they came from): the component quantities are
summed and divided by the component's `pieces_required`, which yields the
units of that cart line regardless of how many components it expanded into.
Then the folded lines are summed by name across the whole day. Revenue is
accumulated per folded line (unit price x units) so two sales of the same
product at different prices add up correctly.

New snapshots carry `quantity` directly and are used for kits, which never
stored a component list. Legacy CONFIGURABLE snapshots are still folded —
their component list gives `pieces_required` — and legacy kits, with no
snapshot at all, stay as one row per component rather than being guessed.

Pure functions over plain rows, tested without a database.
"""

from collections import OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass, field
from uuid import UUID

from app.inventory.schemas import SaleDayRow


@dataclass(frozen=True)
class MovementRow:
    """The slice of an InventoryMovement the day view needs."""

    reference_id: UUID | None
    product_id: UUID
    product_name: str
    quantity_delta: int
    note: str | None
    config: dict[str, object] | None


@dataclass
class _MergedGroup:
    """The component movements of one cart line within one sale."""

    name: str
    quantities: set[int] = field(default_factory=set)
    deltas: dict[str, tuple[str, int]] = field(default_factory=dict)
    config: dict[str, object] | None = None
    price: int | None = None

    def add(self, row: MovementRow) -> None:
        config = row.config or {}
        quantity = _as_int(config.get("quantity"))
        if quantity is not None:
            self.quantities.add(quantity)
        product_key = str(row.product_id)
        _, current = self.deltas.get(product_key, (row.product_name, 0))
        self.deltas[product_key] = (row.product_name, current + abs(row.quantity_delta))
        self.config = self.config or config
        price = _as_int(config.get("unit_price_cents"))
        self.price = self.price if self.price is not None else price

    def units(self) -> int | None:
        """Units of the cart line, when reconstructable from the group."""
        components = self.config.get("components") if self.config else None
        if isinstance(components, list) and components:
            # CONFIGURABLE: every component's summed delta is
            # `pieces_required x units`, so the ratio divides back out.
            best = 0
            for component in components:
                if not isinstance(component, dict):
                    continue
                pieces = _as_int(component.get("pieces_required"))
                if not pieces:
                    continue
                component_id = component.get("product_id")
                key = str(component_id) if component_id else None
                if key is None:
                    key = next(
                        (
                            pid
                            for pid, (name, _) in self.deltas.items()
                            if name == component.get("name")
                        ),
                        None,
                    )
                if key is None:
                    continue
                total = self.deltas.get(key, ("", 0))[1]
                if total:
                    best = max(best, total // pieces)
            return best or None
        if self.quantities:
            # Kits never stored a component list; new snapshots carry the
            # units sold directly. Identical rows of one line share the value.
            return max(self.quantities)
        return None


@dataclass
class _ProductGroup:
    """One simple product's movements within one sale."""

    name: str
    units: int = 0
    price: int | None = None


def _as_int(value: object) -> int | None:
    return value if isinstance(value, int) else None


def aggregate_day(rows: Iterable[MovementRow]) -> list[SaleDayRow]:
    """Merge a day's movements into per-cart-line rows, sorted by name.

    `quantity` is always units of the thing shown: the cart line for kits and
    CONFIGURABLE products (their components folded in), the product itself for
    simple products. `total_cents` is set only when every line of the row had
    a recorded unit price.
    """
    merged: OrderedDict[tuple[str, str], _MergedGroup] = OrderedDict()
    products: OrderedDict[tuple[str, str], _ProductGroup] = OrderedDict()

    for row in rows:
        config = row.config or {}
        has_snapshot = config.get("quantity") is not None or bool(config.get("components"))
        if row.note is not None and has_snapshot:
            key = (str(row.reference_id), row.note)
            merged_group = merged.get(key)
            if merged_group is None:
                merged_group = _MergedGroup(name=row.note)
                merged[key] = merged_group
            merged_group.add(row)
        else:
            # A simple product, or a legacy kit with no snapshot: show the
            # product (or component) itself.
            key = (str(row.reference_id), str(row.product_id))
            product_group = products.get(key)
            if product_group is None:
                product_group = _ProductGroup(name=row.product_name)
                products[key] = product_group
            product_group.units += abs(row.quantity_delta)
            price = _as_int(config.get("unit_price_cents"))
            product_group.price = product_group.price if product_group.price is not None else price

    folded: list[tuple[str, int, int | None, int | None]] = []
    for merged_group in merged.values():
        units = merged_group.units()
        if units is None:
            for name, delta in merged_group.deltas.values():
                folded.append(
                    (
                        name,
                        delta,
                        merged_group.price,
                        merged_group.price * delta if merged_group.price else None,
                    )
                )
        else:
            folded.append(
                (
                    merged_group.name,
                    units,
                    merged_group.price,
                    merged_group.price * units if merged_group.price else None,
                )
            )
    for product_group in products.values():
        revenue = product_group.price * product_group.units if product_group.price else None
        folded.append((product_group.name, product_group.units, product_group.price, revenue))

    # Aggregate cart lines with the same name across the day.
    final: OrderedDict[str, tuple[str, int, int | None, int, bool]] = OrderedDict()
    for name, units, price, revenue in folded:
        existing = final.get(name)
        if existing is None:
            final[name] = (
                name,
                units,
                price,
                revenue if revenue is not None else 0,
                revenue is None,
            )
        else:
            prev_name, prev_units, prev_price, prev_revenue, missing = existing
            final[name] = (
                prev_name,
                prev_units + units,
                prev_price if prev_price is not None else price,
                prev_revenue + (revenue if revenue is not None else 0),
                missing or revenue is None,
            )

    return [
        SaleDayRow(
            name=name,
            quantity=quantity,
            unit_price_cents=unit_price,
            total_cents=None if missing_price else total_cents,
        )
        for name, quantity, unit_price, total_cents, missing_price in final.values()
    ]
