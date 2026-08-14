import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.core.ids import generate_uuid7
from app.shared.database.session import Base


class AppErrorLog(Base):
    """One recorded application error, surfaced human-readably in Settings.

    Written by the global exception handlers (see app.shared.core.exceptions),
    so it deliberately has NO RLS and no tenant context requirement the way
    business tables do: the handlers run outside the request dependency graph
    (an error can occur before tenant resolution), and forcing RLS there would
    either block the insert (no `app.tenant_id` set) or silently drop rows
    under a NULL tenant. Isolation is therefore enforced in queries — every
    read filters `tenant_id` explicitly, and `tenant_id` is best-effort: it is
    decoded from the bearer token when present, NULL otherwise.

    `traceback` holds the full formatted exception for technical debugging
    while `message` stays human-readable.
    """

    __tablename__ = "app_error_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), index=True, default=None
    )
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    path: Mapped[str | None] = mapped_column(String(500), default=None)
    method: Mapped[str | None] = mapped_column(String(20), default=None)
    traceback: Mapped[str | None] = mapped_column(Text, default=None)
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """A user-facing alert (e.g. low stock in a warehouse).

    `data` carries the technical payload (product_id, warehouse_id, SKU,
    quantities) so the UI can deep-link while `title`/`message` stay
    human-readable. `read_at` NULL means unread; low-stock alerts are
    auto-resolved (set to read) when stock is replenished above the minimum.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50), default=None)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), default=None, index=True
    )
    data: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
