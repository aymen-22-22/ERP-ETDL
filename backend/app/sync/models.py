import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Identity, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.session import Base


class ChangeOperation(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class ChangeLog(Base):
    """Append-only ledger every syncable write goes through. RLS-protected
    (see the Milestone 1 migration) so a session without `app.tenant_id` set
    sees no rows at all.

    `payload_version` tracks the schema version of the serialized entity
    snapshot in `payload`. Increment when entity columns change meaningfully
    so pull clients can adapt to different payload shapes.
    """

    __tablename__ = "change_log"
    __table_args__ = (Index("ix_change_log_tenant_seq", "tenant_id", "server_seq"),)

    PAYLOAD_VERSION: int = 1

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    # Idempotency key from the client's mutation queue: a retried push (service
    # worker Background Sync, flaky network) carrying the same id must not be
    # applied twice. Nullable because server-originated changes don't have one.
    client_mutation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), unique=True, default=None
    )
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    operation: Mapped[ChangeOperation] = mapped_column(
        Enum(ChangeOperation, native_enum=False, length=20), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    payload_version: Mapped[int] = mapped_column(nullable=False, default=PAYLOAD_VERSION)
    # Postgres IDENTITY — the per-tenant monotonic cursor clients page through
    # on pull. DB-assigned, returned via RETURNING on insert.
    server_seq: Mapped[int] = mapped_column(BigInteger, Identity(), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
