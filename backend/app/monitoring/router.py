from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.monitoring import service
from app.monitoring.schemas import (
    ActivityLogRead,
    ErrorLogRead,
    NotificationRead,
    UnreadCount,
)
from app.shared.core.envelope import PaginatedEnvelope, ResponseEnvelope
from app.shared.core.pagination import PageParams
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db

logs_router = APIRouter(prefix="/logs", tags=["logs"])
notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


@logs_router.get("/activity", response_model=PaginatedEnvelope[ActivityLogRead])
async def list_activity(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("logs:read"))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    entity_type: str | None = Query(default=None),
) -> PaginatedEnvelope[ActivityLogRead]:
    """Everything that happened in the app, newest first, in plain language."""
    params = PageParams(page=page, page_size=page_size)
    items, meta = await service.list_activity(session, tenant_id, params, entity_type)
    return PaginatedEnvelope(data=items, meta=meta)


@logs_router.get("/errors", response_model=PaginatedEnvelope[ErrorLogRead])
async def list_errors(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("logs:read"))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    level: str | None = Query(default=None),
) -> PaginatedEnvelope[ErrorLogRead]:
    """Errors the app hit, with the technical details behind each one."""
    params = PageParams(page=page, page_size=page_size)
    items, meta = await service.list_errors(session, tenant_id, params, level)
    return PaginatedEnvelope(data=items, meta=meta)


@notifications_router.get("", response_model=PaginatedEnvelope[NotificationRead])
async def list_notifications(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("notifications:read"))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    unread_only: bool = Query(default=False),
) -> PaginatedEnvelope[NotificationRead]:
    params = PageParams(page=page, page_size=page_size)
    items, meta = await service.list_notifications(session, tenant_id, params, unread_only)
    return PaginatedEnvelope(data=items, meta=meta)


@notifications_router.get("/unread-count", response_model=ResponseEnvelope[UnreadCount])
async def unread_count(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("notifications:read"))],
) -> ResponseEnvelope[UnreadCount]:
    count = await service.count_unread_notifications(session, tenant_id)
    return ResponseEnvelope(data=UnreadCount(count=count))


@notifications_router.post(
    "/{notification_id}/read", response_model=ResponseEnvelope[NotificationRead]
)
async def mark_read(
    notification_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("notifications:read"))],
) -> ResponseEnvelope[NotificationRead]:
    notification = await service.mark_notification_read(session, tenant_id, notification_id)
    return ResponseEnvelope(data=NotificationRead.model_validate(notification))


@notifications_router.post("/read-all", response_model=ResponseEnvelope[UnreadCount])
async def mark_all_read(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("notifications:read"))],
) -> ResponseEnvelope[UnreadCount]:
    count = await service.mark_all_notifications_read(session, tenant_id)
    return ResponseEnvelope(data=UnreadCount(count=count))
