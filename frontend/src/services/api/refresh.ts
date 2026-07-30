import { API_BASE_URL } from "./config";

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  isSuperuser: boolean;
}

interface RefreshEnvelope {
  data: { access_token: string; refresh_token: string; is_superuser: boolean };
}

/**
 * Exchanges a refresh token for a new token pair. Deliberately free of any
 * store dependency so both the API client's 401 retry and the auth store's
 * boot-time rehydration can call it without an import cycle.
 *
 * Returns null when the server rejects the token (it's invalid/expired — the
 * caller should clear the session) and throws only on network failure, which
 * the caller treats as "offline, keep the stale session".
 */
async function doRefresh(refreshToken: string): Promise<RefreshedTokens | null> {
  const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as RefreshEnvelope;
  return {
    accessToken: body.data.access_token,
    refreshToken: body.data.refresh_token,
    isSuperuser: body.data.is_superuser,
  };
}

/** Shared in-flight request, so concurrent callers rotate the token once. */
let inFlight: Promise<RefreshedTokens | null> | null = null;

export function requestTokenRefresh(refreshToken: string): Promise<RefreshedTokens | null> {
  // The server rotates refresh tokens: a successful refresh invalidates the one
  // that was presented. Two concurrent calls with the same token would mean the
  // second one 401s on an already-consumed token and looks like an expired
  // session — which happens routinely (StrictMode's double-invoked effect in
  // dev, or two requests 401ing at once). Sharing one in-flight promise makes
  // every concurrent caller observe the same single rotation.
  inFlight ??= doRefresh(refreshToken).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
