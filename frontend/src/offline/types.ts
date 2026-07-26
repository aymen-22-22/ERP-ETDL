export type ChangeOperation = "create" | "update" | "delete";

export interface SyncableRecord {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MutationEnvelope {
  clientMutationId: string;
  entityType: string;
  entityId: string;
  operation: ChangeOperation;
  baseVersion: number | null;
  payload: Record<string, unknown>;
  clientTimestamp: string;
}

export type SyncPushItemStatus = "applied" | "conflict" | "duplicate";

export interface SyncPushResult {
  clientMutationId: string;
  status: SyncPushItemStatus;
  serverVersion: number | null;
  serverRecord: Record<string, unknown> | null;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
}

export interface ChangeRecord {
  entityType: string;
  entityId: string;
  operation: ChangeOperation;
  version: number;
  payload: Record<string, unknown>;
  payloadVersion: number;
  serverSeq: number;
  createdAt: string;
}

export interface SyncPullResponse {
  changes: ChangeRecord[];
  cursor: number;
  hasMore: boolean;
}

export type QueuedMutationStatus = "pending" | "syncing" | "conflict" | "failed";

export interface QueuedMutation extends MutationEnvelope {
  status: QueuedMutationStatus;
  retryCount: number;
}
