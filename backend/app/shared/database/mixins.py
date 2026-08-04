import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.core.ids import generate_uuid7


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # `onupdate` is a Python callable, NOT `func.now()`.
    #
    # With a SQL-side onupdate, the value is computed by the database, so after
    # an UPDATE flush SQLAlchemy marks the attribute expired and re-reads it
    # lazily on next access. Under asyncio that lazy read is synchronous IO
    # outside the greenlet and raises:
    #
    #     MissingGreenlet: greenlet_spawn has not been called
    #
    # `serialize_syncable()` touches every column to snapshot the row for the
    # ChangeLog, so it tripped that on the very next line — meaning *every*
    # product update and delete failed with a 500, while creates worked because
    # INSERT fetches server defaults inline via RETURNING.
    #
    # Computing it in Python keeps the value on the object, needs no extra
    # query, and costs only that the timestamp comes from the app clock rather
    # than the database clock.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
    )


class SoftDeleteMixin:
    """`deleted_at` doubles as the tombstone marker for delete-sync."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class SyncableMixin(TimestampMixin, SoftDeleteMixin):
    """Base for every entity that must replicate through the sync framework.

    `id` is supplied by the client (UUIDv7, see app.shared.core.ids) rather than
    server-generated, so offline creates never need a round-trip to get an id.
    `version` is the optimistic-concurrency counter checked against a mutation's
    `base_version` on push; it is bumped by the sync service on every applied write.
    """

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class AuditMixin(TimestampMixin, SoftDeleteMixin):
    """Base for administrative entities (tenants, users, roles, ...) that are
    NOT offline-syncable business data — no client-generated id, no
    `tenant_id`, no `version`. See `SyncableMixin` for the offline-sync
    counterpart used by business modules like products/inventory.

    `id` is still UUIDv7 (for index locality / sortability) but server-generated,
    since these entities are always created online through an authenticated
    request, never offline.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), default=None
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), default=None
    )


class TenantScopedAuditMixin(AuditMixin):
    """Base for tenant-scoped reference/catalog data (categories, brands,
    units, tags, product images/attributes/variants). Server-generated id +
    audit fields like `AuditMixin`, plus a `tenant_id` for RLS isolation — but
    NO `version`, because these are edited online through the API, not
    replicated through the offline-sync framework. (Products themselves stay
    on `SyncableMixin`; their supporting catalog data does not.)
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
