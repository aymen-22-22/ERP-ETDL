from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.pagination import PageParams, PaginationMeta
from app.shared.database.session import Base


class BaseRepository[EntityT: Base]:
    """Generic pagination/list/get for non-syncable entities (tenants, users,
    roles, ...) — sits alongside `app.sync.repository.SyncableRepository`
    rather than replacing it. Business modules whose entities replicate
    through the offline-sync framework use that one instead; anything managed
    purely online (identity, RBAC) uses this one.
    """

    model: type[EntityT]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, entity_id: UUID) -> EntityT | None:
        return await self._session.get(self.model, entity_id)

    async def list(self, params: PageParams) -> tuple[list[EntityT], PaginationMeta]:
        total = await self._session.scalar(select(func.count()).select_from(self.model))
        result = await self._session.execute(
            select(self.model).offset(params.offset).limit(params.page_size)
        )
        items = list(result.scalars().all())
        meta = PaginationMeta.create(total=total or 0, params=params)
        return items, meta
