from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.warehouses.models import WarehouseType


class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str | None = Field(default=None, max_length=30)
    warehouse_type: WarehouseType = WarehouseType.DEPOT
    is_active: bool = True
    allow_sales: bool = True
    allow_purchases: bool = True
    allow_transfers: bool = True
    allow_negative_stock: bool = False


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    code: str | None = Field(default=None, max_length=30)
    warehouse_type: WarehouseType | None = None
    is_active: bool | None = None
    allow_sales: bool | None = None
    allow_purchases: bool | None = None
    allow_transfers: bool | None = None
    allow_negative_stock: bool | None = None


class WarehouseRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    code: str | None
    warehouse_type: WarehouseType
    is_default: bool
    is_active: bool
    allow_sales: bool
    allow_purchases: bool
    allow_transfers: bool
    allow_negative_stock: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
