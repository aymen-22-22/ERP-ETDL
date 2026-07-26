import { useAuthStore } from "@/store/authStore";

import { API_BASE_URL } from "./config";
import { requestTokenRefresh } from "./refresh";

interface ApiEnvelope<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

async function rawFetch(path: string, options: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers: buildHeaders() });
}

async function tryRefresh(): Promise<boolean> {
  const { refreshToken, updateTokens, clearSession } = useAuthStore.getState();
  if (!refreshToken) return false;

  try {
    const tokens = await requestTokenRefresh(refreshToken);
    if (!tokens) {
      // The refresh token itself is invalid/expired — clear session.
      clearSession();
      return false;
    }
    updateTokens(tokens);
    return true;
  } catch {
    // Network error (offline) — keep the stale session so cached Dexie reads
    // still work. The next online request will retry the refresh.
    return false;
  }
}

async function requestJson(path: string, options: RequestInit): Promise<unknown> {
  let response = await rawFetch(path, options);

  if (response.status === 401 && useAuthStore.getState().refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await rawFetch(path, options);
    }
  }

  if (response.status === 204) {
    if (!response.ok) throw new ApiError(response.status, "unknown_error");
    return undefined;
  }

  const body = (await response.json()) as ApiErrorBody & Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(response.status, body.error?.code ?? "unknown_error");
  }
  return body;
}

/**
 * Every feature module's TanStack Query hooks call through this instead of
 * `fetch` directly — attaches the access token, retries once after a silent
 * refresh on 401, and unwraps the single-resource `ResponseEnvelope`
 * contract (Milestone 4's API conventions).
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await requestJson(path, options);
  if (body === undefined) return undefined as T;
  return (body as ApiEnvelope<T>).data;
}

/** Variant for list endpoints that return `{ data: [...], meta: {...} }`. */
export async function apiFetchPaginated<T>(
  path: string,
  options: RequestInit = {},
): Promise<PaginatedEnvelope<T>> {
  const body = await requestJson(path, options);
  return body as PaginatedEnvelope<T>;
}
