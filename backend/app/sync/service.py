from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.core.cache import get_tenant_cache
from app.shared.core.exceptions import ConflictError, NotFoundError
from app.sync.models import ChangeLog
from app.sync.registry import SYNC_REGISTRY
from app.sync.schemas import (
    ChangeRecord,
    MutationEnvelope,
    SyncPullResponse,
    SyncPushItemStatus,
    SyncPushRequest,
    SyncPushResponse,
    SyncPushResult,
)
from app.sync.serialization import serialize_syncable


async def _conflict_result(
    repo: object, tenant_id: UUID, mutation: MutationEnvelope
) -> SyncPushResult:
    current = await repo.get(tenant_id, mutation.entity_id)  # type: ignore[attr-defined]
    return SyncPushResult(
        client_mutation_id=mutation.client_mutation_id,
        status=SyncPushItemStatus.CONFLICT,
        server_version=current.version if current else None,
        server_record=serialize_syncable(current) if current else None,
    )


def _changelog_to_record(row: ChangeLog) -> ChangeRecord:
    return ChangeRecord(
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        operation=row.operation,
        version=row.version,
        payload=row.payload,
        payload_version=row.payload_version,
        server_seq=row.server_seq,
        created_at=row.created_at,
    )


async def apply_mutations(
    session: AsyncSession, tenant_id: UUID, request: SyncPushRequest
) -> SyncPushResponse:
    """Dispatch a batch of pushed offline mutations to their repositories.

    Per envelope: dedupe on `client_mutation_id` (already in the ledger ->
    DUPLICATE), else dispatch to the registered `SyncableRepository` inside a
    SAVEPOINT so one mutation failing (version conflict, or a DB constraint
    like a duplicate SKU) rolls back only that mutation and reports a CONFLICT
    — the rest of the batch still applies. The whole batch commits once at the
    end.

    For APPLIED and DUPLICATE results, the full ChangeLog record is included
    in the response so the client can apply it directly and advance its cursor
    without a redundant pull round-trip.
    """
    results: list[SyncPushResult] = []

    for mutation in request.mutations:
        already_applied = await session.scalar(
            select(ChangeLog).where(
                ChangeLog.tenant_id == tenant_id,
                ChangeLog.client_mutation_id == mutation.client_mutation_id,
            )
        )
        if already_applied is not None:
            results.append(
                SyncPushResult(
                    client_mutation_id=mutation.client_mutation_id,
                    status=SyncPushItemStatus.DUPLICATE,
                    server_version=already_applied.version,
                    change=_changelog_to_record(already_applied),
                )
            )
            continue

        repo_cls = SYNC_REGISTRY.get(mutation.entity_type)
        if repo_cls is None:
            results.append(
                SyncPushResult(
                    client_mutation_id=mutation.client_mutation_id,
                    status=SyncPushItemStatus.CONFLICT,
                )
            )
            continue

        repo = repo_cls(session)
        try:
            async with session.begin_nested():
                entity, changelog = await repo.apply_mutation(tenant_id, mutation)
            results.append(
                SyncPushResult(
                    client_mutation_id=mutation.client_mutation_id,
                    status=SyncPushItemStatus.APPLIED,
                    server_version=entity.version,
                    change=_changelog_to_record(changelog),
                )
            )
        except ConflictError, NotFoundError, IntegrityError:
            results.append(await _conflict_result(repo, tenant_id, mutation))

    await session.commit()

    # Invalidate read caches for every entity type that was mutated in this
    # batch so subsequent reads pick up the freshly-persisted state.
    cache = get_tenant_cache()
    mutated_types = {m.entity_type for m in request.mutations}
    for entity_type in mutated_types:
        await cache.invalidate_pattern(tenant_id, entity_type)

    return SyncPushResponse(results=results)


async def build_pull_page(
    session: AsyncSession, tenant_id: UUID, since: int, limit: int
) -> SyncPullResponse:
    """Read `ChangeLog` rows for this tenant with `server_seq > since`,
    ascending, capped at `limit` (fetching one extra to detect `has_more`).
    """
    rows = list(
        await session.scalars(
            select(ChangeLog)
            .where(ChangeLog.tenant_id == tenant_id, ChangeLog.server_seq > since)
            .order_by(ChangeLog.server_seq)
            .limit(limit + 1)
        )
    )

    has_more = len(rows) > limit
    rows = rows[:limit]

    changes = [
        ChangeRecord(
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            operation=row.operation,
            version=row.version,
            payload=row.payload,
            payload_version=row.payload_version,
            server_seq=row.server_seq,
            created_at=row.created_at,
        )
        for row in rows
    ]
    cursor = rows[-1].server_seq if rows else since
    return SyncPullResponse(changes=changes, cursor=cursor, has_more=has_more)
