from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_permission
from app.shared.core.envelope import PaginatedEnvelope, ResponseEnvelope
from app.shared.core.pagination import PageParams
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db
from app.transfers import service as svc
from app.transfers.models import TransferStatus
from app.transfers.schemas import TransferCreate, TransferLinesUpdate, TransferRead
from app.users.models import User

router = APIRouter(prefix="/transfers", tags=["transfers"])

Session = Annotated[AsyncSession, Depends(get_tenant_db)]  # noqa: N806
TenantId = Annotated[UUID, Depends(get_current_tenant_id)]  # noqa: N806
CurrentUser = Annotated[User, Depends(get_current_user)]  # noqa: N806
CanRead = Annotated[None, Depends(require_permission("transfers:read"))]  # noqa: N806
CanWrite = Annotated[None, Depends(require_permission("transfers:write"))]  # noqa: N806
CanApprove = Annotated[None, Depends(require_permission("transfers:approve"))]  # noqa: N806


@router.post("", response_model=ResponseEnvelope[TransferRead], status_code=status.HTTP_201_CREATED)
async def create_transfer(
    data: TransferCreate, session: Session, tenant_id: TenantId, user: CurrentUser, _: CanWrite
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.create_transfer(session, tenant_id, data, user.id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.get("", response_model=PaginatedEnvelope[TransferRead])
async def list_transfers(
    session: Session,
    tenant_id: TenantId,
    _: CanRead,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    status_filter: TransferStatus | None = Query(default=None, alias="status"),
) -> PaginatedEnvelope[TransferRead]:
    params = PageParams(page=page, page_size=page_size)
    transfers, meta = await svc.list_transfers(session, tenant_id, params, status_filter)
    return PaginatedEnvelope(data=await svc.to_read_list(session, tenant_id, transfers), meta=meta)


@router.get("/{transfer_id}", response_model=ResponseEnvelope[TransferRead])
async def get_transfer(
    transfer_id: UUID, session: Session, tenant_id: TenantId, _: CanRead
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.get_transfer(session, tenant_id, transfer_id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.patch("/{transfer_id}/lines", response_model=ResponseEnvelope[TransferRead])
async def update_lines(
    transfer_id: UUID,
    data: TransferLinesUpdate,
    session: Session,
    tenant_id: TenantId,
    _: CanWrite,
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.update_transfer_lines(session, tenant_id, transfer_id, data)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.post("/{transfer_id}/submit", response_model=ResponseEnvelope[TransferRead])
async def submit_transfer(
    transfer_id: UUID, session: Session, tenant_id: TenantId, _: CanWrite
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.submit_transfer(session, tenant_id, transfer_id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.post("/{transfer_id}/approve", response_model=ResponseEnvelope[TransferRead])
async def approve_transfer(
    transfer_id: UUID, session: Session, tenant_id: TenantId, user: CurrentUser, _: CanApprove
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.approve_transfer(session, tenant_id, transfer_id, user.id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.post("/{transfer_id}/complete", response_model=ResponseEnvelope[TransferRead])
async def complete_transfer(
    transfer_id: UUID, session: Session, tenant_id: TenantId, _: CanApprove
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.complete_transfer(session, tenant_id, transfer_id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))


@router.post("/{transfer_id}/cancel", response_model=ResponseEnvelope[TransferRead])
async def cancel_transfer(
    transfer_id: UUID, session: Session, tenant_id: TenantId, _: CanWrite
) -> ResponseEnvelope[TransferRead]:
    transfer = await svc.cancel_transfer(session, tenant_id, transfer_id)
    return ResponseEnvelope(data=await svc.to_read(session, tenant_id, transfer))
