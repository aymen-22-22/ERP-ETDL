from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db
from app.tenants import service as svc
from app.tenants.schemas import TenantRead, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/me", response_model=ResponseEnvelope[TenantRead])
async def get_current_tenant(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
) -> ResponseEnvelope[TenantRead]:
    tenant = await svc.get_tenant(session, tenant_id)
    return ResponseEnvelope(data=TenantRead.model_validate(tenant))


@router.patch("/me", response_model=ResponseEnvelope[TenantRead])
async def update_current_tenant(
    data: TenantUpdate,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("settings:write"))],
) -> ResponseEnvelope[TenantRead]:
    tenant = await svc.update_tenant_name(session, tenant_id, data.name)
    return ResponseEnvelope(data=TenantRead.model_validate(tenant))


@router.post(
    "/me/logo",
    response_model=ResponseEnvelope[TenantRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_tenant_logo(
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("settings:write"))],
    __: Annotated[None, Depends(rate_limit("tenants", limit=30))],
) -> ResponseEnvelope[TenantRead]:
    tenant = await svc.set_tenant_logo(session, tenant_id, file)
    return ResponseEnvelope(data=TenantRead.model_validate(tenant))


@router.delete(
    "/me/logo",
    response_model=ResponseEnvelope[TenantRead],
)
async def delete_tenant_logo(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("settings:write"))],
) -> ResponseEnvelope[TenantRead]:
    tenant = await svc.delete_tenant_logo(session, tenant_id)
    return ResponseEnvelope(data=TenantRead.model_validate(tenant))
