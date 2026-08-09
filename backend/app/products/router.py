from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_permission
from app.products import (
    bom_service,
    configurable_service,
    image_service,
    import_service,
    service,
    variant_service,
)
from app.products.bom_schemas import BomLineRead, BomReplaceRequest
from app.products.configurable_schemas import (
    ConfigurableDefinitionInput,
    ConfigurableDefinitionRead,
    ConfigurableListItem,
    ConfigurableResolveRequest,
    ConfigurableResolveResult,
)
from app.products.models import Product, ProductBomLine, ProductStatus
from app.products.schemas import (
    BulkDeleteRequest,
    BulkDeleteResult,
    ImportSummary,
    ProductCreate,
    ProductImageRead,
    ProductQuery,
    ProductRead,
    ProductSort,
    ProductUpdate,
)
from app.products.variant_schemas import (
    VariantAddRequest,
    VariantGenerateRequest,
    VariantGenerateResult,
    VariantPreviewItem,
    VariantPreviewRequest,
    VariantSchemeRead,
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


async def _with_image(session: AsyncSession, tenant_id: UUID, product: ProductRead) -> ProductRead:
    images = await image_service.primary_image_map(session, tenant_id, [product.id])
    product.image_url = images.get(product.id)
    return product


async def _with_images(
    session: AsyncSession, tenant_id: UUID, products: list[ProductRead]
) -> list[ProductRead]:
    images = await image_service.primary_image_map(session, tenant_id, [p.id for p in products])
    for product in products:
        product.image_url = images.get(product.id)
    return products


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
    include_variants: bool = Query(default=True),
) -> PaginatedEnvelope[ProductRead]:
    params = PageParams(page=page, page_size=page_size)
    query = ProductQuery(
        search=search,
        category_id=category_id,
        brand_id=brand_id,
        status=product_status,
        sort=sort,
        include_variants=include_variants,
    )
    products, meta = await service.list_products(session, tenant_id, params, query)
    reads = await _with_images(
        session, tenant_id, [ProductRead.model_validate(product) for product in products]
    )
    return PaginatedEnvelope(data=reads, meta=meta)


@router.get("/import/template")
async def download_import_template(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> Response:
    content = await import_service.generate_template(session, tenant_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=product_import_template.xlsx"},
    )


@router.get("/export")
async def export_products(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=10))],
) -> Response:
    content = await import_service.export_products(session, tenant_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=products_export.xlsx"},
    )


@router.post("/import", response_model=ResponseEnvelope[ImportSummary])
async def import_products(
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=10))],
) -> ResponseEnvelope[ImportSummary]:
    file_bytes = await file.read()
    summary = await import_service.import_products(session, tenant_id, file_bytes)
    return ResponseEnvelope(data=summary)


@router.get("/kits/sellable", response_model=ResponseEnvelope[list[dict[str, object]]])
async def list_sellable_kits(
    warehouse_id: Annotated[UUID, Query()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    """Kits with how many the warehouse can build, for the till.

    Kits have no stock snapshot, so they are absent from a warehouse's stock
    listing and the POS cannot otherwise see them at all.
    """
    return ResponseEnvelope(
        data=await bom_service.list_sellable_kits(session, tenant_id, warehouse_id)
    )


@router.get("/configurable", response_model=ResponseEnvelope[list[ConfigurableListItem]])
async def list_configurable_products(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products:list", limit=120))],
) -> ResponseEnvelope[list[ConfigurableListItem]]:
    """Configurable products with their lowest length price, for the till and
    the admin list. Registered before "/{product_id}" so the literal path wins
    the match."""
    return ResponseEnvelope(
        data=await configurable_service.list_configurable_products(session, tenant_id)
    )


@router.get(
    "/variant-groups/{category_id}", response_model=ResponseEnvelope[list[dict[str, object]]]
)
async def list_grouped_variants(
    category_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    """One category's variants grouped by structural name, colours nested
    with their own stock — "Tube 28 Torsadi 2m" with an Argent row and a
    Dorre row underneath, not two separately-named products."""
    return ResponseEnvelope(
        data=await variant_service.list_grouped_variants(session, tenant_id, category_id)
    )


@router.get("/variant-groups", response_model=ResponseEnvelope[list[dict[str, object]]])
async def list_variant_groups(
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[dict[str, object]]]:
    """Variant families with their counts, so the product list can show one
    row per family instead of a dozen individually-tracked tubes."""
    return ResponseEnvelope(data=await service.list_variant_groups(session, tenant_id))


@router.post("/bulk-delete", response_model=ResponseEnvelope[BulkDeleteResult])
async def bulk_delete_products(
    data: BulkDeleteRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> ResponseEnvelope[BulkDeleteResult]:
    """One request for the whole selection.

    Looping DELETE from the browser would be one round trip per product —
    against a remote database that is seconds of spinner for a routine
    cleanup, with a separate way to fail at each step.
    """
    count = await service.bulk_delete_products(session, tenant_id, data.product_ids)
    return ResponseEnvelope(data=BulkDeleteResult(deleted_count=count))


# --- variant generation -----------------------------------------------------
# Registered before "/{product_id}" so the literal paths win the match.


@router.get(
    "/variants/scheme/{category_id}",
    response_model=ResponseEnvelope[VariantSchemeRead],
)
async def get_variant_scheme(
    category_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[VariantSchemeRead]:
    scheme = await variant_service.get_scheme(session, tenant_id, category_id)
    return ResponseEnvelope(data=VariantSchemeRead.model_validate(scheme))


@router.post(
    "/variants/preview",
    response_model=ResponseEnvelope[list[VariantPreviewItem]],
)
async def preview_variants(
    data: VariantPreviewRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[VariantPreviewItem]]:
    """Show exactly what would be created, before creating anything.

    Ticking two diameters and two colours is four new products; seeing the
    generated names and which ones already exist beats finding out afterwards.
    """
    scheme = await variant_service.get_scheme(session, tenant_id, data.category_id)
    combos = variant_service.expand_combinations(scheme.attribute_keys, data.selected_values)

    items = [
        (
            variant_service.build_name(
                scheme.base_name, scheme.attribute_keys, combo, scheme.color_key
            ),
            variant_service.build_sku(scheme.sku_prefix, scheme.attribute_keys, combo),
            combo,
        )
        for combo in combos
    ]
    taken = await variant_service.existing_skus(session, tenant_id, [sku for _, sku, _ in items])

    return ResponseEnvelope(
        data=[
            VariantPreviewItem(name=name, sku=sku, attributes=combo, already_exists=sku in taken)
            for name, sku, combo in items
        ]
    )


@router.post(
    "/variants/generate",
    response_model=ResponseEnvelope[VariantGenerateResult],
    status_code=status.HTTP_201_CREATED,
)
async def generate_variants(
    data: VariantGenerateRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=10))],
) -> ResponseEnvelope[VariantGenerateResult]:
    scheme = await variant_service.get_scheme(session, tenant_id, data.category_id)
    created, skipped = await variant_service.generate_variants(
        session, tenant_id, scheme, data.items, data.default_warehouse_id
    )
    return ResponseEnvelope(
        data=VariantGenerateResult(created_count=len(created), skipped_skus=skipped)
    )


@router.post(
    "/{product_id}/variants",
    response_model=ResponseEnvelope[ProductRead],
    status_code=status.HTTP_201_CREATED,
)
async def add_product_variant(
    product_id: UUID,
    data: VariantAddRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> ResponseEnvelope[ProductRead]:
    """Add one colour to an existing product, from the product detail page.

    Creates a sibling VARIANT row that shares the base's structural name and
    carries its own stock — the "add a colour" step the bulk generator can't
    do on its own.
    """
    base = await service.get_product(session, tenant_id, product_id)
    product = await variant_service.add_variant(session, tenant_id, base, data)
    return ResponseEnvelope(data=ProductRead.model_validate(product))


@router.get("/{product_id}/family", response_model=ResponseEnvelope[dict[str, object]])
async def get_product_family(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
) -> ResponseEnvelope[dict[str, object]]:
    """The product's colours with their per-warehouse stock, for the detail page.

    "Support Cristal 28/19" is several rows (one per colour); this returns the
    card view — name plus a Couleur / Dépôt / Store / Total table.
    """
    product = await service.get_product(session, tenant_id, product_id)
    return ResponseEnvelope(
        data=await variant_service.get_product_family(session, tenant_id, product)
    )


@router.post(
    "/{product_id}/duplicate",
    response_model=ResponseEnvelope[ProductRead],
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_product(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> ResponseEnvelope[ProductRead]:
    product = await service.duplicate_product(session, tenant_id, product_id)
    return ResponseEnvelope(data=ProductRead.model_validate(product))


# --- kit bill of materials --------------------------------------------------


def _bom_read(lines: list[tuple[ProductBomLine, Product]]) -> list[BomLineRead]:
    return [
        BomLineRead(
            component_product_id=product.id,
            name=product.name,
            sku=product.sku,
            quantity=line.quantity,
            unit=line.unit,
            pieces_required=line.pieces_required,
        )
        for line, product in lines
    ]


@router.get("/{product_id}/bom", response_model=ResponseEnvelope[list[BomLineRead]])
async def get_bom(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[list[BomLineRead]]:
    lines = await bom_service.list_bom_lines(session, tenant_id, product_id)
    return ResponseEnvelope(data=_bom_read(lines))


@router.put("/{product_id}/bom", response_model=ResponseEnvelope[list[BomLineRead]])
async def replace_bom(
    product_id: UUID,
    data: BomReplaceRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
) -> ResponseEnvelope[list[BomLineRead]]:
    lines = await bom_service.replace_bom(
        session,
        tenant_id,
        product_id,
        [(line.component_product_id, line.quantity, line.unit) for line in data.lines],
    )
    return ResponseEnvelope(data=_bom_read(lines))


@router.get("/{product_id}/bom/cost", response_model=ResponseEnvelope[dict[str, object]])
async def get_bom_cost(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[dict[str, object]]:
    return ResponseEnvelope(data=await bom_service.cost_breakdown(session, tenant_id, product_id))


@router.get("/{product_id}/bom/buildable", response_model=ResponseEnvelope[dict[str, object]])
async def get_bom_buildable(
    product_id: UUID,
    warehouse_id: Annotated[UUID, Query()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
) -> ResponseEnvelope[dict[str, object]]:
    return ResponseEnvelope(
        data=await bom_service.buildable_quantity(session, tenant_id, product_id, warehouse_id)
    )


# --- configurable products --------------------------------------------------


@router.get(
    "/{product_id}/configurable", response_model=ResponseEnvelope[ConfigurableDefinitionRead]
)
async def get_configurable_definition(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
) -> ResponseEnvelope[ConfigurableDefinitionRead]:
    return ResponseEnvelope(
        data=await configurable_service.get_definition(session, tenant_id, product_id)
    )


@router.put(
    "/{product_id}/configurable", response_model=ResponseEnvelope[ConfigurableDefinitionRead]
)
async def save_configurable_definition(
    product_id: UUID,
    data: ConfigurableDefinitionInput,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=60))],
) -> ResponseEnvelope[ConfigurableDefinitionRead]:
    return ResponseEnvelope(
        data=await configurable_service.save_definition(session, tenant_id, product_id, data)
    )


@router.delete("/{product_id}/configurable", status_code=status.HTTP_204_NO_CONTENT)
async def delete_configurable_definition(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=60))],
) -> None:
    await configurable_service.delete_definition(session, tenant_id, product_id)


@router.post(
    "/{product_id}/configurable/resolve",
    response_model=ResponseEnvelope[ConfigurableResolveResult],
)
async def resolve_configurable(
    product_id: UUID,
    data: ConfigurableResolveRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
    warehouse_id: UUID | None = Query(default=None),
) -> ResponseEnvelope[ConfigurableResolveResult]:
    """Price and resolved components for one configuration, for the till's
    wizard. Passing `warehouse_id` also reports per-component stock so the
    cashier can see how many of this configuration are buildable right now."""
    return ResponseEnvelope(
        data=await configurable_service.resolve_configuration(
            session, tenant_id, product_id, data, warehouse_id
        )
    )


@router.get("/{product_id}", response_model=ResponseEnvelope[ProductRead])
async def get_product(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
) -> ResponseEnvelope[ProductRead]:
    product = await service.get_product(session, tenant_id, product_id)
    read = await _with_image(session, tenant_id, ProductRead.model_validate(product))
    return ResponseEnvelope(data=read)


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


@router.get("/{product_id}/images", response_model=ResponseEnvelope[list[ProductImageRead]])
async def list_product_images(
    product_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:read"))],
    __: Annotated[None, Depends(rate_limit("products", limit=120))],
) -> ResponseEnvelope[list[ProductImageRead]]:
    images = await image_service.list_images(session, tenant_id, product_id)
    return ResponseEnvelope(data=[ProductImageRead.model_validate(img) for img in images])


@router.post(
    "/{product_id}/images",
    response_model=ResponseEnvelope[ProductImageRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    product_id: UUID,
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> ResponseEnvelope[ProductImageRead]:
    image = await image_service.add_image(session, tenant_id, product_id, file)
    return ResponseEnvelope(data=ProductImageRead.model_validate(image))


@router.post(
    "/{product_id}/images/{image_id}/primary",
    response_model=ResponseEnvelope[ProductImageRead],
)
async def set_primary_product_image(
    product_id: UUID,
    image_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> ResponseEnvelope[ProductImageRead]:
    image = await image_service.set_primary_image(session, tenant_id, product_id, image_id)
    return ResponseEnvelope(data=ProductImageRead.model_validate(image))


@router.delete("/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_image(
    product_id: UUID,
    image_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_db)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    _: Annotated[None, Depends(require_permission("products:write"))],
    __: Annotated[None, Depends(rate_limit("products", limit=30))],
) -> None:
    await image_service.delete_image(session, tenant_id, product_id, image_id)
