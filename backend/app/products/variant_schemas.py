from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.products.schemas import OpeningStock


class VariantSchemeRead(BaseModel):
    """The naming rule for one category, and the values to offer as pickers."""

    category_id: UUID
    base_name: str
    sku_prefix: str
    attribute_keys: list[str]
    allowed_values: dict[str, list[str]]

    model_config = {"from_attributes": True}


class VariantPreviewRequest(BaseModel):
    category_id: UUID
    # {"diameter": ["28", "19"], "color": ["Argent"]} -> the cartesian product
    # of these is what gets generated.
    selected_values: dict[str, list[str]]


class VariantPreviewItem(BaseModel):
    name: str
    sku: str
    attributes: dict[str, str]
    # True when the tenant already has this SKU; generating will skip it.
    already_exists: bool


class VariantGenerateItem(BaseModel):
    attributes: dict[str, str]
    price: Decimal = Field(gt=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    # Opening stock per warehouse, same shape as ProductCreate.opening_stock.
    opening_stock: list[OpeningStock] = Field(default_factory=list)


class VariantGenerateRequest(BaseModel):
    """Prices come per item because they genuinely differ per variant — a 4m
    tube is not priced like a 2m one — so the client sends back the previewed
    grid with a price and an opening count filled in on each row.

    Counting stock in here rather than afterwards is deliberate: a 16-row tube
    grid would otherwise mean 32 separate trips through the stock-adjustment
    screen (two warehouses each), which is exactly how counts drift.
    """

    category_id: UUID
    default_warehouse_id: UUID | None = None
    items: list[VariantGenerateItem] = Field(min_length=1)


class VariantGenerateResult(BaseModel):
    created_count: int
    skipped_skus: list[str]
