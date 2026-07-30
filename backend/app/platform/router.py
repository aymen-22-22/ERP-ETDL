from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_superuser
from app.platform.schemas import PlatformUserCreate, PlatformUserRead, PlatformTenantRead
from app.platform import service
from app.shared.core.envelope import ResponseEnvelope
from app.shared.database.session import get_db
from app.users.models import User

router = APIRouter(prefix="/platform", tags=["platform"])

Session = Annotated[AsyncSession, Depends(get_db)]
SuperUser = Annotated[None, Depends(require_superuser)]


@router.post("/users", response_model=ResponseEnvelope[PlatformUserRead], status_code=status.HTTP_201_CREATED)
async def create_user(
    data: PlatformUserCreate, session: Session, _: SuperUser
) -> ResponseEnvelope[PlatformUserRead]:
    user = await service.create_user(session, data)
    return ResponseEnvelope(data=user)


@router.get("/users", response_model=ResponseEnvelope[list[PlatformUserRead]])
async def list_users(
    session: Session, _: SuperUser
) -> ResponseEnvelope[list[PlatformUserRead]]:
    users = await service.list_users(session)
    return ResponseEnvelope(data=users)


@router.get("/tenants", response_model=ResponseEnvelope[list[PlatformTenantRead]])
async def list_tenants(
    session: Session, _: SuperUser
) -> ResponseEnvelope[list[PlatformTenantRead]]:
    tenants = await service.list_tenants(session)
    return ResponseEnvelope(data=tenants)
