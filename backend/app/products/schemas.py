from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field

from app.products.models import ProductStatus, ProductType


class ProductCreate(BaseModel):
    """`id` is optional: the server generates a UUIDv7 when the client omits
    one (the REST client always omits it now that offline-queued creates are
    gone).
    """

    id: UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(min_length=1, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    description: str | None = None
    price: Decimal = Field(gt=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    status: ProductStatus = ProductStatus.ACTIVE
    product_type: ProductType = ProductType.SIMPLE
    attributes: dict[str, str] = Field(default_factory=dict)
    category_id: UUID | None = None
    brand_id: UUID | None = None
    unit_id: UUID | None = None
    default_warehouse_id: UUID | None = None
    initial_stock: int | None = Field(default=None, ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, min_length=1, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    status: ProductStatus | None = None
    category_id: UUID | None = None
    brand_id: UUID | None = None
    unit_id: UUID | None = None
    default_warehouse_id: UUID | None = None


class BulkDeleteRequest(BaseModel):
    product_ids: list[UUID] = Field(min_length=1, max_length=200)


class BulkDeleteResult(BaseModel):
    deleted_count: int


class ProductRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    sku: str
    barcode: str | None
    description: str | None
    price: Decimal
    cost_price: Decimal | None
    status: ProductStatus
    product_type: ProductType
    attributes: dict[str, str]
    category_id: UUID | None
    brand_id: UUID | None
    unit_id: UUID | None
    default_warehouse_id: UUID | None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductSort(StrEnum):
    NAME = "name"
    NAME_DESC = "-name"
    PRICE = "price"
    PRICE_DESC = "-price"
    CREATED = "created_at"
    CREATED_DESC = "-created_at"


class ProductQuery(BaseModel):
    """Parsed list-endpoint query params: search + filters + sort."""

    search: str | None = None
    category_id: UUID | None = None
    brand_id: UUID | None = None
    status: ProductStatus | None = None
    sort: ProductSort = ProductSort.NAME
