from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.products.models import BomUnit


class ConfigurablePriceInput(BaseModel):
    """One length option and its selling price."""

    length: str = Field(min_length=1, max_length=50)
    price: Decimal = Field(gt=0)


class ConfigurableRecipeLineInput(BaseModel):
    """One component pattern of a configurable product's recipe.

    A pattern rather than a concrete product: `category_id` plus `attributes`
    identify the part ("Support Cristal" with size=28/19 and model=F3). A
    value written "@axis" is filled from the till's configuration at resolve
    time ({"model": "@support"}, {"length": "@length"}, {"color": "@color"}).
    """

    label: str = Field(min_length=1, max_length=100)
    category_id: UUID | None = None
    attributes: dict[str, str] = Field(default_factory=dict)
    quantity: int = Field(gt=0)
    # Length-specific quantities, e.g. {"4m": 3} — a triangle at 4m takes a
    # third support piece. Keyed by priced length value; keys must be one of
    # the definition's lengths and values greater than zero.
    quantity_by_length: dict[str, int] = Field(default_factory=dict)
    unit: BomUnit = BomUnit.PIECE


class ConfigurableDefinitionInput(BaseModel):
    """The whole definition in one request.

    Prices and recipe are replaced as a unit, mirroring `BomReplaceRequest`:
    an editor works on the whole definition on one screen, and diffing it
    client-side would be a way to get it wrong.
    """

    color_key: str = Field(default="color", min_length=1, max_length=50)
    length_key: str = Field(default="length", min_length=1, max_length=50)
    # Axis -> allowed values, in the order the till should offer them
    # ({"support": ["F2", "F3", "F4"], "motif": ["K19"], "color": ["GD", "CH"]}).
    options: dict[str, list[str]] = Field(default_factory=dict)
    prices: list[ConfigurablePriceInput] = Field(min_length=1)
    recipe: list[ConfigurableRecipeLineInput] = Field(min_length=1)


class ConfigurablePriceRead(BaseModel):
    length: str
    price: str


class ConfigurableRecipeLineRead(BaseModel):
    label: str
    category_id: UUID | None
    category_name: str | None
    attributes: dict[str, str]
    quantity: int
    quantity_by_length: dict[str, int]
    unit: BomUnit
    pieces_required: int


class ConfigurableDefinitionRead(BaseModel):
    product_id: UUID
    name: str
    sku: str
    color_key: str
    length_key: str
    options: dict[str, list[str]]
    prices: list[ConfigurablePriceRead]
    recipe: list[ConfigurableRecipeLineRead]


class ConfigurableListItem(BaseModel):
    """A configurable product as the till and admin list need to see it.

    There is no single price — it depends on the length chosen — so the list
    carries the lowest one ("from 4600") for the tile, and whether a
    definition actually exists yet (an unconfigured CONFIGURABLE product is
    not sellable, like a kit with no recipe).
    """

    product_id: UUID
    name: str
    sku: str
    category_id: UUID | None
    price_from: str | None
    has_definition: bool
    # Primary photo of the product, if one was uploaded — shown on the till tile.
    image_url: str | None = None


class ConfigurableResolveRequest(BaseModel):
    """The configuration as picked at the till.

    Generic dict because the option axes are data, not schema — length is the
    only key every configuration must have (it drives price and the tube's
    resolved length).
    """

    configuration: dict[str, str] = Field(min_length=1)


class ConfigurableResolvedLine(BaseModel):
    label: str
    component_product_id: UUID
    name: str
    sku: str
    quantity: int
    unit: BomUnit
    pieces_required: int
    # Stock in the selling warehouse, so the till can show how many of this
    # configuration can currently be built (the limiting component).
    available: int
    builds: int


class ConfigurableResolveResult(BaseModel):
    product_id: UUID
    name: str
    # The sale-line description, e.g. "Triangle Double 28/19 F3 GD 4m".
    display_name: str
    price: str
    configuration: dict[str, str]
    lines: list[ConfigurableResolvedLine]
    # How many of *this* configuration the warehouse can build right now.
    buildable: int
