import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";

import { isOnline, onConnectivityRestored } from "./connectivity";
import { db } from "./db";
import { runSync } from "./syncEngine";
import type { SyncEngineResult } from "./syncEngine";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface OfflineSyncState {
  status: SyncStatus;
  pendingCount: number;
  conflictCount: number;
  /** Runs a push+pull immediately instead of waiting for the 30s poll. */
  syncNow: () => Promise<SyncEngineResult | null>;
}

/**
 * Exposes sync status to the app shell. `pendingCount`/`conflictCount` are
 * live Dexie queries via `useLiveQuery` — they re-render automatically when
 * the mutation queue or conflicts table changes (e.g. after a background sync
 * push), no polling needed.
 *
 * `syncNow` exists because the background drain only runs every 30 seconds (or
 * on tab focus), so a change made on another device can take that long to
 * appear. Waiting is correct for battery and server load, but there's no way to
 * say "check now" — which makes the app look broken when it's merely patient.
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

  const syncNow = useCallback(async (): Promise<SyncEngineResult | null> => {
    if (!isOnline()) {
      setStatus("offline");
      return null;
    }
    setStatus("syncing");
    try {
      const result = await runSync();
      setStatus("idle");
      return result;
    } catch {
      // `runSync` swallows its own network errors, so reaching here means
      // something unexpected broke rather than a normal offline blip.
      setStatus("error");
      return null;
    }
  }, []);

  const pendingCount =
    useLiveQuery(() => db.mutationQueue.where("status").equals("pending").count()) ?? 0;
  const conflictCount = useLiveQuery(() => db.conflicts.count()) ?? 0;

  return { status, pendingCount, conflictCount, syncNow };
}
