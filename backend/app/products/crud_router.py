from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.products import catalog_service as svc
from app.shared.core.envelope import PaginatedEnvelope, ResponseEnvelope
from app.shared.core.pagination import PageParams
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.mixins import TenantScopedAuditMixin
from app.shared.database.session import get_tenant_db


def build_crud_router[
    M: TenantScopedAuditMixin,
    CreateT: BaseModel,
    UpdateT: BaseModel,
    ReadT: BaseModel,
](
    *,
    model: type[M],
    create_schema: type[CreateT],
    update_schema: type[UpdateT],
    read_schema: type[ReadT],
    prefix: str,
    tags: list[str],
    permission_prefix: str,
) -> APIRouter:
    """Factory that generates a full CRUD router for a TenantScopedAuditMixin entity.

    Produces list, create, get, update, delete endpoints with pagination,
    rate limiting, and permission checks.
    """
    router = APIRouter(prefix=prefix, tags=tags)  # type: ignore[arg-type]

    Session = Annotated[AsyncSession, Depends(get_tenant_db)]  # noqa: N806
    TenantId = Annotated[UUID, Depends(get_current_tenant_id)]  # noqa: N806
    CanRead = Annotated[  # noqa: N806
        None, Depends(require_permission(f"{permission_prefix}:read"))
    ]
    CanWrite = Annotated[  # noqa: N806
        None, Depends(require_permission(f"{permission_prefix}:write"))
    ]
    ReadRL = Depends(rate_limit(f"catalog:{prefix}", limit=120))  # noqa: N806
    WriteRL = Depends(rate_limit(f"catalog:{prefix}", limit=60))  # noqa: N806

    @router.get("", response_model=PaginatedEnvelope[ReadT])
    async def _list(
        session: Session,
        tenant_id: TenantId,
        _: CanRead,
        __: Annotated[None, ReadRL],
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        search: str | None = Query(None, max_length=200),
    ) -> PaginatedEnvelope[ReadT]:
        items, meta = await svc.list_ref(
            session, model, tenant_id, PageParams(page=page, page_size=page_size), search
        )
        return PaginatedEnvelope(data=[read_schema.model_validate(i) for i in items], meta=meta)

    @router.post("", response_model=ResponseEnvelope[ReadT], status_code=status.HTTP_201_CREATED)
    async def _create(
        # Annotated with the concrete `create_schema` closure variable, not the
        # `CreateT` TypeVar — FastAPI's body-vs-query detection needs a real
        # BaseModel class at route-registration time, and a raw PEP 695 TypeVar
        # doesn't satisfy `issubclass(_, BaseModel)`, so it silently falls back
        # to treating `data` as a query param (422 "field required: query.data").
        data: create_schema,  # type: ignore[valid-type]
        session: Session,
        tenant_id: TenantId,
        _: CanWrite,
        __: Annotated[None, WriteRL],
    ) -> ResponseEnvelope[ReadT]:
        obj = await svc.create_ref(session, model, tenant_id, data)
        return ResponseEnvelope(data=read_schema.model_validate(obj))

    @router.get("/{ref_id}", response_model=ResponseEnvelope[ReadT])
    async def _get(
        ref_id: UUID,
        session: Session,
        tenant_id: TenantId,
        _: CanRead,
        __: Annotated[None, ReadRL],
    ) -> ResponseEnvelope[ReadT]:
        obj = await svc.get_ref(session, model, tenant_id, ref_id)
        return ResponseEnvelope(data=read_schema.model_validate(obj))

    @router.patch("/{ref_id}", response_model=ResponseEnvelope[ReadT])
    async def _update(
        ref_id: UUID,
        data: update_schema,  # type: ignore[valid-type]
        session: Session,
        tenant_id: TenantId,
        _: CanWrite,
        __: Annotated[None, WriteRL],
    ) -> ResponseEnvelope[ReadT]:
        obj = await svc.update_ref(session, model, tenant_id, ref_id, data)
        return ResponseEnvelope(data=read_schema.model_validate(obj))

    @router.delete("/{ref_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def _delete(
        ref_id: UUID,
        session: Session,
        tenant_id: TenantId,
        _: CanWrite,
        __: Annotated[None, WriteRL],
    ) -> None:
        await svc.delete_ref(session, model, tenant_id, ref_id)

    return router
