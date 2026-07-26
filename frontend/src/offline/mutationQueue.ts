import { v7 as uuidv7 } from "uuid";

import { db } from "./db";
import type { ChangeOperation, QueuedMutation } from "./types";

export interface EnqueueMutationInput {
  entityType: string;
  entityId: string;
  operation: ChangeOperation;
  baseVersion: number | null;
  payload: Record<string, unknown>;
}

/**
 * The single integration point every future feature module's mutation hooks
 * call instead of hitting the API client directly for create/update/delete —
 * this is what makes offline support automatic for any module that uses it.
 */
export async function enqueueMutation(input: EnqueueMutationInput): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    ...input,
    clientMutationId: uuidv7(),
    clientTimestamp: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
  };
  await db.mutationQueue.add(mutation);
  return mutation;
}

export async function nextBatch(limit = 50): Promise<QueuedMutation[]> {
  return db.mutationQueue.where("status").equals("pending").limit(limit).toArray();
}

export async function ack(clientMutationId: string): Promise<void> {
  await db.mutationQueue.delete(clientMutationId);
}

export async function markConflict(clientMutationId: string): Promise<void> {
  await db.mutationQueue.update(clientMutationId, { status: "conflict" });
}
