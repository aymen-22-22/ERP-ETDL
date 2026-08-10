from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, computed_field, field_validator

from app.inventory.models import MovementType


class SaleLineInput(BaseModel):
    """One line as rung up at the till. For a kit this is the kit itself; the
    server expands it into components. For a CONFIGURABLE product the chosen
    configuration (support/motif/length/colour) is carried here so the server
    can re-resolve it against the current catalog — it never trusts a price
    or a component list sent from the browser, except that the cashier may
    explicitly discount a line, and that discounted unit price is what gets
    recorded on the ledger."""

    product_id: UUID
    quantity: int = Field(gt=0)
    configuration: dict[str, str] | None = None
    # What the customer was actually charged per unit — the cashier can
    # override the catalog price to discount a line. Optional for
    # compatibility, but the till always sends it.
    unit_price_cents: int | None = Field(default=None, ge=0)


class SaleRequest(BaseModel):
    warehouse_id: UUID
    lines: list[SaleLineInput] = Field(min_length=1, max_length=200)


class MovementCreate(BaseModel):
    # Optional: the server generates a UUIDv7 when the client omits one (the
    # REST client always omits it now that offline-queued creates are gone;
    # see the same fix on ProductCreate).
    id: UUID | None = None
    product_id: UUID
    warehouse_id: UUID
    movement_type: MovementType
    quantity_delta: int
    reference_id: UUID | None = None
    note: str | None = Field(default=None, max_length=500)
    # Snapshot of a CONFIGURABLE line as sold (chosen configuration + resolved
    # components), persisted with the movement so the ledger can reproduce it.
    config: dict[str, object] | None = None

    @field_validator("quantity_delta")
    @classmethod
    def quantity_delta_must_not_be_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("quantity_delta must not be zero")
        return value


class MovementRead(BaseModel):
    id: UUID
    tenant_id: UUID
    product_id: UUID
    warehouse_id: UUID
    movement_type: MovementType
    quantity_delta: int
    reference_id: UUID | None
    note: str | None
    config: dict[str, object] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SaleListItem(BaseModel):
    """One completed sale as the history list needs it: grouped from the
    SALE movements sharing a `reference_id`."""

    reference_id: UUID
    sold_at: datetime
    warehouse_id: UUID
    # How many product lines came off the shelf (kits expand to several).
    line_count: int
    # Total pieces deducted across all lines.
    total_quantity: int


class SaleLineRead(BaseModel):
    """One product deducted by a sale. `quantity` is the positive count taken
    off the shelf; `sold_as` is the cart line that caused it (a kit's name for
    an exploded component). `unit_price_cents` is what the customer was charged
    per unit, when one was recorded at the till."""

    product_id: UUID
    name: str
    sku: str
    quantity: int
    sold_as: str | None
    unit_price_cents: int | None = None


class SaleDetail(BaseModel):
    reference_id: UUID
    sold_at: datetime
    warehouse_id: UUID
    line_count: int
    total_quantity: int
    lines: list[SaleLineRead]


class StockSnapshotRead(BaseModel):
    product_id: UUID
    warehouse_id: UUID
    quantity_on_hand: int
    reserved_quantity: int
    min_quantity: int | None
    max_quantity: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def available_quantity(self) -> int:
        return self.quantity_on_hand - self.reserved_quantity
