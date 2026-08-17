from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    tenant_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    tenant_id: UUID
    tenant_name: str = ""
    tenant_logo_url: str | None = None
    token_type: str = "bearer"
    is_superuser: bool = False


class UserPublic(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_superuser: bool = False

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserPublic
    tenant_id: UUID
    tenant_slug: str
