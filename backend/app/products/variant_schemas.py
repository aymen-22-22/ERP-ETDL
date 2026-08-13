from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.products.schemas import OpeningStock


class VariantSchemeUpsert(BaseModel):
    """Create or update a category's variant generation formula."""

    base_name: str = Field(min_length=1, max_length=150)
    sku_prefix: str = Field(min_length=1, max_length=20)
    attribute_keys: list[str] = Field(min_length=1)
    allowed_values: dict[str, list[str]] = Field(default_factory=dict)
    color_key: str | None = Field(default=None, max_length=50)

    @field_validator("attribute_keys", mode="before")
    @classmethod
    def _strip_keys(cls, v: list[str]) -> list[str]:
        return [k.strip() for k in v if k.strip()]

    @field_validator("attribute_keys")
    @classmethod
    def _unique_keys(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("attribute_keys must be unique")
        return v

    @field_validator("color_key")
    @classmethod
    def _color_key_in_keys(cls, v: str | None, info: ValidationInfo) -> str | None:
        if v is None:
            return None
        keys = info.data.get("attribute_keys")
        if keys is not None and v not in keys:
            raise ValueError("color_key must be one of attribute_keys")
        return v


class VariantSchemeRead(BaseModel):
    """The naming rule for one category, and the values to offer as pickers."""

    category_id: UUID
    base_name: str
    sku_prefix: str
    attribute_keys: list[str]
    allowed_values: dict[str, list[str]]
    # The axis excluded from the name and grouped as a sub-row in the UI
    # ("Tube 28 Torsadi 2m" with an Argent line and a Dorre line under it).
    # None means every axis is structural and each combination is its own row.
    color_key: str | None = None

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
    # Server-side overrides used when adding one colour to an existing product
    # (see variant_service.add_variant). Ignored by the bulk generator, which
    # always derives both from the scheme.
    name: str | None = None
    sku: str | None = None


class VariantAddRequest(BaseModel):
    """The axis values (usually just the colour) for one sibling variant.

    Merged over the base product's existing attributes, so "Tube 28 Torsadi
    2m" + {"color": "Dorre"} becomes the Dorre row of the same family.
    """

    attributes: dict[str, str]
    price: Decimal = Field(gt=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    default_warehouse_id: UUID | None = None
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
