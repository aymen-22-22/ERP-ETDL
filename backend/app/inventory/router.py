from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.inventory import sales_service, service
from app.inventory.schemas import (
    MovementCreate,
    MovementRead,
    SaleDetail,
    SaleListItem,
    SaleRequest,
    StockSnapshotRead,
)
from app.shared.core.envelope import PaginatedEnvelope, ResponseEnvelope
from app.shared.core.pagination import PageParams
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.post(
    "/movements",
    response_model=ResponseEnvelope[MovementRead],
    status_code=status.HTTP_201_CREATED,
)
async def record_movement(
    data: MovementCreate,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:write"))],
) -> ResponseEnvelope[MovementRead]:
    movement = await service.record_movement(session, tenant_id, data)
    return ResponseEnvelope(data=MovementRead.model_validate(movement))


@router.post(
    "/sales",
    response_model=ResponseEnvelope[dict[str, object]],
    status_code=status.HTTP_201_CREATED,
)
async def record_sale(
    data: SaleRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:write"))],
) -> ResponseEnvelope[dict[str, object]]:
    """Record a whole sale in one transaction.

    Kits are expanded into their recipe here rather than at the till, so the
    components come off the shelf and the kit itself — which has no stock —
    is never touched. One request rather than one per line: the basket has to
    succeed or fail as a unit, and a browser loop could leave half a sale
    deducted.
    """
    return ResponseEnvelope(data=await sales_service.record_sale(session, tenant_id, data))


@router.get(
    "/sales",
    response_model=PaginatedEnvelope[SaleListItem],
)
async def list_sales(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    warehouse_id: UUID | None = Query(default=None),
) -> PaginatedEnvelope[SaleListItem]:
    """Completed-sales log: which products came off the shelf, grouped by sale."""
    params = PageParams(page=page, page_size=page_size)
    sales, meta = await sales_service.list_sales(session, tenant_id, params, warehouse_id)
    return PaginatedEnvelope(data=sales, meta=meta)


@router.get(
    "/sales/{reference_id}",
    response_model=ResponseEnvelope[SaleDetail],
)
async def get_sale(
    reference_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[SaleDetail]:
    sale = await sales_service.get_sale(session, tenant_id, reference_id)
    return ResponseEnvelope(data=sale)


@router.get(
    "/products/{product_id}/stock",
    response_model=ResponseEnvelope[StockSnapshotRead],
)
async def get_stock(
    product_id: UUID,
    warehouse_id: Annotated[UUID, Query()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[StockSnapshotRead]:
    snapshot = await service.get_stock_snapshot(session, tenant_id, product_id, warehouse_id)
    return ResponseEnvelope(data=StockSnapshotRead.model_validate(snapshot))


@router.get(
    "/products/{product_id}/stock/by-warehouse",
    response_model=ResponseEnvelope[list[StockSnapshotRead]],
)
async def get_stock_by_warehouse(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[list[StockSnapshotRead]]:
    snapshots = await service.list_stock_by_warehouse(session, tenant_id, product_id)
    return ResponseEnvelope(data=[StockSnapshotRead.model_validate(s) for s in snapshots])


@router.get(
    "/products/{product_id}/movements",
    response_model=PaginatedEnvelope[MovementRead],
)
async def list_movements(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    warehouse_id: UUID | None = Query(default=None),
) -> PaginatedEnvelope[MovementRead]:
    params = PageParams(page=page, page_size=page_size)
    movements, meta = await service.list_movements_for_product(
        session, tenant_id, product_id, params, warehouse_id
    )
    return PaginatedEnvelope(
        data=[MovementRead.model_validate(movement) for movement in movements], meta=meta
    )


@router.get(
    "/warehouses/summary",
    response_model=ResponseEnvelope[list[dict[str, object]]],
)
async def list_warehouse_summaries(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    summaries = await service.list_warehouse_summaries(session, tenant_id)
    return ResponseEnvelope(data=summaries)


@router.get(
    "/warehouses/{warehouse_id}/stock",
    response_model=ResponseEnvelope[list[dict[str, object]]],
)
async def list_warehouse_stock(
    warehouse_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    stock = await service.list_warehouse_stock(session, tenant_id, warehouse_id)
    return ResponseEnvelope(data=stock)


@router.get(
    "/warehouses/{warehouse_id}/summary",
    response_model=ResponseEnvelope[dict[str, int]],
)
async def get_warehouse_summary(
    warehouse_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("inventory:read"))],
) -> ResponseEnvelope[dict[str, int]]:
    summary = await service.get_warehouse_summary(session, tenant_id, warehouse_id)
    return ResponseEnvelope(data=summary)
