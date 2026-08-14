from uuid import UUID

from fastapi import Request

from app.shared.core.logging import get_logger

logger = get_logger(__name__)


def _tenant_id_from_request(request: Request) -> UUID | None:
    """Best-effort tenant extraction for the error log.

    Runs in the exception handler, outside the dependency graph, so we cannot
    rely on `get_current_tenant_id`. Decode the bearer token if present; return
    None otherwise (system-level error, no tenant context yet — the feed still
    surfaces it).
    """
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :]
    try:
        from app.shared.core.security import decode_access_token

        payload = decode_access_token(token)
        tenant_id = payload.get("tenant_id")
        return UUID(str(tenant_id)) if tenant_id else None
    except Exception:
        return None


async def record_error(
    request: Request,
    *,
    level: str,
    code: str,
    message: str,
    traceback: str | None = None,
    details: object = None,
) -> None:
    """Persist one error to `app_error_logs`, best-effort.

    Deliberately never raises: this runs from exception handlers, and a logging
    failure must not replace the response the client is about to receive. All
    imports are lazy because this module sits at the edge of the dependency
    graph (exceptions.py → here → models → session), and importing eagerly from
    `app.shared.core.security`/`database.session` at module load would create a
    cycle with `app.shared.core.exceptions`.
    """
    try:
        from app.monitoring.models import AppErrorLog
        from app.shared.database.session import async_session_factory

        tenant_id = _tenant_id_from_request(request)
        async with async_session_factory() as session:
            session.add(
                AppErrorLog(
                    tenant_id=tenant_id,
                    level=level,
                    code=code,
                    message=message[:1000],
                    path=request.url.path,
                    method=request.method,
                    traceback=traceback,
                    details=details if isinstance(details, dict) else {"detail": details},
                )
            )
            await session.commit()
    except Exception:
        logger.warning("error_log_persistence_failed")
