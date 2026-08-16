from typing import Annotated
from uuid import UUID

from fastapi import Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.products.crud_router import build_crud_router
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db
from app.warehouses import service as svc
from app.warehouses.models import Warehouse
from app.warehouses.schemas import WarehouseCreate, WarehouseRead, WarehouseUpdate

router = build_crud_router(
    model=Warehouse,
    create_schema=WarehouseCreate,
    update_schema=WarehouseUpdate,
    read_schema=WarehouseRead,
    prefix="/warehouses",
    tags=["warehouses"],
    permission_prefix="warehouses",
)


@router.post("/{warehouse_id}/set-default", response_model=ResponseEnvelope[WarehouseRead])
async def set_default(
    warehouse_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("warehouses:write"))],
) -> ResponseEnvelope[WarehouseRead]:
    warehouse = await svc.set_default_warehouse(session, tenant_id, warehouse_id)
    return ResponseEnvelope(data=WarehouseRead.model_validate(warehouse))


@router.post(
    "/{warehouse_id}/image",
    response_model=ResponseEnvelope[WarehouseRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_warehouse_image(
    warehouse_id: UUID,
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("warehouses:write"))],
    __: Annotated[None, Depends(rate_limit("warehouses", limit=30))],
) -> ResponseEnvelope[WarehouseRead]:
    """Set (or replace) the warehouse's photo. The new file replaces whatever
    image was stored before, so the warehouse always shows one picture."""
    warehouse = await svc.set_warehouse_image(session, tenant_id, warehouse_id, file)
    return ResponseEnvelope(data=WarehouseRead.model_validate(warehouse))


@router.delete(
    "/{warehouse_id}/image",
    response_model=ResponseEnvelope[WarehouseRead],
)
async def delete_warehouse_image(
    warehouse_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("warehouses:write"))],
    __: Annotated[None, Depends(rate_limit("warehouses", limit=30))],
) -> ResponseEnvelope[WarehouseRead]:
    warehouse = await svc.delete_warehouse_image(session, tenant_id, warehouse_id)
    return ResponseEnvelope(data=WarehouseRead.model_validate(warehouse))
