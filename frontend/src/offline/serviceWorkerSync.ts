export const SYNC_TAG = "erp-offline-sync";

interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  sync: SyncManager;
}

function hasSyncManager(
  registration: ServiceWorkerRegistration,
): registration is ServiceWorkerRegistrationWithSync {
  return "sync" in registration;
}

/**
 * Registers a Background Sync tag so a queued mutation survives the page
 * being closed before connectivity returns — the browser retries the sync
 * even without the app open. Returns false where Background Sync isn't
 * supported; callers fall back to `connectivity.onConnectivityRestored`.
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  const registration = await navigator.serviceWorker.ready;
  if (!hasSyncManager(registration)) return false;

  await registration.sync.register(SYNC_TAG);
  return true;
}
