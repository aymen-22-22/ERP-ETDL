from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.shared.core.exceptions import UnauthorizedError
from app.shared.core.security import bearer_scheme, decode_access_token


async def get_current_tenant_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> UUID:
    """Derives the active tenant from the verified access token's `tenant_id`
    claim (set at login — see app.auth.service.login). Replaces the
    `X-Tenant-Id` header placeholder used before Milestone 2 existed; every
    caller of this dependency (sync, get_tenant_db, ...) got real tenant
    scoping the moment this one function changed.
    """
    if credentials is None:
        raise UnauthorizedError("Missing credentials")
    payload = decode_access_token(credentials.credentials)
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise UnauthorizedError("Token missing tenant context")
    return UUID(str(tenant_id))
