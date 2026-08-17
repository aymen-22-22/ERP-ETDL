from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.config import get_settings
from app.shared.core.exceptions import AppError, NotFoundError
from app.shared.core.images import delete_thumbnail, write_thumbnail
from app.tenants.models import Tenant

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


async def get_tenant(session: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None or tenant.deleted_at is not None:
        raise NotFoundError("Tenant not found")
    return tenant


async def update_tenant_name(
    session: AsyncSession, tenant_id: UUID, name: str
) -> Tenant:
    tenant = await get_tenant(session, tenant_id)
    tenant.name = name
    await session.commit()
    await session.refresh(tenant)
    return tenant


async def set_tenant_logo(
    session: AsyncSession, tenant_id: UUID, file: UploadFile
) -> Tenant:
    tenant = await get_tenant(session, tenant_id)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(
            "Only JPEG, PNG, WEBP, or GIF images are allowed",
            error_code="invalid_file_type",
        )

    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise AppError("Image exceeds the 5 MB limit", error_code="file_too_large")

    settings = get_settings()
    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    filename = f"logo{extension}"
    directory = settings.media_root_path / "tenants" / str(tenant_id)
    directory.mkdir(parents=True, exist_ok=True)

    if tenant.logo_url:
        old_path = directory / tenant.logo_url.rsplit("/", 1)[-1]
        old_path.unlink(missing_ok=True)
        delete_thumbnail(old_path)

    original = directory / filename
    original.write_bytes(body)
    write_thumbnail(original)

    tenant.logo_url = (
        f"{settings.media_url_prefix}/tenants/{tenant_id}/{filename}"
    )
    await session.commit()
    await session.refresh(tenant)
    return tenant


async def delete_tenant_logo(
    session: AsyncSession, tenant_id: UUID
) -> Tenant:
    tenant = await get_tenant(session, tenant_id)
    if not tenant.logo_url:
        return tenant

    settings = get_settings()
    path = settings.media_root_path / "tenants" / str(tenant_id)
    path = path / tenant.logo_url.rsplit("/", 1)[-1]
    path.unlink(missing_ok=True)
    delete_thumbnail(path)

    tenant.logo_url = None
    await session.commit()
    await session.refresh(tenant)
    return tenant
