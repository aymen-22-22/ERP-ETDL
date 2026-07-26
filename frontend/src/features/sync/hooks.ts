import { useLiveQuery } from "dexie-react-hooks";

import { db, type ConflictRecord } from "@/offline/db";

export function useConflicts(): ConflictRecord[] | undefined {
  return useLiveQuery(() => db.conflicts.toArray());
}

export async function resolveConflict(conflictId: string): Promise<void> {
  await db.conflicts.delete(conflictId);
}

export async function acceptServerVersion(conflictId: string): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return;

  // Overwrite the local Dexie row with the server's version so future
  // edits are based on the server's truth.
  const table = db.table(conflict.entityType);
  if (table) {
    await table.put(conflict.serverRecord);
  }
  await db.conflicts.delete(conflictId);
}
