import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi.security import HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.shared.core.config import get_settings
from app.shared.core.exceptions import UnauthorizedError

settings = get_settings()
_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(password, hashed_password)


def create_access_token(user_id: UUID, tenant_id: UUID) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "exp": expires_at,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise UnauthorizedError("Invalid or expired token") from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    # Opaque high-entropy random tokens, not user-chosen passwords — a fast
    # hash is appropriate here, argon2 would just add unnecessary latency.
    return hashlib.sha256(token.encode()).hexdigest()
