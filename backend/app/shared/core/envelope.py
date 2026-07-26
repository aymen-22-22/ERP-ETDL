from pydantic import BaseModel

from app.shared.core.pagination import PaginationMeta


class ResponseEnvelope[T](BaseModel):
    """Wraps every single-resource response: `{"data": {...}}`."""

    data: T


class PaginatedEnvelope[T](BaseModel):
    """Wraps every list/paginated response: `{"data": [...], "meta": {...}}`."""

    data: list[T]
    meta: PaginationMeta
