import { db } from "./db";
import { type EnqueueMutationInput, enqueueMutation } from "./mutationQueue";
import { runSync } from "./syncEngine";

export class SyncConflictError extends Error {
  constructor() {
    super("sync_conflict");
    this.name = "SyncConflictError";
  }
}

export type SubmitOutcome = "applied" | "queued";

/**
 * The write path every syncable feature module uses: enqueue the mutation,
 * attempt an immediate drain, then report what happened.
 *   - "applied": pushed and accepted by the server this instant (online).
 *   - "queued":  still pending — offline, will drain on reconnect.
 *   - throws SyncConflictError: the server rejected it on a version check;
 *     the stale local mutation is discarded (server is source of truth).
 */
export async function submitMutation(input: EnqueueMutationInput): Promise<SubmitOutcome> {
  const queued = await enqueueMutation(input);
  await runSync();

  const row = await db.mutationQueue.get(queued.clientMutationId);
  if (!row) return "applied";
  if (row.status === "conflict") {
    await db.mutationQueue.delete(queued.clientMutationId);
    throw new SyncConflictError();
  }
  return "queued";
}
