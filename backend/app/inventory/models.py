import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.mixins import SyncableMixin
from app.shared.database.session import Base


class MovementType(StrEnum):
    PURCHASE = "purchase"
    SALE = "sale"
    RETURN = "return"
    DAMAGE = "damage"
    ADJUSTMENT = "adjustment"
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"


class InventoryMovement(SyncableMixin, Base):
    """Append-only audit trail. Per the architecture's non-negotiable: stock
    is never a directly editable column — every change to on-hand quantity
    is a movement row, and corrections are new offsetting movements, not
    edits to old ones (see InventoryRepository — update/delete are rejected).
    """

    __tablename__ = "inventory_movements"

    # Overrides SyncableMixin's plain tenant_id to add the FK, same pattern
    # as ChangeLog/Product.
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), index=True
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False, index=True
    )
    movement_type: Mapped[MovementType] = mapped_column(
        Enum(
            MovementType,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
    )
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), default=None)
    note: Mapped[str | None] = mapped_column(String(500), default=None)


class ProductStockSnapshot(Base):
    """Current on-hand quantity per (product, warehouse), maintained
    transactionally alongside each `InventoryMovement` insert (see
    InventoryRepository._apply_snapshot). Not a `SyncableMixin` entity — it's
    server-derived data, never created/updated directly by a client
    mutation, so it has no `ChangeLog` entries of its own.

    `reserved_quantity` is for future sales-cart holds (a reservation is
    incremented before a sale completes, then released/consumed on
    checkout). `available_quantity` (on_hand - reserved) is always computed,
    never stored, so there's no risk of the two drifting out of sync.
    """

    __tablename__ = "product_stock_snapshots"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), primary_key=True
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    quantity_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_quantity: Mapped[int | None] = mapped_column(Integer, default=None)
    max_quantity: Mapped[int | None] = mapped_column(Integer, default=None)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def available_quantity(self) -> int:
        return self.quantity_on_hand - self.reserved_quantity
