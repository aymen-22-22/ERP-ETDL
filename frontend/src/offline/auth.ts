import { db } from "./db";

/** Persists the refresh token (not the short-lived access token) to IndexedDB
 * so the session survives page reloads. The access token stays in-memory only
 * (zustand) to limit XSS exposure.
 *
 * On reload, `loadSession` restores the tenantId + refreshToken from Dexie,
 * then the app tries a silent online refresh to get a fresh access token.
 * If offline, the stale session lets cached Dexie reads work until connectivity
 * returns and refresh succeeds.
 */
export async function persistSession(session: {
  tenantId: string;
  refreshToken: string;
}): Promise<void> {
  await db.authSession.put({ key: "current", ...session });
}

export async function loadSession(): Promise<{
  tenantId: string;
  refreshToken: string;
} | null> {
  const row = await db.authSession.get("current");
  if (!row) return null;
  return { tenantId: row.tenantId, refreshToken: row.refreshToken };
}

export async function clearSession(): Promise<void> {
  await db.authSession.delete("current");
}