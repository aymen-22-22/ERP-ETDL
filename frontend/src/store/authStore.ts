import { create } from "zustand";

import { requestTokenRefresh } from "@/services/api/refresh";

const STORAGE_KEY = "erp_auth_session";

interface PersistedSession {
  tenantId: string;
  refreshToken: string;
  isSuperuser: boolean;
  tenantName: string;
  tenantLogoUrl: string | null;
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
  tenantName: string;
  tenantLogoUrl: string | null;
  setSession: (session: {
    tenantId: string;
    accessToken: string;
    refreshToken: string;
    isSuperuser?: boolean;
    tenantName?: string;
    tenantLogoUrl?: string | null;
  }) => void;
  updateTokens: (tokens: {
    accessToken: string;
    refreshToken: string;
    tenantName?: string;
    tenantLogoUrl?: string | null;
  }) => void;
  setTenantBranding: (name: string, logoUrl: string | null) => void;
  clearSession: () => void;
  hydrateFromCache: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  tenantId: null,
  accessToken: null,
  refreshToken: null,
  isSuperuser: false,
  isHydrated: false,
  tenantName: "",
  tenantLogoUrl: null,

  setSession: (session) => {
    set({
      ...session,
      isHydrated: true,
      isSuperuser: session.isSuperuser ?? false,
      tenantName: session.tenantName ?? "",
      tenantLogoUrl: session.tenantLogoUrl ?? null,
    });
    persistSession({
      tenantId: session.tenantId,
      refreshToken: session.refreshToken,
      isSuperuser: session.isSuperuser ?? false,
      tenantName: session.tenantName ?? "",
      tenantLogoUrl: session.tenantLogoUrl ?? null,
    });
  },

  updateTokens: (tokens) => {
    set(tokens);
    const state = useAuthStore.getState();
    if (state.tenantId) {
      persistSession({
        tenantId: state.tenantId,
        refreshToken: tokens.refreshToken,
        isSuperuser: state.isSuperuser,
        tenantName: tokens.tenantName ?? state.tenantName,
        tenantLogoUrl: tokens.tenantLogoUrl ?? state.tenantLogoUrl,
      });
    }
  },

  setTenantBranding: (name, logoUrl) => {
    set({ tenantName: name, tenantLogoUrl: logoUrl });
    const state = useAuthStore.getState();
    if (state.tenantId) {
      persistSession({
        tenantId: state.tenantId,
        refreshToken: state.refreshToken ?? "",
        isSuperuser: state.isSuperuser,
        tenantName: name,
        tenantLogoUrl: logoUrl,
      });
    }
  },

  clearSession: () => {
    set({
      tenantId: null,
      accessToken: null,
      refreshToken: null,
      isSuperuser: false,
      tenantName: "",
      tenantLogoUrl: null,
    });
    clearPersistedSession();
  },

  hydrateFromCache: async () => {
    const cached = loadSession();
    if (!cached) {
      set({ isHydrated: true });
      return;
    }

    set({
      tenantId: cached.tenantId,
      refreshToken: cached.refreshToken,
      isSuperuser: cached.isSuperuser ?? false,
      tenantName: cached.tenantName ?? "",
      tenantLogoUrl: cached.tenantLogoUrl ?? null,
    });

    try {
      const tokens = await requestTokenRefresh(cached.refreshToken);
      if (tokens) {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isSuperuser: tokens.isSuperuser,
          tenantName: tokens.tenantName ?? cached.tenantName ?? "",
          tenantLogoUrl: tokens.tenantLogoUrl ?? cached.tenantLogoUrl ?? null,
        });
        persistSession({
          tenantId: cached.tenantId,
          refreshToken: tokens.refreshToken,
          isSuperuser: tokens.isSuperuser,
          tenantName: tokens.tenantName ?? cached.tenantName ?? "",
          tenantLogoUrl: tokens.tenantLogoUrl ?? cached.tenantLogoUrl ?? null,
        });
      } else {
        set({ tenantId: null, refreshToken: null });
        clearPersistedSession();
      }
    } catch {
      // Network failure — keep the stale session
    }

    set({ isHydrated: true });
  },
}));
