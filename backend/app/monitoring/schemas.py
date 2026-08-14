from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.sync.models import ChangeOperation


class ActivityLogRead(BaseModel):
    """One human-readable entry in the Settings → Logs activity feed.

    `message` is the friendly description; `details` carries the raw serialized
    entity for anyone who needs the full technical snapshot behind it.
    """

    id: UUID
    entity_type: str
    entity_id: UUID
    operation: ChangeOperation
    message: str
    details: dict[str, object]
    created_at: datetime


class ErrorLogRead(BaseModel):
    """One recorded error from the Settings → Logs error feed.

    `message` is human-readable; `traceback`/`details` hold the technical
    detail needed to actually debug it.
    """

    id: UUID
    level: str
    code: str
    message: str
    path: str | None
    method: str | None
    traceback: str | None
    details: dict[str, object] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationRead(BaseModel):
    """One alert (e.g. low stock in a warehouse). `data` carries the technical
    payload for deep-linking; `title`/`message` are human-readable."""

    id: UUID
    kind: str
    severity: str
    title: str
    message: str
    entity_type: str | None
    entity_id: UUID | None
    data: dict[str, object]
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCount(BaseModel):
    count: int
