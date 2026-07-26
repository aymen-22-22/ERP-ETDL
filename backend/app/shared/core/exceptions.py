from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.shared.core.logging import get_logger

logger = get_logger(__name__)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: object = None


class ErrorResponse(BaseModel):
    """The error response contract: `{"error": {"code", "message", "details"}}`.

    `code` is stable and meant to be matched on by clients; `message` is
    human-readable and may change wording without notice.
    """

    error: ErrorBody


class AppError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    error_code: str = "app_error"

    def __init__(self, message: str, *, error_code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if error_code:
            self.error_code = error_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "conflict"


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "permission_denied"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "unauthorized"


class RateLimitedError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "rate_limited"


def _error_envelope(*, error_code: str, message: str, details: object = None) -> dict[str, object]:
    body = ErrorBody(code=error_code, message=message, details=details)
    return ErrorResponse(error=body).model_dump()


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_envelope(error_code=exc.error_code, message=exc.message),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_envelope(
                error_code="validation_error",
                message="Request validation failed",
                details=exc.errors(),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_envelope(error_code="http_error", message=str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception", error=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_envelope(
                error_code="internal_error", message="An unexpected error occurred"
            ),
        )
