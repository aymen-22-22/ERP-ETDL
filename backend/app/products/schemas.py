from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field

from app.products.models import ProductStatus, ProductType


class OpeningStock(BaseModel):
    """Stock counted into one warehouse when the product is first created.

    A list of these replaces the single `initial_stock` + `default_warehouse_id`
    pair, because the shop counts a new product into the depot *and* the store
    in one go, and forcing two separate trips through the stock-adjustment
    screen is how counts drift.
    """

    warehouse_id: UUID
    quantity: int = Field(default=0, ge=0)
    # Low-stock alert threshold for this product in this warehouse. Optional:
    # not every product warrants an alert.
    min_quantity: int | None = Field(default=None, ge=0)


class ProductCreate(BaseModel):
    """`id` is optional: the server generates a UUIDv7 when the client omits
    one (the REST client always omits it now that offline-queued creates are
    gone).
    """

    id: UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    # Optional: the server derives one from the category when omitted
    # (Porte Chaussure -> PC-001). Hand-typed SKUs are how duplicates and
    # typos get in, and the operator has no way to know the next free number.
    sku: str | None = Field(default=None, min_length=1, max_length=100)
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
    # Legacy single-warehouse opening stock, kept because the Excel import
    # still uses it. `opening_stock` supersedes it; when both are sent the
    # list wins.
    initial_stock: int | None = Field(default=None, ge=0)
    opening_stock: list[OpeningStock] = Field(default_factory=list)


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


class FamilyRenameRequest(BaseModel):
    """New structural name for a product and every colour that shares it."""

    name: str = Field(min_length=1, max_length=255)


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
    # Populated by the router after the fact (a bulk lookup against
    # `product_images`, not a mapped column) — never set from `from_attributes`.
    image_url: str | None = None

    model_config = {"from_attributes": True}


class ProductImageRead(BaseModel):
    id: UUID
    product_id: UUID
    url: str
    sort_order: int
    is_primary: bool
    created_at: datetime

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
    # Generated variants are individually tracked products, so they belong in
    # the list by default — the POS prices from it and the recipe editor picks
    # components from it. The product *list page* opts out so a dozen tubes
    # don't bury everything else; it shows variant families instead.
    include_variants: bool = True
    # Configurable products are managed and offered from their own screens —
    # the /configurable admin list and the POS — so the product list page opts
    # out and they never appear as a plain row there. The POS and the recipe
    # editor keep the default.
    include_configurable: bool = True


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportSummary(BaseModel):
    """Result of an Excel import: rows are upserted by SKU (existing SKU ->
    update, new SKU -> create), and one bad row never aborts the rest of the
    batch -- it's reported in `errors` instead."""

    created: list[ProductRead]
    updated: list[ProductRead]
    errors: list[ImportRowError]
