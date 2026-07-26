import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.database.mixins import TenantScopedAuditMixin
from app.shared.database.session import Base


class TransferStatus(StrEnum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockTransferLine(TenantScopedAuditMixin, Base):
    __tablename__ = "stock_transfer_lines"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_transfer_line_qty_positive"),)

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stock_transfers.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)


class StockTransfer(TenantScopedAuditMixin, Base):
    """A stock-transfer document with a server-authoritative approval
    workflow (Draft -> Pending -> Approved -> Completed, or -> Cancelled at
    any point before Completed). Not offline-syncable — status transitions
    are permission-gated and "Completed" has a side effect (posting
    inventory movements), which doesn't fit the last-write-wins model used
    for plain offline CRUD entities.
    """

    __tablename__ = "stock_transfers"
    __table_args__ = (
        CheckConstraint("source_warehouse_id != dest_warehouse_id", name="ck_transfer_diff_wh"),
    )

    source_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False, index=True
    )
    dest_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False, index=True
    )
    status: Mapped[TransferStatus] = mapped_column(
        Enum(
            TransferStatus,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=TransferStatus.DRAFT,
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), default=None
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), default=None
    )
    note: Mapped[str | None] = mapped_column(String(500), default=None)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    lines: Mapped[list[StockTransferLine]] = relationship(
        "StockTransferLine", cascade="all, delete-orphan", lazy="raise"
    )
