import re
from typing import Any
from uuid import UUID

from sqlalchemy import String, cast, func, or_, select

from app.products.catalog_service import category_ids_with_descendants
from app.products.models import Product, ProductType
from app.products.schemas import ProductCreate, ProductQuery, ProductSort, ProductUpdate
from app.shared.core.pagination import PageParams
from app.sync.repository import SyncableCRUDRepository

_SORT_COLUMNS: dict[ProductSort, Any] = {
    ProductSort.NAME: Product.name.asc(),
    ProductSort.NAME_DESC: Product.name.desc(),
    ProductSort.PRICE: Product.price.asc(),
    ProductSort.PRICE_DESC: Product.price.desc(),
    ProductSort.CREATED: Product.created_at.asc(),
    ProductSort.CREATED_DESC: Product.created_at.desc(),
}


class ProductRepository(SyncableCRUDRepository[Product, ProductCreate, ProductUpdate]):
    model_class = Product
    create_schema = ProductCreate
    update_schema = ProductUpdate

    async def list_by_tenant(
        self, tenant_id: UUID, params: PageParams, query: ProductQuery
    ) -> tuple[list[Product], int]:
        base = select(Product).where(Product.tenant_id == tenant_id, Product.deleted_at.is_(None))

        if query.search:
            # Tokenise the term so "tube 19 liss" matches "Tube 19 2m Liss":
            # a contiguous "%tube 19 liss%" needle cannot, because the "2m"
            # sits between "19" and "liss". Every token must appear somewhere
            # in the name, SKU, barcode or attribute values (colour included).
            attributes_text = cast(Product.attributes, String)
            for token in re.split(r"\s+", query.search.strip()):
                if not token:
                    continue
                term = f"%{token}%"
                base = base.where(
                    or_(
                        Product.name.ilike(term),
                        Product.sku.ilike(term),
                        Product.barcode.ilike(term),
                        attributes_text.ilike(term),
                    )
                )
        if query.category_id is not None:
            category_ids = await category_ids_with_descendants(
                self._session, tenant_id, query.category_id
            )
            base = base.where(Product.category_id.in_(category_ids))
        if query.brand_id is not None:
            base = base.where(Product.brand_id == query.brand_id)
        if query.status is not None:
            base = base.where(Product.status == query.status)
        if not query.include_variants:
            base = base.where(Product.product_type != ProductType.VARIANT)
        if not query.include_configurable:
            base = base.where(Product.product_type != ProductType.CONFIGURABLE)

        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        ordered = base.order_by(_SORT_COLUMNS[query.sort])
        result = await self._session.execute(ordered.offset(params.offset).limit(params.page_size))
        return list(result.scalars().all()), total or 0
