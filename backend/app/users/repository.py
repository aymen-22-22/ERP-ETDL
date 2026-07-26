from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import Role, User, UserTenantRole


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create_user(self, *, email: str, hashed_password: str, full_name: str) -> User:
        user = User(email=email, hashed_password=hashed_password, full_name=full_name)
        self._session.add(user)
        await self._session.flush()
        return user

    async def list_roles(self) -> list[Role]:
        result = await self._session.execute(select(Role).order_by(Role.name))
        return list(result.scalars().all())

    async def get_role_by_name(self, name: str) -> Role | None:
        result = await self._session.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()

    async def list_members(self, tenant_id: UUID) -> list[tuple[User, Role, UserTenantRole]]:
        """Members of one tenant. Filtered on `tenant_id` explicitly rather than
        relying on RLS: `user_tenant_roles` intentionally isn't FORCE'd (login
        and permission checks read it without a tenant context), so the policy
        does not apply to the role this app connects as.
        """
        result = await self._session.execute(
            select(User, Role, UserTenantRole)
            .join(UserTenantRole, UserTenantRole.user_id == User.id)
            .join(Role, Role.id == UserTenantRole.role_id)
            .where(UserTenantRole.tenant_id == tenant_id)
            .order_by(User.full_name)
        )
        return [(row[0], row[1], row[2]) for row in result.all()]

    async def get_membership(self, tenant_id: UUID, user_id: UUID) -> UserTenantRole | None:
        result = await self._session.execute(
            select(UserTenantRole).where(
                UserTenantRole.tenant_id == tenant_id, UserTenantRole.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def add_membership(self, *, user_id: UUID, tenant_id: UUID, role_id: UUID) -> None:
        self._session.add(UserTenantRole(user_id=user_id, tenant_id=tenant_id, role_id=role_id))
        await self._session.flush()

    async def remove_membership(self, tenant_id: UUID, user_id: UUID) -> None:
        await self._session.execute(
            delete(UserTenantRole).where(
                UserTenantRole.tenant_id == tenant_id, UserTenantRole.user_id == user_id
            )
        )

    async def count_members_with_role(self, tenant_id: UUID, role_name: str) -> int:
        result = await self._session.scalar(
            select(func.count())
            .select_from(UserTenantRole)
            .join(Role, Role.id == UserTenantRole.role_id)
            .where(UserTenantRole.tenant_id == tenant_id, Role.name == role_name)
        )
        return result or 0
