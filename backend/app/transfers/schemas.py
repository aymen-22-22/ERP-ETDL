from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.transfers.models import TransferStatus


class TransferLineCreate(BaseModel):
    product_id: UUID
    quantity: int = Field(gt=0)


class TransferCreate(BaseModel):
    source_warehouse_id: UUID
    dest_warehouse_id: UUID
    note: str | None = Field(default=None, max_length=500)
    lines: list[TransferLineCreate] = Field(min_length=1)


class TransferLinesUpdate(BaseModel):
    lines: list[TransferLineCreate] = Field(min_length=1)


class TransferLineRead(BaseModel):
    id: UUID
    product_id: UUID
    quantity: int

    model_config = {"from_attributes": True}


class TransferRead(BaseModel):
    id: UUID
    tenant_id: UUID
    source_warehouse_id: UUID
    dest_warehouse_id: UUID
    status: TransferStatus
    requested_by: UUID | None
    approved_by: UUID | None
    note: str | None
    submitted_at: datetime | None
    approved_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[TransferLineRead] = []

    model_config = {"from_attributes": True}
