from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, computed_field, field_validator

from app.inventory.models import MovementType


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
    created_at: datetime

    model_config = {"from_attributes": True}


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
