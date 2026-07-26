import { create } from "zustand";

import { clearSession as clearPersistedSession, loadSession, persistSession } from "@/offline/auth";
import { requestTokenRefresh } from "@/services/api/refresh";

interface AuthState {
  tenantId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** True after hydrateFromCache() finishes — guards ProtectedRoute from
   *  redirecting to /login before the persisted session is checked. */
  isHydrated: boolean;
  setSession: (session: { tenantId: string; accessToken: string; refreshToken: string }) => void;
  updateTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clearSession: () => void;
  hydrateFromCache: () => Promise<void>;
}

/**
 * In-memory access token (not persisted, limits XSS token-theft exposure).
 * The refresh token is persisted to IndexedDB via offline/auth.ts so the
 * session survives page reloads — on boot, hydrateFromCache() restores the
 * refresh token and attempts a silent renewal. If offline, the stale session
 * allows cached Dexie reads until connectivity returns.
 */
export const useAuthStore = create<AuthState>((set) => ({
  tenantId: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  setSession: (session) => {
    set({ ...session, isHydrated: true });
    void persistSession({ tenantId: session.tenantId, refreshToken: session.refreshToken });
  },

  updateTokens: (tokens) => {
    set(tokens);
    const state = useAuthStore.getState();
    if (state.tenantId) {
      void persistSession({ tenantId: state.tenantId, refreshToken: tokens.refreshToken });
    }
  },

  clearSession: () => {
    set({ tenantId: null, accessToken: null, refreshToken: null });
    void clearPersistedSession();
  },

  hydrateFromCache: async () => {
    const cached = await loadSession();
    if (!cached) {
      set({ isHydrated: true });
      return;
    }

    // Restore the persisted half of the session first so an offline reload
    // still has a tenantId for cached Dexie reads.
    set({ tenantId: cached.tenantId, refreshToken: cached.refreshToken });

    // The access token is in-memory only, so it's always gone after a reload —
    // exchange the persisted refresh token for a fresh one, otherwise
    // ProtectedRoute (which gates on accessToken) bounces the user to /login
    // on every refresh even though their session is still valid.
    try {
      const tokens = await requestTokenRefresh(cached.refreshToken);
      if (tokens) {
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        void persistSession({
          tenantId: cached.tenantId,
          refreshToken: tokens.refreshToken,
        });
      } else {
        // Server rejected it — the token is expired/revoked, not a network blip.
        set({ tenantId: null, refreshToken: null });
        void clearPersistedSession();
      }
    } catch {
      // Network failure (offline): keep the stale session so cached reads work.
      // The API client retries the refresh on the next request.
    }

    set({ isHydrated: true });
  },
}));
