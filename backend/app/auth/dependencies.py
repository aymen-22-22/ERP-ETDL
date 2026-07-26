from collections.abc import Callable, Coroutine
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.exceptions import PermissionDeniedError, UnauthorizedError
from app.shared.core.security import bearer_scheme, decode_access_token
from app.shared.core.tenant import get_current_tenant_id
from app.shared.database.session import get_db
from app.users.models import Permission, RolePermission, User, UserTenantRole


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing credentials")
    payload = decode_access_token(credentials.credentials)
    user = await session.get(User, UUID(str(payload.get("sub"))))
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid or inactive user")
    return user


def require_permission(code: str) -> Callable[..., Coroutine[None, None, None]]:
    """Dependency factory: 403s unless the current user's role in the
    current tenant grants `code`. Checks
    UserTenantRole -> Role -> RolePermission -> Permission.
    """

    async def dependency(
        user: Annotated[User, Depends(get_current_user)],
        tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
        session: Annotated[AsyncSession, Depends(get_db)],
    ) -> None:
        stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserTenantRole, UserTenantRole.role_id == RolePermission.role_id)
            .where(
                UserTenantRole.user_id == user.id,
                UserTenantRole.tenant_id == tenant_id,
                Permission.code == code,
            )
        )
        result = await session.execute(stmt)
        if result.first() is None:
            raise PermissionDeniedError(f"Missing permission: {code}")

    return dependency
