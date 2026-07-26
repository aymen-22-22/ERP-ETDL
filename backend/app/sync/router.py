from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db
from app.sync import service
from app.sync.schemas import SyncPullResponse, SyncPushRequest, SyncPushResponse
from app.users.models import User

# get_tenant_db (not get_db) so app.tenant_id is set for the transaction —
# without it, RLS on products/inventory hides every row and conflict detection
# would always mis-report NotFound.
router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/push", response_model=ResponseEnvelope[SyncPushResponse])
async def push(
    request: SyncPushRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _user: Annotated[User, Depends(get_current_user)],
    _: Annotated[None, Depends(rate_limit("sync:push", limit=30))],
) -> ResponseEnvelope[SyncPushResponse]:
    result = await service.apply_mutations(session, tenant_id, request)
    return ResponseEnvelope(data=result)


@router.get("/pull", response_model=ResponseEnvelope[SyncPullResponse])
async def pull(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _user: Annotated[User, Depends(get_current_user)],
    _: Annotated[None, Depends(rate_limit("sync:pull", limit=120))],
    since: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
) -> ResponseEnvelope[SyncPullResponse]:
    result = await service.build_pull_page(session, tenant_id, since, limit)
    return ResponseEnvelope(data=result)
