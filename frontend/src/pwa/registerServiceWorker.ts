import { registerSW } from "virtual:pwa-register";

export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export interface ServiceWorkerCallbacks {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

const PERIODIC_UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Explicit SW registration (vite.config.ts sets `injectRegister: false` so
 * this is the only registration path). `registerType: "autoUpdate"` means no
 * user prompt: a detected update is applied immediately via `updateSW(true)`.
 * The periodic `registration.update()` call is the standard workaround for
 * browsers not checking for a new service worker often enough on their own.
 */
export function registerServiceWorker(
  callbacks: ServiceWorkerCallbacks = {},
): UpdateServiceWorker {
  const updateSW = registerSW({
    onNeedRefresh() {
      callbacks.onNeedRefresh?.();
      void updateSW(true);
    },
    onOfflineReady() {
      callbacks.onOfflineReady?.();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, PERIODIC_UPDATE_CHECK_MS);
    },
    onRegisterError(error: unknown) {
      console.error("Service worker registration failed", error);
    },
  });

  return updateSW;
}
