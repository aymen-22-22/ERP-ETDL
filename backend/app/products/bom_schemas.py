from uuid import UUID

from pydantic import BaseModel, Field

from app.products.models import BomUnit


class BomLineInput(BaseModel):
    component_product_id: UUID
    quantity: int = Field(gt=0)
    # "1 paire support 19/19" -> quantity=1, unit=pair -> 2 pieces deducted.
    unit: BomUnit = BomUnit.PIECE


class BomReplaceRequest(BaseModel):
    """The recipe in full. Sending an empty list clears it."""

    lines: list[BomLineInput]


class BomLineRead(BaseModel):
    component_product_id: UUID
    name: str
    sku: str
    quantity: int
    unit: BomUnit
    pieces_required: int
