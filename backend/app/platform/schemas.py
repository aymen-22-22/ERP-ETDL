from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PlatformUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)
    tenant_id: UUID | None = None
    role: str | None = None


class PlatformUserRead(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformTenantRead(BaseModel):
    id: UUID
    name: str
    slug: str
    created_at: datetime

    model_config = {"from_attributes": True}
