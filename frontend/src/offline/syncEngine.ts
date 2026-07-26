import { apiFetch } from "@/services/api/client";

import { applyChange } from "./applyChange";
import { db } from "./db";
import { ack, markConflict, nextBatch } from "./mutationQueue";
import type { ChangeOperation, QueuedMutation } from "./types";

export interface SyncEngineResult {
  pushed: number;
  pulled: number;
  conflicts: number;
}

const CURSOR_KEY = "sync_cursor";
const PULL_PAGE_SIZE = 200;

interface RawPushResult {
  client_mutation_id: string;
  status: "applied" | "conflict" | "duplicate";
  server_version: number | null;
  server_record: Record<string, unknown> | null;
  change: RawChange | null;
}

interface RawPushResponse {
  results: RawPushResult[];
}

// camelCase queue rows -> the backend's snake_case MutationEnvelope contract.
function toEnvelope(mutation: QueuedMutation): Record<string, unknown> {
  return {
    client_mutation_id: mutation.clientMutationId,
    entity_type: mutation.entityType,
    entity_id: mutation.entityId,
    operation: mutation.operation,
    base_version: mutation.baseVersion,
    payload: mutation.payload,
    client_timestamp: mutation.clientTimestamp,
  };
}

interface PushResult {
  pushed: number;
  conflicts: number;
  changes: RawChange[];
}

/**
 * Drains pending queued mutations to POST /sync/push and reconciles each
 * result: `applied`/`duplicate` -> remove from the queue and collect the
 * ChangeLog entry; `conflict` -> park the row (status "conflict") and record
 * the server's version for the user to reconcile. Server stays the source of
 * truth — a conflicted local write is never silently kept.
 */
export async function pushPending(): Promise<PushResult> {
  const batch = await nextBatch(100);
  if (batch.length === 0) return { pushed: 0, conflicts: 0, changes: [] };

  const response = await apiFetch<RawPushResponse>("/api/v1/sync/push", {
    method: "POST",
    body: JSON.stringify({ mutations: batch.map(toEnvelope) }),
  });

  let pushed = 0;
  let conflicts = 0;
  const changes: RawChange[] = [];

  for (const result of response.results) {
    if (result.status === "applied" || result.status === "duplicate") {
      await ack(result.client_mutation_id);
      pushed += 1;
      if (result.change) changes.push(result.change);
    } else {
      await markConflict(result.client_mutation_id);
      if (result.server_record) {
        const source = batch.find((m) => m.clientMutationId === result.client_mutation_id);
        await db.conflicts.put({
          id: result.client_mutation_id,
          entityType: source?.entityType ?? "unknown",
          entityId: source?.entityId ?? "",
          serverRecord: result.server_record,
          detectedAt: new Date().toISOString(),
        });
      }
      conflicts += 1;
    }
  }

  return { pushed, conflicts, changes };
}

interface RawChange {
  entity_type: string;
  entity_id: string;
  operation: ChangeOperation;
  version: number;
  payload: Record<string, unknown>;
  payload_version: number;
  server_seq: number;
  created_at: string;
}

interface RawPullResponse {
  changes: RawChange[];
  cursor: number;
  has_more: boolean;
}

async function getCursor(): Promise<number> {
  const row = await db.syncMeta.get(CURSOR_KEY);
  return row?.value ?? 0;
}

/**
 * Pulls the server change log since the stored cursor and materializes each
 * change into the local Dexie tables, paging until caught up. The server is
 * the source of truth: pulled snapshots overwrite local rows, and tombstones
 * remove them. Advancing the cursor per page makes it resumable.
 */
export async function pullChanges(): Promise<{ pulled: number }> {
  let pulled = 0;
  let hasMore = true;

  while (hasMore) {
    const cursor = await getCursor();
    const page = await apiFetch<RawPullResponse>(
      `/api/v1/sync/pull?since=${cursor}&limit=${PULL_PAGE_SIZE}`,
      { method: "GET" },
    );

    for (const raw of page.changes) {
      await applyChange({
        entityType: raw.entity_type,
        entityId: raw.entity_id,
        operation: raw.operation,
        version: raw.version,
        payload: raw.payload,
        payloadVersion: raw.payload_version,
        serverSeq: raw.server_seq,
        createdAt: raw.created_at,
      });
    }

    await db.syncMeta.put({ key: CURSOR_KEY, value: page.cursor });
    pulled += page.changes.length;
    hasMore = page.has_more;
  }

  return { pulled };
}

let inFlight: Promise<SyncEngineResult> | null = null;

async function pushThenPull(): Promise<SyncEngineResult> {
  const push = await pushPending();

  let pulled = 0;

  if (push.changes.length > 0) {
    let maxSeq = 0;
    for (const raw of push.changes) {
      await applyChange({
        entityType: raw.entity_type,
        entityId: raw.entity_id,
        operation: raw.operation,
        version: raw.version,
        payload: raw.payload,
        payloadVersion: raw.payload_version,
        serverSeq: raw.server_seq,
        createdAt: raw.created_at,
      });
      if (raw.server_seq > maxSeq) maxSeq = raw.server_seq;
    }
    await db.syncMeta.put({ key: CURSOR_KEY, value: maxSeq });
    pulled += push.changes.length;
  }

  const pull = await pullChanges();
  pulled += pull.pulled;

  return { pushed: push.pushed, conflicts: push.conflicts, pulled };
}

/**
 * One push-then-pull cycle, guarded so overlapping triggers (connectivity
 * regain + a fresh mutation + Background Sync) don't run concurrently. Network
 * failures (offline) are swallowed and reported as a no-op — local state is
 * untouched and the next trigger retries.
 */
export function runSync(): Promise<SyncEngineResult> {
  if (inFlight) return inFlight;
  inFlight = pushThenPull()
    .catch(() => ({ pushed: 0, pulled: 0, conflicts: 0 }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
