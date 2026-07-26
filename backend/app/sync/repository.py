from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.exceptions import ConflictError, NotFoundError
from app.shared.core.ids import generate_uuid7
from app.shared.database.mixins import SyncableMixin
from app.sync.models import ChangeLog, ChangeOperation
from app.sync.schemas import MutationEnvelope
from app.sync.serialization import serialize_syncable


class SyncableRepository[EntityT: SyncableMixin](ABC):
    """Base for any module repository whose entity replicates through sync.

    A concrete repository (Products, Sales, ...) implements `get` and
    `_persist` for its own model. `apply_mutation` is the single integration
    point every write goes through — whether it arrives via a direct REST
    call or via the offline mutation queue's `/sync/push` — so the
    version-check (last-write-wins) and the `ChangeLog` append happen exactly
    once, in one transaction, regardless of caller.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @abstractmethod
    async def get(self, tenant_id: UUID, entity_id: UUID) -> EntityT | None:
        raise NotImplementedError

    @abstractmethod
    async def _persist(self, tenant_id: UUID, mutation: MutationEnvelope) -> EntityT:
        raise NotImplementedError

    async def apply_mutation(
        self, tenant_id: UUID, mutation: MutationEnvelope
    ) -> tuple[EntityT, ChangeLog]:
        if mutation.operation != ChangeOperation.CREATE:
            current = await self.get(tenant_id, mutation.entity_id)
            if current is None:
                raise NotFoundError(f"{mutation.entity_type} not found")
            if mutation.base_version != current.version:
                raise ConflictError(
                    f"Version mismatch for {mutation.entity_type}", error_code="sync_conflict"
                )

        entity = await self._persist(tenant_id, mutation)
        await self._session.flush()

        changelog = ChangeLog(
            id=generate_uuid7(),
            tenant_id=tenant_id,
            client_mutation_id=mutation.client_mutation_id,
            entity_type=mutation.entity_type,
            entity_id=mutation.entity_id,
            operation=mutation.operation,
            version=entity.version,
            payload=serialize_syncable(entity),
        )
        self._session.add(changelog)
        await self._session.flush()
        return entity, changelog


class SyncableCRUDRepository[
    EntityT: SyncableMixin,
    CreateSchemaT: BaseModel,
    UpdateSchemaT: BaseModel,
](SyncableRepository[EntityT]):
    """Generic CRUD repository for syncable entities with standard create/
    update/delete semantics. Subclasses declare `model_class`,
    `create_schema`, and `update_schema`. Override `_persist` only for
    special behavior (append-only, custom side-effects).

    CREATE  — validates payload against CreateSchemaT, constructs the model,
              sets `id` from `mutation.entity_id`.
    UPDATE  — validates payload against UpdateSchemaT, applies non-None fields.
    DELETE  — sets `deleted_at` (soft-delete tombstone).
    """

    model_class: type[EntityT]
    create_schema: type[CreateSchemaT]
    update_schema: type[UpdateSchemaT]

    async def get(self, tenant_id: UUID, entity_id: UUID) -> EntityT | None:
        result = await self._session.execute(
            select(self.model_class).where(
                self.model_class.id == entity_id,
                self.model_class.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def _persist(self, tenant_id: UUID, mutation: MutationEnvelope) -> EntityT:
        if mutation.operation == ChangeOperation.CREATE:
            data = self.create_schema.model_validate(mutation.payload).model_dump()
            data.pop("id", None)
            entity = self.model_class(id=mutation.entity_id, tenant_id=tenant_id, version=1, **data)  # type: ignore[call-arg]
            self._session.add(entity)
            return entity

        existing = await self.get(tenant_id, mutation.entity_id)
        if existing is None:
            raise ValueError(f"{self.model_class.__name__} not found during persist")

        if mutation.operation == ChangeOperation.UPDATE:
            validated = self.update_schema.model_validate(mutation.payload)
            update_data: dict[str, Any] = validated.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(existing, field, value)
        elif mutation.operation == ChangeOperation.DELETE:
            existing.deleted_at = datetime.now(UTC)

        existing.version += 1
        return existing
