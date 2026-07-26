from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RoleRead(BaseModel):
    id: UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


class TenantMemberRead(BaseModel):
    """A user's membership of the current tenant."""

    user_id: UUID
    email: str
    full_name: str
    role: str
    joined_at: datetime


class MemberCreate(BaseModel):
    """Adds someone to the current tenant.

    If the email already belongs to a user, that account is attached to this
    tenant and `password` is ignored — a tenant owner must never be able to
    set the credentials of an account they don't own.
    """

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)
    role: str = Field(min_length=1, max_length=50)


class MemberUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=50)
