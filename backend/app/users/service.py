from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.exceptions import AppError, ConflictError, NotFoundError
from app.shared.core.security import hash_password
from app.users.models import Role, User, UserTenantRole
from app.users.repository import UserRepository
from app.users.schemas import MemberCreate, MemberUpdate, TenantMemberRead

OWNER_ROLE = "owner"


def _to_member(user: User, role: Role, membership: UserTenantRole) -> TenantMemberRead:
    return TenantMemberRead(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role.name,
        joined_at=membership.created_at,
    )


async def list_members(session: AsyncSession, tenant_id: UUID) -> list[TenantMemberRead]:
    repo = UserRepository(session)
    return [_to_member(u, r, m) for u, r, m in await repo.list_members(tenant_id)]


async def list_roles(session: AsyncSession) -> list[Role]:
    return await UserRepository(session).list_roles()


async def add_member(
    session: AsyncSession, tenant_id: UUID, data: MemberCreate
) -> TenantMemberRead:
    """Adds someone to this tenant.

    Two paths:
      - the email is new -> create the account with the supplied password;
      - the email already exists -> attach that account to this tenant and
        leave its credentials untouched. Letting a tenant owner set a password
        for an account they don't own would be a trivial takeover of any known
        email address, so `password` is deliberately ignored in that branch.
    """
    repo = UserRepository(session)

    role = await repo.get_role_by_name(data.role)
    if role is None:
        raise AppError(f"Unknown role {data.role!r}", error_code="invalid_role")

    user = await repo.get_user_by_email(data.email)
    if user is None:
        user = await repo.create_user(
            email=data.email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
        )
    elif await repo.get_membership(tenant_id, user.id) is not None:
        raise ConflictError("That person is already a member", error_code="already_member")

    await repo.add_membership(user_id=user.id, tenant_id=tenant_id, role_id=role.id)
    await session.commit()

    membership = await repo.get_membership(tenant_id, user.id)
    if membership is None:  # pragma: no cover - just written in this transaction
        raise NotFoundError("Membership not found")
    return _to_member(user, role, membership)


async def update_member_role(
    session: AsyncSession, tenant_id: UUID, user_id: UUID, data: MemberUpdate
) -> TenantMemberRead:
    repo = UserRepository(session)

    membership = await repo.get_membership(tenant_id, user_id)
    if membership is None:
        raise NotFoundError("Member not found")

    new_role = await repo.get_role_by_name(data.role)
    if new_role is None:
        raise AppError(f"Unknown role {data.role!r}", error_code="invalid_role")

    await _guard_last_owner(repo, tenant_id, membership, new_role_name=new_role.name)

    membership.role_id = new_role.id
    await session.commit()

    for user, role, m in await repo.list_members(tenant_id):
        if user.id == user_id:
            return _to_member(user, role, m)
    raise NotFoundError("Member not found")


async def remove_member(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> None:
    repo = UserRepository(session)

    membership = await repo.get_membership(tenant_id, user_id)
    if membership is None:
        raise NotFoundError("Member not found")

    await _guard_last_owner(repo, tenant_id, membership, new_role_name=None)

    # Only the tenant membership is revoked — the user account itself survives,
    # because the same person may belong to other tenants.
    await repo.remove_membership(tenant_id, user_id)
    await session.commit()


async def _guard_last_owner(
    repo: UserRepository,
    tenant_id: UUID,
    membership: UserTenantRole,
    *,
    new_role_name: str | None,
) -> None:
    """Refuses any change that would leave the tenant with no owner — which
    would lock everyone out of user management permanently.
    """
    roles = {r.id: r.name for r in await repo.list_roles()}
    if roles.get(membership.role_id) != OWNER_ROLE:
        return
    if new_role_name == OWNER_ROLE:
        return
    if await repo.count_members_with_role(tenant_id, OWNER_ROLE) <= 1:
        raise ConflictError(
            "This is the last owner; promote another member first",
            error_code="last_owner",
        )
