from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import MovementType
from app.inventory.repository import InventoryRepository
from app.inventory.schemas import MovementCreate
from app.products.image_service import primary_image_map
from app.products.models import Product
from app.shared.core.exceptions import AppError, ConflictError, NotFoundError
from app.shared.core.ids import generate_uuid7
from app.shared.core.pagination import PageParams, PaginationMeta
from app.sync.models import ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.transfers.models import StockTransfer, TransferStatus
from app.transfers.repository import TransferRepository
from app.transfers.schemas import (
    TransferCreate,
    TransferLineCreate,
    TransferLineRead,
    TransferLinesUpdate,
    TransferRead,
)
from app.warehouses.service import require_active_warehouse


async def _require_transfer(
    repo: TransferRepository, tenant_id: UUID, transfer_id: UUID
) -> StockTransfer:
    transfer = await repo.get(tenant_id, transfer_id)
    if transfer is None:
        raise NotFoundError("Transfer not found")
    return transfer


def _require_status(transfer: StockTransfer, *expected: TransferStatus) -> None:
    if transfer.status not in expected:
        raise ConflictError(
            f"Transfer is {transfer.status}, expected one of {[s.value for s in expected]}",
            error_code="invalid_transfer_status",
        )


async def _validate_products(
    session: AsyncSession, tenant_id: UUID, lines: list[TransferLineCreate]
) -> None:
    product_ids = {line.product_id for line in lines}
    result = await session.execute(
        select(Product.id).where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
    )
    found = set(result.scalars().all())
    missing = product_ids - found
    if missing:
        raise AppError(f"Unknown product(s): {missing}", error_code="invalid_reference")


async def create_transfer(
    session: AsyncSession, tenant_id: UUID, data: TransferCreate, requested_by: UUID
) -> StockTransfer:
    if data.source_warehouse_id == data.dest_warehouse_id:
        raise AppError(
            "Source and destination warehouse must differ", error_code="transfer_same_warehouse"
        )

    for warehouse_id in (data.source_warehouse_id, data.dest_warehouse_id):
        warehouse = await require_active_warehouse(session, tenant_id, warehouse_id)
        if not warehouse.allow_transfers:
            raise AppError(
                "Warehouse does not allow transfers", error_code="transfer_not_transferable"
            )

    await _validate_products(session, tenant_id, data.lines)

    repo = TransferRepository(session)
    transfer = await repo.create(tenant_id, data, requested_by)

    source = await require_active_warehouse(session, tenant_id, data.source_warehouse_id)
    inventory_repo = InventoryRepository(session)

    for line in transfer.lines:
        if not source.allow_negative_stock:
            snapshot = await inventory_repo.get_snapshot(
                tenant_id, line.product_id, data.source_warehouse_id
            )
            available = snapshot.available_quantity if snapshot is not None else 0
            if available < line.quantity:
                raise ConflictError(
                    f"Insufficient stock for product {line.product_id}",
                    error_code="insufficient_stock",
                )

        await _post_movement(
            inventory_repo,
            tenant_id,
            product_id=line.product_id,
            warehouse_id=data.source_warehouse_id,
            movement_type=MovementType.TRANSFER_OUT,
            quantity_delta=-line.quantity,
            reference_id=transfer.id,
        )
        await _post_movement(
            inventory_repo,
            tenant_id,
            product_id=line.product_id,
            warehouse_id=data.dest_warehouse_id,
            movement_type=MovementType.TRANSFER_IN,
            quantity_delta=line.quantity,
            reference_id=transfer.id,
        )

    transfer.status = TransferStatus.COMPLETED
    transfer.completed_at = datetime.now(UTC)
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer.id)


async def update_transfer_lines(
    session: AsyncSession, tenant_id: UUID, transfer_id: UUID, data: TransferLinesUpdate
) -> StockTransfer:
    repo = TransferRepository(session)
    transfer = await _require_transfer(repo, tenant_id, transfer_id)
    _require_status(transfer, TransferStatus.DRAFT)

    await _validate_products(session, tenant_id, data.lines)
    await repo.replace_lines(
        tenant_id, transfer, [(line.product_id, line.quantity) for line in data.lines]
    )
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer_id)


async def submit_transfer(
    session: AsyncSession, tenant_id: UUID, transfer_id: UUID
) -> StockTransfer:
    repo = TransferRepository(session)
    transfer = await _require_transfer(repo, tenant_id, transfer_id)
    _require_status(transfer, TransferStatus.DRAFT)

    transfer.status = TransferStatus.PENDING
    transfer.submitted_at = datetime.now(UTC)
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer.id)


async def approve_transfer(
    session: AsyncSession, tenant_id: UUID, transfer_id: UUID, approved_by: UUID
) -> StockTransfer:
    repo = TransferRepository(session)
    transfer = await _require_transfer(repo, tenant_id, transfer_id)
    _require_status(transfer, TransferStatus.PENDING)

    transfer.status = TransferStatus.APPROVED
    transfer.approved_by = approved_by
    transfer.approved_at = datetime.now(UTC)
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer.id)


async def complete_transfer(
    session: AsyncSession, tenant_id: UUID, transfer_id: UUID
) -> StockTransfer:
    """Re-validates stock, then posts a matching TRANSFER_OUT/TRANSFER_IN
    movement pair per line through `InventoryRepository.apply_mutation` —
    the same code path a direct REST movement post or an offline sync push
    uses, so ChangeLog and snapshot math stay identical regardless of
    origin. Everything commits in one transaction; any line failing
    validation aborts the whole thing.
    """
    repo = TransferRepository(session)
    transfer = await _require_transfer(repo, tenant_id, transfer_id)
    _require_status(transfer, TransferStatus.APPROVED)

    source = await require_active_warehouse(session, tenant_id, transfer.source_warehouse_id)
    await require_active_warehouse(session, tenant_id, transfer.dest_warehouse_id)

    inventory_repo = InventoryRepository(session)
    for line in transfer.lines:
        if not source.allow_negative_stock:
            snapshot = await inventory_repo.get_snapshot(
                tenant_id, line.product_id, transfer.source_warehouse_id
            )
            available = snapshot.available_quantity if snapshot is not None else 0
            if available < line.quantity:
                raise ConflictError(
                    f"Insufficient stock for product {line.product_id}",
                    error_code="insufficient_stock",
                )

        await _post_movement(
            inventory_repo,
            tenant_id,
            product_id=line.product_id,
            warehouse_id=transfer.source_warehouse_id,
            movement_type=MovementType.TRANSFER_OUT,
            quantity_delta=-line.quantity,
            reference_id=transfer.id,
        )
        await _post_movement(
            inventory_repo,
            tenant_id,
            product_id=line.product_id,
            warehouse_id=transfer.dest_warehouse_id,
            movement_type=MovementType.TRANSFER_IN,
            quantity_delta=line.quantity,
            reference_id=transfer.id,
        )

    transfer.status = TransferStatus.COMPLETED
    transfer.completed_at = datetime.now(UTC)
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer.id)


async def _post_movement(
    repo: InventoryRepository,
    tenant_id: UUID,
    *,
    product_id: UUID,
    warehouse_id: UUID,
    movement_type: MovementType,
    quantity_delta: int,
    reference_id: UUID,
) -> None:
    payload = MovementCreate(
        id=generate_uuid7(),
        product_id=product_id,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        reference_id=reference_id,
    )
    mutation = MutationEnvelope(
        client_mutation_id=generate_uuid7(),
        entity_type="inventory_movement",
        entity_id=payload.id,
        operation=ChangeOperation.CREATE,
        base_version=None,
        payload=payload.model_dump(mode="json"),
        client_timestamp=datetime.now(UTC),
    )
    await repo.apply_mutation(tenant_id, mutation)


async def cancel_transfer(
    session: AsyncSession, tenant_id: UUID, transfer_id: UUID
) -> StockTransfer:
    repo = TransferRepository(session)
    transfer = await _require_transfer(repo, tenant_id, transfer_id)
    _require_status(transfer, TransferStatus.DRAFT, TransferStatus.PENDING, TransferStatus.APPROVED)

    transfer.status = TransferStatus.CANCELLED
    transfer.cancelled_at = datetime.now(UTC)
    await session.commit()
    return await _require_transfer(repo, tenant_id, transfer.id)


async def get_transfer(session: AsyncSession, tenant_id: UUID, transfer_id: UUID) -> StockTransfer:
    repo = TransferRepository(session)
    return await _require_transfer(repo, tenant_id, transfer_id)


async def list_transfers(
    session: AsyncSession, tenant_id: UUID, params: PageParams, status: TransferStatus | None
) -> tuple[list[StockTransfer], PaginationMeta]:
    repo = TransferRepository(session)
    items, total = await repo.list_transfers(tenant_id, params, status)
    return items, PaginationMeta.create(total=total, params=params)


async def to_read(session: AsyncSession, tenant_id: UUID, transfer: StockTransfer) -> TransferRead:
    """Enrich a transfer's lines with product names, SKUs and primary photos.

    `StockTransfer.lines` only stores `product_id`; the detail page renders
    product cards, so the catalogue info is joined in here. Unknown products
    keep their blank fields (they were likely deleted) rather than 404ing the
    whole transfer.
    """
    product_ids = [line.product_id for line in transfer.lines]
    products: dict[UUID, tuple[str, str]] = {}
    if product_ids:
        result = await session.execute(
            select(Product.id, Product.name, Product.sku).where(
                Product.id.in_(product_ids), Product.tenant_id == tenant_id
            )
        )
        products = {row.id: (row.name, row.sku) for row in result}
    images = await primary_image_map(session, tenant_id, product_ids)

    read = TransferRead.model_validate(transfer)
    read.lines = [
        TransferLineRead(
            id=line.id,
            product_id=line.product_id,
            quantity=line.quantity,
            name=products.get(line.product_id, ("", ""))[0],
            sku=products.get(line.product_id, ("", ""))[1],
            image_url=images.get(line.product_id),
        )
        for line in transfer.lines
    ]
    return read


async def to_read_list(
    session: AsyncSession, tenant_id: UUID, transfers: list[StockTransfer]
) -> list[TransferRead]:
    """Bulk version of `to_read`: one product query and one image map for the
    whole page instead of one pair per transfer."""
    product_ids = {line.product_id for t in transfers for line in t.lines}
    products: dict[UUID, tuple[str, str]] = {}
    if product_ids:
        result = await session.execute(
            select(Product.id, Product.name, Product.sku).where(
                Product.id.in_(product_ids), Product.tenant_id == tenant_id
            )
        )
        products = {row.id: (row.name, row.sku) for row in result}
    images = await primary_image_map(session, tenant_id, list(product_ids))

    reads: list[TransferRead] = []
    for transfer in transfers:
        read = TransferRead.model_validate(transfer)
        read.lines = [
            TransferLineRead(
                id=line.id,
                product_id=line.product_id,
                quantity=line.quantity,
                name=products.get(line.product_id, ("", ""))[0],
                sku=products.get(line.product_id, ("", ""))[1],
                image_url=images.get(line.product_id),
            )
            for line in transfer.lines
        ]
        reads.append(read)
    return reads
