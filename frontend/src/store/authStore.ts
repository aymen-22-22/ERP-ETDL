import { create } from "zustand";

import { requestTokenRefresh } from "@/services/api/refresh";

const STORAGE_KEY = "erp_auth_session";

interface PersistedSession {
  tenantId: string;
  refreshToken: string;
  isSuperuser: boolean;
}

function persistSession(session: PersistedSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage full or unavailable — degraded UX but not fatal.
  }
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function clearPersistedSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best effort
  }
}

interface AuthState {
  tenantId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isSuperuser: boolean;
  isHydrated: boolean;
  setSession: (session: { tenantId: string; accessToken: string; refreshToken: string; isSuperuser?: boolean }) => void;
  updateTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clearSession: () => void;
  hydrateFromCache: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  tenantId: null,
  accessToken: null,
  refreshToken: null,
  isSuperuser: false,
  isHydrated: false,

  setSession: (session) => {
    set({ ...session, isHydrated: true, isSuperuser: session.isSuperuser ?? false });
    persistSession({ tenantId: session.tenantId, refreshToken: session.refreshToken, isSuperuser: session.isSuperuser ?? false });
  },

  updateTokens: (tokens) => {
    set(tokens);
    const state = useAuthStore.getState();
    if (state.tenantId) {
      persistSession({ tenantId: state.tenantId, refreshToken: tokens.refreshToken, isSuperuser: state.isSuperuser });
    }
  },

  clearSession: () => {
    set({ tenantId: null, accessToken: null, refreshToken: null, isSuperuser: false });
    clearPersistedSession();
  },

  hydrateFromCache: async () => {
    const cached = loadSession();
    if (!cached) {
      set({ isHydrated: true });
      return;
    }

    set({ tenantId: cached.tenantId, refreshToken: cached.refreshToken, isSuperuser: cached.isSuperuser ?? false });

    try {
      const tokens = await requestTokenRefresh(cached.refreshToken);
      if (tokens) {
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isSuperuser: tokens.isSuperuser });
        persistSession({
          tenantId: cached.tenantId,
          refreshToken: tokens.refreshToken,
          isSuperuser: tokens.isSuperuser,
        });
      } else {
        set({ tenantId: null, refreshToken: null });
        clearPersistedSession();
      }
    } catch {
      // Network failure — keep the stale session so the user stays on the
      // current page. The API client will retry the refresh on the next request.
    }

    set({ isHydrated: true });
  },
}));
