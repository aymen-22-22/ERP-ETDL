from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.schemas import PlatformUserCreate, PlatformUserRead
from app.shared.core.security import hash_password
from app.tenants.models import Tenant
from app.users.models import Role, User, UserTenantRole


async def create_user(session: AsyncSession, data: PlatformUserCreate) -> PlatformUserRead:
    existing = await session.scalar(select(User).where(User.email == data.email))
    if existing is not None:
        from app.shared.core.exceptions import ConflictError

        raise ConflictError("A user with this email already exists")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    session.add(user)
    await session.flush()

    if data.tenant_id and data.role:
        role = await session.scalar(select(Role).where(Role.name == data.role))
        if role is None:
            from app.shared.core.exceptions import AppError

            raise AppError(f"Unknown role {data.role!r}", error_code="invalid_role")
        session.add(UserTenantRole(user_id=user.id, tenant_id=data.tenant_id, role_id=role.id))

    await session.commit()
    await session.refresh(user)
    return PlatformUserRead.model_validate(user)


async def list_users(session: AsyncSession) -> list[PlatformUserRead]:
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    return [PlatformUserRead.model_validate(u) for u in result.scalars().all()]


async def list_tenants(session: AsyncSession) -> list:
    from app.platform.schemas import PlatformTenantRead

    result = await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return [PlatformTenantRead.model_validate(t) for t in result.scalars().all()]
