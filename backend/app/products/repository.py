from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select

from app.products.models import Product
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
            term = f"%{query.search.strip()}%"
            base = base.where(
                or_(
                    Product.name.ilike(term),
                    Product.sku.ilike(term),
                    Product.barcode.ilike(term),
                )
            )
        if query.category_id is not None:
            base = base.where(Product.category_id == query.category_id)
        if query.brand_id is not None:
            base = base.where(Product.brand_id == query.brand_id)
        if query.status is not None:
            base = base.where(Product.status == query.status)

        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        ordered = base.order_by(_SORT_COLUMNS[query.sort])
        result = await self._session.execute(ordered.offset(params.offset).limit(params.page_size))
        return list(result.scalars().all()), total or 0
