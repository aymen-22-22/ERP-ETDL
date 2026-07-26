from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.shared.core.pagination import PageParams
from app.transfers.models import StockTransfer, StockTransferLine, TransferStatus
from app.transfers.schemas import TransferCreate


class TransferRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, tenant_id: UUID, data: TransferCreate, requested_by: UUID
    ) -> StockTransfer:
        transfer = StockTransfer(
            tenant_id=tenant_id,
            source_warehouse_id=data.source_warehouse_id,
            dest_warehouse_id=data.dest_warehouse_id,
            note=data.note,
            requested_by=requested_by,
            status=TransferStatus.DRAFT,
        )
        self._session.add(transfer)
        await self._session.flush()

        for line in data.lines:
            self._session.add(
                StockTransferLine(
                    tenant_id=tenant_id,
                    transfer_id=transfer.id,
                    product_id=line.product_id,
                    quantity=line.quantity,
                )
            )
        await self._session.flush()
        return await self.get(tenant_id, transfer.id)  # type: ignore[return-value]

    async def get(self, tenant_id: UUID, transfer_id: UUID) -> StockTransfer | None:
        result = await self._session.execute(
            select(StockTransfer)
            .where(StockTransfer.id == transfer_id, StockTransfer.tenant_id == tenant_id)
            .options(selectinload(StockTransfer.lines))
        )
        return result.scalar_one_or_none()

    async def list_transfers(
        self, tenant_id: UUID, params: PageParams, status: TransferStatus | None
    ) -> tuple[list[StockTransfer], int]:
        base = select(StockTransfer).where(StockTransfer.tenant_id == tenant_id)
        if status is not None:
            base = base.where(StockTransfer.status == status)

        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        result = await self._session.execute(
            base.options(selectinload(StockTransfer.lines))
            .order_by(StockTransfer.created_at.desc())
            .offset(params.offset)
            .limit(params.page_size)
        )
        return list(result.scalars().all()), total or 0

    async def replace_lines(
        self, tenant_id: UUID, transfer: StockTransfer, lines: list[tuple[UUID, int]]
    ) -> None:
        """`transfer` must have been loaded with its `lines` eager-loaded
        (e.g. via `get()`), since the relationship uses `lazy="raise"`.
        """
        for existing in list(transfer.lines):
            await self._session.delete(existing)
        await self._session.flush()

        for product_id, quantity in lines:
            self._session.add(
                StockTransferLine(
                    tenant_id=tenant_id,
                    transfer_id=transfer.id,
                    product_id=product_id,
                    quantity=quantity,
                )
            )
        await self._session.flush()
