from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.products import catalog_service
from app.products.catalog_schemas import (
    BrandCreate,
    BrandRead,
    BrandUpdate,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    TagCreate,
    TagRead,
    TagUpdate,
    UnitCreate,
    UnitRead,
    UnitUpdate,
)
from app.products.crud_router import build_crud_router
from app.products.models import Brand, Category, Tag, Unit
from app.shared.core.envelope import ResponseEnvelope
from app.shared.core.rate_limit import rate_limit
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_tenant_db

catalog_router = APIRouter()


@catalog_router.get(
    "/categories/tree",
    response_model=ResponseEnvelope[list[dict[str, object]]],
)
async def get_category_tree(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    tree = await catalog_service.list_category_tree(session, tenant_id)
    return ResponseEnvelope(data=tree)


for _router in [
    build_crud_router(
        model=Category,
        create_schema=CategoryCreate,
        update_schema=CategoryUpdate,
        read_schema=CategoryRead,
        prefix="/categories",
        tags=["categories"],
        permission_prefix="products",
    ),
    build_crud_router(
        model=Brand,
        create_schema=BrandCreate,
        update_schema=BrandUpdate,
        read_schema=BrandRead,
        prefix="/brands",
        tags=["brands"],
        permission_prefix="products",
    ),
    build_crud_router(
        model=Unit,
        create_schema=UnitCreate,
        update_schema=UnitUpdate,
        read_schema=UnitRead,
        prefix="/units",
        tags=["units"],
        permission_prefix="products",
    ),
    build_crud_router(
        model=Tag,
        create_schema=TagCreate,
        update_schema=TagUpdate,
        read_schema=TagRead,
        prefix="/tags",
        tags=["tags"],
        permission_prefix="products",
    ),
]:
    catalog_router.include_router(_router)


@catalog_router.post(
    "/categories/{category_id}/image",
    response_model=ResponseEnvelope[CategoryRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_category_image(
    category_id: UUID,
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("categories", limit=30))],
) -> ResponseEnvelope[CategoryRead]:
    """Set (or replace) the category's photo. The new file replaces whatever
    image was stored before, so a category always shows one picture."""
    category = await catalog_service.set_category_image(session, tenant_id, category_id, file)
    return ResponseEnvelope(data=CategoryRead.model_validate(category))


@catalog_router.delete(
    "/categories/{category_id}/image",
    response_model=ResponseEnvelope[CategoryRead],
)
async def delete_category_image(
    category_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("categories", limit=30))],
) -> ResponseEnvelope[CategoryRead]:
    category = await catalog_service.delete_category_image(session, tenant_id, category_id)
    return ResponseEnvelope(data=CategoryRead.model_validate(category))
