from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.shared.core.config import get_settings
from app.shared.core.tenant import get_current_tenant_id

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True, echo=settings.sql_echo)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def get_tenant_db(
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
) -> AsyncGenerator[AsyncSession]:
    """Session dependency for any endpoint touching tenant-scoped tables.

    Sets `app.tenant_id` for the whole request so Postgres RLS policies
    (`USING (tenant_id = current_setting('app.tenant_id')::uuid)`) enforce
    isolation at the DB layer — a bug in a repository query still can't leak
    cross-tenant rows.

    Uses `set_config(..., is_local => false)` (session-scoped, not
    transaction-scoped) because a repository method that commits mid-request
    (e.g. `create_ref`'s commit-then-refresh) would otherwise lose the
    tenant context for every statement after that commit — `is_local =>
    true` reverts at the *transaction* boundary, not the request boundary.
    This is safe under connection pooling because every tenant-scoped
    request goes through this dependency and overwrites the setting before
    touching any other table; a pooled connection never runs a
    tenant-scoped query without this running first.
    """
    async with async_session_factory() as session:
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
            {"tenant_id": str(tenant_id)},
        )
        yield session
