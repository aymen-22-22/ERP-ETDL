from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ---- Category ----
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    parent_id: UUID | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    parent_id: UUID | None = None
    sort_order: int | None = None


class CategoryRead(BaseModel):
    id: UUID
    tenant_id: UUID
    parent_id: UUID | None
    name: str
    description: str | None
    sort_order: int
    image_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---- Brand ----
class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)


class BrandRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---- Unit ----
class UnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    abbreviation: str = Field(min_length=1, max_length=20)


class UnitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    abbreviation: str | None = Field(default=None, min_length=1, max_length=20)


class UnitRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    abbreviation: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---- Tag ----
class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)


class TagRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
