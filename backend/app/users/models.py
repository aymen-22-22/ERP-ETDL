import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.mixins import AuditMixin
from app.shared.database.session import Base


class User(AuditMixin, Base):
    """A person who can sign in. Not tenant-scoped directly — a user can
    belong to more than one tenant (e.g. an accountant serving several
    SMBs), so tenant membership lives in `UserTenantRole` instead.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa.false())


class Role(AuditMixin, Base):
    """A named role (Owner, Manager, Cashier, Employee, Admin, ...). Roles
    are data, not hardcoded enums, so a permission set can be added or
    tenant-customized later without a schema change.
    """

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), default=None)


class Permission(AuditMixin, Base):
    """A single grantable capability, e.g. `products:create`. Left unseeded
    for now — inventing permission codes for modules that don't exist yet
    would just be fiction; each business module seeds the ones it needs
    when it lands.
    """

    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), default=None)


class RolePermission(Base):
    """Join table granting a permission to a role. Not audited/soft-deleted —
    a grant either exists or it doesn't, there's no meaningful history to
    keep for the row itself (the roles/permissions it references are).
    """

    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id"), primary_key=True
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("permissions.id"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserTenantRole(Base):
    """A user's membership in a tenant, with the role that governs their
    permissions there. This is genuinely tenant-scoped data (who belongs to
    this tenant) even though the table itself has no other syncable fields.
    """

    __tablename__ = "user_tenant_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
