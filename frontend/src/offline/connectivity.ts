type ConnectivityListener = () => void;

const listeners = new Set<ConnectivityListener>();

function handleOnline(): void {
  for (const listener of listeners) listener();
}

/**
 * Subscribes to connectivity regain (browser `online` event). Returns an
 * unsubscribe function. The app shell wires this to `syncEngine.runSync()`
 * once that's implemented.
 */
export function onConnectivityRestored(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  window.addEventListener("online", handleOnline);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("online", handleOnline);
    }
  };
}

export function isOnline(): boolean {
  return navigator.onLine;
}
