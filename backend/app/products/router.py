from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.products import import_service, service
from app.products.models import ProductStatus
from app.products.schemas import (
    ProductCreate,
    ProductQuery,
    ProductRead,
    ProductSort,
    ProductUpdate,
)
from app.shared.core.envelope import PaginatedEnvelope, ResponseEnvelope
from app.shared.core.pagination import PageParams
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db

router = APIRouter(prefix="/products", tags=["products"])


@router.post(
    "",
    response_model=ResponseEnvelope[ProductRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    data: ProductCreate,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=60))],
) -> ResponseEnvelope[ProductRead]:
    product = await service.create_product(session, tenant_id, data)
    return ResponseEnvelope(data=ProductRead.model_validate(product))


@router.get("", response_model=PaginatedEnvelope[ProductRead])
async def list_products(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products:list", limit=120))],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    search: str | None = Query(default=None, max_length=200),
    category_id: UUID | None = Query(default=None),
    brand_id: UUID | None = Query(default=None),
    product_status: ProductStatus | None = Query(default=None, alias="status"),
    sort: ProductSort = Query(default=ProductSort.NAME),
) -> PaginatedEnvelope[ProductRead]:
    params = PageParams(page=page, page_size=page_size)
    query = ProductQuery(
        search=search,
        category_id=category_id,
        brand_id=brand_id,
        status=product_status,
        sort=sort,
    )
    products, meta = await service.list_products(session, tenant_id, params, query)
    return PaginatedEnvelope(
        data=[ProductRead.model_validate(product) for product in products], meta=meta
    )


@router.get("/import/template")
async def download_import_template(
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> FastAPIResponse:
    content = import_service.generate_template()
    return FastAPIResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=product_import_template.xlsx"},
    )


@router.post("/import", response_model=ResponseEnvelope[list[ProductRead]])
async def import_products(
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=10))],
) -> ResponseEnvelope[list[ProductRead]]:
    file_bytes = await file.read()
    products = await import_service.import_products(session, tenant_id, file_bytes)
    return ResponseEnvelope(data=[ProductRead.model_validate(p) for p in products])


@router.get("/{product_id}", response_model=ResponseEnvelope[ProductRead])
async def get_product(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
) -> ResponseEnvelope[ProductRead]:
    product = await service.get_product(session, tenant_id, product_id)
    return ResponseEnvelope(data=ProductRead.model_validate(product))


@router.patch("/{product_id}", response_model=ResponseEnvelope[ProductRead])
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=60))],
) -> ResponseEnvelope[ProductRead]:
    product = await service.update_product(session, tenant_id, product_id, data)
    return ResponseEnvelope(data=ProductRead.model_validate(product))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> None:
    await service.delete_product(session, tenant_id, product_id)
