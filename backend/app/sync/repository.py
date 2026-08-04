from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import inspect, select
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
        # `updated_at` (onupdate=func.now()) and other server-computed columns
        # are expired by the flush above -- refresh eagerly here, inside an
        # awaited context. Without this, `serialize_syncable` below (a plain
        # sync function) can trigger an implicit lazy-load on first access,
        # which raises MissingGreenlet since it happens outside the async
        # bridge. A single-mutation request rarely hits this because nothing
        # else touches the session first; a caller that does several
        # mutations in one session (e.g. a bulk import) hits it reliably.
        await self._session.refresh(entity)

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

    def _model_columns(self) -> set[str]:
        """Names of the model's actual mapped columns."""
        mapper = inspect(self.model_class, raiseerr=True)
        return {attr.key for attr in mapper.mapper.column_attrs}

    def _column_data(self, validated: BaseModel, *, exclude_unset: bool = False) -> dict[str, Any]:
        """Schema fields reduced to those the model can actually store.

        A create/update schema may legitimately carry fields that are
        instructions rather than columns — `ProductCreate.initial_stock` asks
        for an opening stock movement, it isn't a column on `Product`. Passing
        one into the model constructor raises
        `TypeError: '<field>' is an invalid keyword argument`.

        This mattered in production and was invisible in testing: `model_dump()`
        emits *every* field including defaults, so a payload that never
        mentioned `initial_stock` still sent `initial_stock=None` and crashed
        every offline product create with a 500.
        """
        dumped: dict[str, Any] = validated.model_dump(exclude_unset=exclude_unset)
        dumped.pop("id", None)
        columns = self._model_columns()
        return {key: value for key, value in dumped.items() if key in columns}

    async def _persist(self, tenant_id: UUID, mutation: MutationEnvelope) -> EntityT:
        if mutation.operation == ChangeOperation.CREATE:
            validated_create = self.create_schema.model_validate(mutation.payload)
            data = self._column_data(validated_create)
            entity = self.model_class(id=mutation.entity_id, tenant_id=tenant_id, version=1, **data)  # type: ignore[call-arg]
            self._session.add(entity)
            return entity

        existing = await self.get(tenant_id, mutation.entity_id)
        if existing is None:
            raise ValueError(f"{self.model_class.__name__} not found during persist")

        if mutation.operation == ChangeOperation.UPDATE:
            validated = self.update_schema.model_validate(mutation.payload)
            for field, value in self._column_data(validated, exclude_unset=True).items():
                setattr(existing, field, value)
        elif mutation.operation == ChangeOperation.DELETE:
            existing.deleted_at = datetime.now(UTC)

        existing.version += 1
        return existing
