from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
)
from app.shared.core.config import get_settings
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.rate_limit import enforce_rate_limit
from app.shared.database.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post(
    "/register",
    response_model=ResponseEnvelope[RegisterResponse],
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ResponseEnvelope[RegisterResponse]:
    result = await service.register(session, data)
    return ResponseEnvelope(data=result)


@router.post("/login", response_model=ResponseEnvelope[TokenResponse])
async def login(
    data: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ResponseEnvelope[TokenResponse]:
    await enforce_rate_limit(f"ratelimit:login:{data.email}", limit=settings.rate_limit_per_minute)
    tokens = await service.login(session, data)
    return ResponseEnvelope(data=tokens)


@router.post("/refresh", response_model=ResponseEnvelope[TokenResponse])
async def refresh(
    data: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ResponseEnvelope[TokenResponse]:
    tokens = await service.refresh(session, data.refresh_token)
    return ResponseEnvelope(data=tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: LogoutRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await service.logout(session, data.refresh_token)
