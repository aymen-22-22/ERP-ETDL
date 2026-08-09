from uuid import UUID

from sqlalchemy import func, select

from app.inventory.models import InventoryMovement, ProductStockSnapshot
from app.inventory.schemas import MovementCreate
from app.shared.core.exceptions import ConflictError
from app.shared.core.pagination import PageParams
from app.sync.models import ChangeOperation
from app.sync.repository import SyncableRepository
from app.sync.schemas import MutationEnvelope
from app.warehouses.models import Warehouse


class InventoryRepository(SyncableRepository[InventoryMovement]):
    async def get(self, tenant_id: UUID, entity_id: UUID) -> InventoryMovement | None:
        result = await self._session.execute(
            select(InventoryMovement).where(
                InventoryMovement.id == entity_id, InventoryMovement.tenant_id == tenant_id
            )
        )
        return result.scalar_one_or_none()

    async def _persist(self, tenant_id: UUID, mutation: MutationEnvelope) -> InventoryMovement:
        if mutation.operation != ChangeOperation.CREATE:
            raise ConflictError(
                "Inventory movements are append-only; corrections use a new "
                "offsetting movement, not an edit",
                error_code="movement_immutable",
            )

        data = MovementCreate.model_validate(mutation.payload)
        movement = InventoryMovement(
            id=mutation.entity_id,
            tenant_id=tenant_id,
            product_id=data.product_id,
            warehouse_id=data.warehouse_id,
            movement_type=data.movement_type,
            quantity_delta=data.quantity_delta,
            reference_id=data.reference_id,
            note=data.note,
            config=data.config,
            version=1,
        )
        self._session.add(movement)
        await self._session.flush()

        warehouse = await self._session.get(Warehouse, data.warehouse_id)
        allow_negative = warehouse.allow_negative_stock if warehouse else False

        await self._apply_snapshot(
            tenant_id, data.product_id, data.warehouse_id, data.quantity_delta, allow_negative
        )
        return movement

    async def _apply_snapshot(
        self,
        tenant_id: UUID,
        product_id: UUID,
        warehouse_id: UUID,
        quantity_delta: int,
        allow_negative_stock: bool = False,
    ) -> None:
        snapshot = await self._session.get(ProductStockSnapshot, (product_id, warehouse_id))
        if snapshot is None:
            if not allow_negative_stock and quantity_delta < 0:
                raise ConflictError(
                    f"Insufficient stock for product {product_id} in warehouse {warehouse_id}",
                    error_code="insufficient_stock",
                )
            self._session.add(
                ProductStockSnapshot(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    tenant_id=tenant_id,
                    quantity_on_hand=quantity_delta,
                )
            )
        else:
            new_quantity = snapshot.quantity_on_hand + quantity_delta
            if not allow_negative_stock and new_quantity < 0:
                raise ConflictError(
                    f"Insufficient stock for product {product_id} in warehouse {warehouse_id}: "
                    f"has {snapshot.quantity_on_hand}, delta {quantity_delta}",
                    error_code="insufficient_stock",
                )
            snapshot.quantity_on_hand = new_quantity

    async def set_min_quantity(
        self, tenant_id: UUID, product_id: UUID, warehouse_id: UUID, min_quantity: int | None
    ) -> None:
        """Set the low-stock alert threshold for one product in one warehouse.

        Separate from `_apply_snapshot` because it is not a stock movement: the
        threshold is a setting, not a quantity change, and must be settable on
        a product that has no stock yet. Until now the column existed and was
        read by the low-stock count and the stock badges, but nothing could
        ever write it — so it was always NULL and every "low stock" indicator
        was permanently dead.
        """
        snapshot = await self._session.get(ProductStockSnapshot, (product_id, warehouse_id))
        if snapshot is None:
            self._session.add(
                ProductStockSnapshot(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    tenant_id=tenant_id,
                    quantity_on_hand=0,
                    min_quantity=min_quantity,
                )
            )
            return
        snapshot.min_quantity = min_quantity

    async def ensure_snapshots_for_all_warehouses(self, tenant_id: UUID, product_id: UUID) -> None:
        """Create a zero-quantity snapshot for every active warehouse missing one.

        A product that starts life with 10 units in the depot should exist at
        0 in the store too — the staff counts on seeing every warehouse as a
        column, not on a warehouse quietly vanishing until a movement touches
        it. Snapshot rows are otherwise created lazily, so this backfills the
        ones a fresh product has not been counted into yet.
        """
        result = await self._session.execute(
            select(Warehouse.id).where(
                Warehouse.tenant_id == tenant_id,
                Warehouse.is_active.is_(True),
                Warehouse.deleted_at.is_(None),
            )
        )
        for (warehouse_id,) in result.all():
            snapshot = await self._session.get(ProductStockSnapshot, (product_id, warehouse_id))
            if snapshot is None:
                self._session.add(
                    ProductStockSnapshot(
                        product_id=product_id,
                        warehouse_id=warehouse_id,
                        tenant_id=tenant_id,
                        quantity_on_hand=0,
                    )
                )

    async def get_snapshot(
        self, tenant_id: UUID, product_id: UUID, warehouse_id: UUID
    ) -> ProductStockSnapshot | None:
        snapshot = await self._session.get(ProductStockSnapshot, (product_id, warehouse_id))
        if snapshot is None or snapshot.tenant_id != tenant_id:
            return None
        return snapshot

    async def list_snapshots_for_product(
        self, tenant_id: UUID, product_id: UUID
    ) -> list[ProductStockSnapshot]:
        result = await self._session.execute(
            select(ProductStockSnapshot).where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.product_id == product_id,
            )
        )
        return list(result.scalars().all())

    async def list_for_product(
        self,
        tenant_id: UUID,
        product_id: UUID,
        params: PageParams,
        warehouse_id: UUID | None = None,
    ) -> tuple[list[InventoryMovement], int]:
        base = select(InventoryMovement).where(
            InventoryMovement.tenant_id == tenant_id, InventoryMovement.product_id == product_id
        )
        if warehouse_id is not None:
            base = base.where(InventoryMovement.warehouse_id == warehouse_id)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        result = await self._session.execute(
            base.order_by(InventoryMovement.created_at.desc())
            .offset(params.offset)
            .limit(params.page_size)
        )
        return list(result.scalars().all()), total or 0

    async def list_snapshots_for_warehouse(
        self, tenant_id: UUID, warehouse_id: UUID
    ) -> list[ProductStockSnapshot]:
        result = await self._session.execute(
            select(ProductStockSnapshot).where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == warehouse_id,
            )
        )
        return list(result.scalars().all())

    async def count_products_with_stock(self, tenant_id: UUID, warehouse_id: UUID) -> int:
        result = await self._session.scalar(
            select(func.count())
            .select_from(ProductStockSnapshot)
            .where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == warehouse_id,
                ProductStockSnapshot.quantity_on_hand > 0,
            )
        )
        return result or 0

    async def sum_quantity_for_warehouse(self, tenant_id: UUID, warehouse_id: UUID) -> int:
        result = await self._session.scalar(
            select(func.coalesce(func.sum(ProductStockSnapshot.quantity_on_hand), 0)).where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == warehouse_id,
            )
        )
        return int(result or 0)

    async def count_low_stock(self, tenant_id: UUID, warehouse_id: UUID) -> int:
        result = await self._session.scalar(
            select(func.count())
            .select_from(ProductStockSnapshot)
            .where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.warehouse_id == warehouse_id,
                ProductStockSnapshot.min_quantity.isnot(None),
                ProductStockSnapshot.quantity_on_hand < ProductStockSnapshot.min_quantity,
            )
        )
        return result or 0

    async def summarize_warehouses(self, tenant_id: UUID) -> dict[UUID, dict[str, int]]:
        """Per-warehouse totals in two grouped queries, not N scalar ones.

        The single-warehouse path runs one query per metric; the bulk path
        would multiply that by the number of warehouses, so collapse both
        count-based metrics into grouped aggregates instead. Rows with
        quantity_on_hand == 0 contribute nothing to the sum, so filtering to
        `> 0` yields `total_quantity` and `total_products` at once.
        """
        result = await self._session.execute(
            select(
                ProductStockSnapshot.warehouse_id,
                func.coalesce(func.sum(ProductStockSnapshot.quantity_on_hand), 0),
                func.count(),
            )
            .where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.quantity_on_hand > 0,
            )
            .group_by(ProductStockSnapshot.warehouse_id)
        )
        summaries: dict[UUID, dict[str, int]] = {}
        for warehouse_id, total_quantity, total_products in result:
            summaries[warehouse_id] = {
                "total_products": total_products,
                "total_quantity": int(total_quantity),
            }

        low_stock = await self._session.execute(
            select(
                ProductStockSnapshot.warehouse_id,
                func.count(),
            )
            .where(
                ProductStockSnapshot.tenant_id == tenant_id,
                ProductStockSnapshot.min_quantity.isnot(None),
                ProductStockSnapshot.quantity_on_hand < ProductStockSnapshot.min_quantity,
            )
            .group_by(ProductStockSnapshot.warehouse_id)
        )
        for warehouse_id, low_stock_count in low_stock:
            entry = summaries.setdefault(
                warehouse_id,
                {"total_products": 0, "total_quantity": 0},
            )
            entry["low_stock_count"] = low_stock_count

        for summary in summaries.values():
            summary.setdefault("low_stock_count", 0)
        return summaries
