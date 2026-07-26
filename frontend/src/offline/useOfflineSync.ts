import { useEffect, useState } from "react";

import { useLiveQuery } from "dexie-react-hooks";

import { isOnline, onConnectivityRestored } from "./connectivity";
import { db } from "./db";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface OfflineSyncState {
  status: SyncStatus;
  pendingCount: number;
  conflictCount: number;
}

/**
 * Exposes sync status to the app shell. `pendingCount`/`conflictCount` are
 * live Dexie queries via `useLiveQuery` — they re-render automatically when
 * the mutation queue or conflicts table changes (e.g. after a background sync
 * push), no polling needed.
 */
export function useOfflineSync(): OfflineSyncState {
  const [status, setStatus] = useState<SyncStatus>(isOnline() ? "idle" : "offline");

  useEffect(() => {
    const unsubscribe = onConnectivityRestored(() => setStatus("idle"));
    const handleOffline = () => setStatus("offline");
    window.addEventListener("offline", handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const pendingCount =
    useLiveQuery(() => db.mutationQueue.where("status").equals("pending").count()) ?? 0;
  const conflictCount = useLiveQuery(() => db.conflicts.count()) ?? 0;

  return { status, pendingCount, conflictCount };
}
