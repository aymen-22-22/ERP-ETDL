import re
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import RefreshToken
from app.tenants.models import Tenant
from app.users.models import Role, User, UserTenantRole
from app.warehouses.models import Warehouse, WarehouseType

_SLUG_INVALID_CHARS = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _SLUG_INVALID_CHARS.sub("-", name.strip().lower()).strip("-")
    return slug or "tenant"


class AuthRepository:
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

    async def has_tenant_membership(self, user_id: UUID, tenant_id: UUID) -> bool:
        result = await self._session.execute(
            select(UserTenantRole).where(
                UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id
            )
        )
        return result.first() is not None

    async def get_user_tenants(self, user_id: UUID) -> list[UUID]:
        result = await self._session.execute(
            select(UserTenantRole.tenant_id)
            .where(UserTenantRole.user_id == user_id)
            .order_by(UserTenantRole.created_at)
        )
        return [row[0] for row in result]

    async def save_refresh_token(
        self, *, user_id: UUID, tenant_id: UUID, token_hash: str, expires_at: datetime
    ) -> None:
        self._session.add(
            RefreshToken(
                user_id=user_id,
                tenant_id=tenant_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        await self._session.flush()

    async def get_refresh_token(self, token_hash: str) -> RefreshToken | None:
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def delete_refresh_token(self, token_hash: str) -> None:
        await self._session.execute(
            delete(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )

    async def create_tenant(self, name: str) -> Tenant:
        base_slug = _slugify(name)
        slug = base_slug
        suffix = 1
        while await self._session.scalar(select(Tenant).where(Tenant.slug == slug)) is not None:
            suffix += 1
            slug = f"{base_slug}-{suffix}"

        tenant = Tenant(name=name, slug=slug)
        self._session.add(tenant)
        await self._session.flush()
        return tenant

    async def get_role_by_name(self, name: str) -> Role:
        result = await self._session.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role is None:
            raise LookupError(f"Role {name!r} is not seeded")
        return role

    async def assign_tenant_role(self, *, user_id: UUID, tenant_id: UUID, role_id: UUID) -> None:
        self._session.add(UserTenantRole(user_id=user_id, tenant_id=tenant_id, role_id=role_id))
        await self._session.flush()

    async def create_default_warehouse(self, tenant_id: UUID) -> Warehouse:
        warehouse = Warehouse(
            tenant_id=tenant_id,
            name="Main Warehouse",
            warehouse_type=WarehouseType.DEPOT,
            is_default=True,
        )
        self._session.add(warehouse)
        await self._session.flush()
        return warehouse
