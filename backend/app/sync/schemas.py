from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

from app.sync.models import ChangeOperation


class MutationEnvelope(BaseModel):
    """One queued offline mutation, as pushed by the client.

    `client_mutation_id` is the idempotency key: retried pushes (e.g. from a
    service worker Background Sync retry) with the same id must not be applied
    twice. `base_version` is the version the client last saw for this entity;
    `None` only valid for `operation == CREATE`.
    """

    client_mutation_id: UUID
    entity_type: str
    entity_id: UUID
    operation: ChangeOperation
    base_version: int | None
    payload: dict[str, object]
    client_timestamp: datetime


class SyncPushRequest(BaseModel):
    mutations: list[MutationEnvelope]


class SyncPushItemStatus(StrEnum):
    APPLIED = "applied"
    CONFLICT = "conflict"
    DUPLICATE = "duplicate"


class SyncPushResult(BaseModel):
    client_mutation_id: UUID
    status: SyncPushItemStatus
    server_version: int | None = None
    server_record: dict[str, object] | None = None
    change: ChangeRecord | None = None


class SyncPushResponse(BaseModel):
    results: list[SyncPushResult]


class ChangeRecord(BaseModel):
    entity_type: str
    entity_id: UUID
    operation: ChangeOperation
    version: int
    payload: dict[str, object]
    payload_version: int = 1
    server_seq: int
    created_at: datetime


class SyncPullResponse(BaseModel):
    changes: list[ChangeRecord]
    cursor: int
    has_more: bool
