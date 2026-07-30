from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.products import catalog_service as ref_service
from app.shared.core.cache import get_tenant_cache
from app.shared.core.exceptions import AppError, NotFoundError
from app.warehouses.models import Warehouse


async def get_default(session: AsyncSession, tenant_id: UUID) -> Warehouse | None:
    result = await session.execute(
        select(Warehouse).where(
            Warehouse.tenant_id == tenant_id,
            Warehouse.is_default.is_(True),
            Warehouse.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def require_active_warehouse(
    session: AsyncSession, tenant_id: UUID, warehouse_id: UUID
) -> Warehouse:
    warehouse = await ref_service.get_ref(session, Warehouse, tenant_id, warehouse_id)
    if not warehouse.is_active:
        raise AppError("Warehouse is not active", error_code="warehouse_inactive")
    return warehouse


async def set_default_warehouse(
    session: AsyncSession, tenant_id: UUID, warehouse_id: UUID
) -> Warehouse:
    new_default = await ref_service.get_ref(session, Warehouse, tenant_id, warehouse_id)
    if not new_default.is_active:
        raise AppError(
            "Cannot set an inactive warehouse as default", error_code="warehouse_inactive"
        )

    current_default = await get_default(session, tenant_id)
    if current_default is not None and current_default.id != new_default.id:
        current_default.is_default = False
        # Flush the demotion in its own statement before promoting the new
        # default. Without this, SQLAlchemy can batch both single-column
        # UPDATEs into one executemany call and send them in an order where
        # the new row is set is_default=True *before* the old row is set
        # False -- for that instant both rows are True, tripping the
        # "one default per tenant" partial unique index even though the
        # final state (after both statements) would have been valid.
        await session.flush()
    new_default.is_default = True

    await session.commit()
    await session.refresh(new_default)
    await get_tenant_cache().invalidate_pattern(tenant_id, "warehouses")
    return new_default


async def get_warehouse_or_404(
    session: AsyncSession, tenant_id: UUID, warehouse_id: UUID
) -> Warehouse:
    warehouse = await session.get(Warehouse, warehouse_id)
    if warehouse is None or warehouse.tenant_id != tenant_id or warehouse.deleted_at is not None:
        raise NotFoundError("Warehouse not found")
    return warehouse
