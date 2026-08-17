from uuid import UUID

from pydantic import BaseModel, Field


class TenantRead(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None

    model_config = {"from_attributes": True}


class TenantUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
