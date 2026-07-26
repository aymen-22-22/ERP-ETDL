from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db
from app.users import service
from app.users.schemas import MemberCreate, MemberUpdate, RoleRead, TenantMemberRead

router = APIRouter(prefix="/users", tags=["users"])

Session = Annotated[AsyncSession, Depends(get_tenant_db)]  # noqa: N806
TenantId = Annotated[UUID, Depends(get_current_tenant_id)]  # noqa: N806
CanRead = Annotated[None, Depends(require_permission("users:read"))]  # noqa: N806
CanWrite = Annotated[None, Depends(require_permission("users:write"))]  # noqa: N806


@router.get("", response_model=ResponseEnvelope[list[TenantMemberRead]])
async def list_members(
    session: Session, tenant_id: TenantId, _: CanRead
) -> ResponseEnvelope[list[TenantMemberRead]]:
    return ResponseEnvelope(data=await service.list_members(session, tenant_id))


@router.get("/roles", response_model=ResponseEnvelope[list[RoleRead]])
async def list_roles(session: Session, _: CanRead) -> ResponseEnvelope[list[RoleRead]]:
    roles = await service.list_roles(session)
    return ResponseEnvelope(data=[RoleRead.model_validate(r) for r in roles])


@router.post(
    "", response_model=ResponseEnvelope[TenantMemberRead], status_code=status.HTTP_201_CREATED
)
async def add_member(
    data: MemberCreate, session: Session, tenant_id: TenantId, _: CanWrite
) -> ResponseEnvelope[TenantMemberRead]:
    return ResponseEnvelope(data=await service.add_member(session, tenant_id, data))


@router.patch("/{user_id}", response_model=ResponseEnvelope[TenantMemberRead])
async def update_member(
    user_id: UUID, data: MemberUpdate, session: Session, tenant_id: TenantId, _: CanWrite
) -> ResponseEnvelope[TenantMemberRead]:
    member = await service.update_member_role(session, tenant_id, user_id, data)
    return ResponseEnvelope(data=member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: UUID, session: Session, tenant_id: TenantId, _: CanWrite
) -> None:
    await service.remove_member(session, tenant_id, user_id)
