from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.shared.database.mixins import SyncableMixin
from app.sync.models import ChangeLog


def _to_json_safe(value: object) -> object:
    if isinstance(value, UUID | Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_syncable(entity: SyncableMixin) -> dict[str, object]:
    """Full JSON-safe snapshot of a syncable row. Stored as the `ChangeLog`
    payload so `/sync/pull` delivers complete rows (not lean mutation deltas),
    letting a client materialize any entity uniformly regardless of whether
    the change was a create, update, or delete. Also used to return the
    server's current row on a push conflict.

    Includes `_payload_version` so the client can detect schema changes
    in the serialized row format.
    """
    table = entity.__table__  # type: ignore[attr-defined]
    result: dict[str, object] = {
        column.name: _to_json_safe(getattr(entity, column.name)) for column in table.columns
    }
    result["_payload_version"] = ChangeLog.PAYLOAD_VERSION
    return result
