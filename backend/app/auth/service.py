from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.repository import AuthRepository
from app.auth.schemas import (
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserPublic,
)
from app.shared.core.config import get_settings
from app.shared.core.exceptions import PermissionDeniedError, UnauthorizedError
from app.shared.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

settings = get_settings()


async def register(session: AsyncSession, data: RegisterRequest) -> RegisterResponse:
    """Creates the user, a new tenant for them, the owner role membership,
    and the tenant's default warehouse — all in one transaction, so a
    successful registration always leaves a fully provisioned tenant behind
    (and a failure leaves nothing).
    """
    repo = AuthRepository(session)
    if await repo.get_user_by_email(data.email) is not None:
        raise UnauthorizedError("Email already registered", error_code="email_taken")

    user = await repo.create_user(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    tenant = await repo.create_tenant(data.tenant_name)
    owner_role = await repo.get_role_by_name("owner")
    await repo.assign_tenant_role(user_id=user.id, tenant_id=tenant.id, role_id=owner_role.id)

    # Registration runs on a plain (non-tenant-scoped) session because no tenant
    # exists yet when it starts. The default warehouse is tenant-scoped data
    # under RLS, so the context has to be set for the just-created tenant before
    # inserting it — otherwise the policy's WITH CHECK rejects the row.
    await session.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
        {"tenant_id": str(tenant.id)},
    )
    await repo.create_default_warehouse(tenant.id)

    await session.commit()
    return RegisterResponse(
        user=UserPublic.model_validate(user),
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
    )


async def login(session: AsyncSession, data: LoginRequest) -> TokenResponse:
    repo = AuthRepository(session)
    user = await repo.get_user_by_email(data.email)
    if user is None or not verify_password(data.password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is inactive")

    tenants = await repo.get_user_tenants(user.id)
    if not tenants:
        raise PermissionDeniedError("No business assigned to this account")
    tenant_id = tenants[0]

    tenant = await repo.get_tenant_by_id(tenant_id)
    tokens = await _issue_tokens(
        repo,
        user_id=user.id,
        tenant_id=tenant_id,
        is_superuser=user.is_superuser,
        tenant_name=tenant.name if tenant else "",
        tenant_logo_url=tenant.logo_url if tenant else None,
    )
    await session.commit()
    return tokens


async def refresh(session: AsyncSession, refresh_token: str) -> TokenResponse:
    repo = AuthRepository(session)
    token_hash = hash_refresh_token(refresh_token)
    row = await repo.get_refresh_token(token_hash)
    if row is None or row.expires_at < datetime.now(UTC):
        raise UnauthorizedError("Invalid or expired refresh token")

    user = await repo.get_user_by_id(row.user_id)
    is_superuser = user.is_superuser if user else False

    tenant = await repo.get_tenant_by_id(row.tenant_id)
    await repo.delete_refresh_token(token_hash)
    tokens = await _issue_tokens(
        repo,
        user_id=row.user_id,
        tenant_id=row.tenant_id,
        is_superuser=is_superuser,
        tenant_name=tenant.name if tenant else "",
        tenant_logo_url=tenant.logo_url if tenant else None,
    )
    await session.commit()
    return tokens


async def logout(session: AsyncSession, refresh_token: str) -> None:
    repo = AuthRepository(session)
    await repo.delete_refresh_token(hash_refresh_token(refresh_token))
    await session.commit()


async def _issue_tokens(
    repo: AuthRepository,
    *,
    user_id: UUID,
    tenant_id: UUID,
    is_superuser: bool = False,
    tenant_name: str = "",
    tenant_logo_url: str | None = None,
) -> TokenResponse:
    access_token = create_access_token(user_id, tenant_id, is_superuser=is_superuser)
    refresh_token = generate_refresh_token()
    await repo.save_refresh_token(
        user_id=user_id,
        tenant_id=tenant_id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
        is_superuser=is_superuser,
    )
