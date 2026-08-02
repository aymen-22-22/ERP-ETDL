from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


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


class VariantGenerateRequest(BaseModel):
    """Prices come per item because they genuinely differ per variant — a 4m
    tube is not priced like a 2m one — so the client sends back the previewed
    grid with a price filled in on each row.

    Opening stock is deliberately not settable here: generating a catalogue and
    counting stock in are separate jobs, and the existing stock-adjustment and
    transfer flows already handle the second one.
    """

    category_id: UUID
    default_warehouse_id: UUID | None = None
    items: list[VariantGenerateItem] = Field(min_length=1)


class VariantGenerateResult(BaseModel):
    created_count: int
    skipped_skus: list[str]
