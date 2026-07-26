import { useEffect } from "react";

import { isOnline, onConnectivityRestored } from "./connectivity";
import { runSync } from "./syncEngine";

const SYNC_INTERVAL_MS = 30_000;

let inFlight: Promise<unknown> | null = null;

// No pending-mutations guard here: runSync is push-THEN-PULL, and a device
// that never writes still needs to pull other devices' changes. Gating the
// whole cycle on local pending writes would starve pull forever. (An empty
// push is already a no-op inside pushPending.)
async function trySync(): Promise<void> {
  if (!isOnline()) return;
  if (inFlight) return;
  inFlight = runSync();
  await inFlight;
  inFlight = null;
}

/**
 * Drains the offline mutation queue using four complementary triggers:
 *
 * 1. **Mount** — catches anything left pending from a previous session.
 * 2. **`online` event** — fires the instant connectivity is restored.
 * 3. **`visibilitychange`** — when the tab becomes visible again, attempt
 *    a sync immediately.
 * 4. **Periodic timer** — every 30 s while the app is in the foreground;
 *    catches mutations that were never pushed (e.g. user was offline, then
 *    reconnected while another tab was active).
 *
 * Each tab runs its own timer; overlap between triggers/tabs is safe — the
 * `inFlight` guard dedupes within a tab, and the server's client_mutation_id
 * idempotency makes a cross-tab double-push report DUPLICATE, not re-apply.
 */
export function useSyncDrain(): void {
  useEffect(() => {
    void trySync();

    function handleVisibility(): void {
      if (document.visibilityState === "visible") {
        void trySync();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    const unsubConnectivity = onConnectivityRestored(() => void trySync());
    const timer = setInterval(trySync, SYNC_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubConnectivity();
      clearInterval(timer);
    };
  }, []);
}
