from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.shared.core.config import get_settings
from app.shared.core.tenant import get_current_tenant_id

settings = get_settings()

if settings.db_disable_pooling:
    # See config.db_disable_pooling: under Passenger/a2wsgi, every request runs
    # on its own event loop, so a connection checked back into a persistent
    # pool can be handed out again under a *different* loop than the one it
    # was created on — asyncpg doesn't reliably error on that, it can silently
    # return stale data. NullPool opens a fresh connection per checkout and
    # closes it on release, so nothing ever crosses a request boundary.
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        echo=settings.sql_echo,
    )
else:
    # `pool_pre_ping` matters most against a remote database: it validates a
    # pooled connection before handing it out, so a link dropped by an idle
    # timeout or a network blip surfaces as a transparent reconnect rather than
    # a failed request. Pool size is kept small because Passenger forks
    # several worker processes, each with its own pool (see
    # config.db_pool_size) — though in practice Passenger deployments should
    # set db_disable_pooling instead; this branch is for a single
    # long-running event loop (uvicorn).
    engine = create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle_seconds,
        echo=settings.sql_echo,
    )

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
