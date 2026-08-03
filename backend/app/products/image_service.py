from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import ProductImage
from app.products.service import get_product
from app.shared.core.config import get_settings
from app.shared.core.exceptions import AppError, NotFoundError
from app.shared.core.ids import generate_uuid7

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _image_url(tenant_id: UUID, product_id: UUID, filename: str) -> str:
    settings = get_settings()
    return f"{settings.media_url_prefix}/products/{tenant_id}/{product_id}/{filename}"


async def list_images(
    session: AsyncSession, tenant_id: UUID, product_id: UUID
) -> list[ProductImage]:
    await get_product(session, tenant_id, product_id)
    result = await session.execute(
        select(ProductImage)
        .where(
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id == product_id,
            ProductImage.deleted_at.is_(None),
        )
        .order_by(ProductImage.sort_order, ProductImage.created_at)
    )
    return list(result.scalars().all())


async def add_image(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, file: UploadFile
) -> ProductImage:
    # Also confirms the product belongs to this tenant before anything is
    # written to disk.
    await get_product(session, tenant_id, product_id)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(
            "Only JPEG, PNG, WEBP, or GIF images are allowed", error_code="invalid_file_type"
        )

    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise AppError("Image exceeds the 5 MB limit", error_code="file_too_large")

    settings = get_settings()
    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    filename = f"{generate_uuid7()}{extension}"
    directory = settings.media_root_path / "products" / str(tenant_id) / str(product_id)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / filename).write_bytes(body)

    existing = await session.scalar(
        select(ProductImage).where(
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id == product_id,
            ProductImage.deleted_at.is_(None),
        )
    )
    image = ProductImage(
        id=generate_uuid7(),
        tenant_id=tenant_id,
        product_id=product_id,
        url=_image_url(tenant_id, product_id, filename),
        sort_order=0,
        is_primary=existing is None,
    )
    session.add(image)
    await session.commit()
    await session.refresh(image)
    return image


async def set_primary_image(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, image_id: UUID
) -> ProductImage:
    await get_product(session, tenant_id, product_id)
    image = await session.scalar(
        select(ProductImage).where(
            ProductImage.id == image_id,
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id == product_id,
            ProductImage.deleted_at.is_(None),
        )
    )
    if image is None:
        raise NotFoundError("Image not found")

    await session.execute(
        update(ProductImage)
        .where(ProductImage.tenant_id == tenant_id, ProductImage.product_id == product_id)
        .values(is_primary=False)
    )
    image.is_primary = True
    await session.commit()
    await session.refresh(image)
    return image


async def delete_image(
    session: AsyncSession, tenant_id: UUID, product_id: UUID, image_id: UUID
) -> None:
    await get_product(session, tenant_id, product_id)
    image = await session.scalar(
        select(ProductImage).where(
            ProductImage.id == image_id,
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id == product_id,
            ProductImage.deleted_at.is_(None),
        )
    )
    if image is None:
        raise NotFoundError("Image not found")

    was_primary = image.is_primary
    settings = get_settings()
    file_path = settings.media_root_path / "products" / str(tenant_id) / str(product_id)
    file_path = file_path / image.url.rsplit("/", 1)[-1]
    file_path.unlink(missing_ok=True)

    await session.delete(image)
    await session.flush()

    if was_primary:
        next_image = await session.scalar(
            select(ProductImage)
            .where(
                ProductImage.tenant_id == tenant_id,
                ProductImage.product_id == product_id,
                ProductImage.deleted_at.is_(None),
            )
            .order_by(ProductImage.sort_order, ProductImage.created_at)
        )
        if next_image is not None:
            next_image.is_primary = True

    await session.commit()


async def primary_image_map(
    session: AsyncSession, tenant_id: UUID, product_ids: list[UUID]
) -> dict[UUID, str]:
    """Bulk-fetch each product's primary image URL, keyed by product id.

    Used to enrich `ProductRead.image_url` for list/detail responses without
    pulling images into the product cache/sync machinery.
    """
    if not product_ids:
        return {}
    result = await session.execute(
        select(ProductImage.product_id, ProductImage.url).where(
            ProductImage.tenant_id == tenant_id,
            ProductImage.product_id.in_(product_ids),
            ProductImage.is_primary.is_(True),
            ProductImage.deleted_at.is_(None),
        )
    )
    return {row.product_id: row.url for row in result.all()}
