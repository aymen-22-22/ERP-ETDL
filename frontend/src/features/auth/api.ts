import { apiFetch } from "@/services/api/client";
import { useAuthStore } from "@/store/authStore";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  tenant_id: string;
  token_type: string;
}

interface UserPublic {
  id: string;
  email: string;
  full_name: string;
}

interface RegisterResponse {
  user: UserPublic;
  tenant_id: string;
  tenant_slug: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  tenantName: string;
}

export interface RegisterResult {
  user: UserPublic;
  tenantId: string;
  tenantSlug: string;
}

export async function login(input: LoginInput): Promise<void> {
  const tokens = await apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  useAuthStore.getState().setSession({
    tenantId: tokens.tenant_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const result = await apiFetch<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      tenant_name: input.tenantName,
    }),
  });
  return { user: result.user, tenantId: result.tenant_id, tenantSlug: result.tenant_slug };
}

export async function logout(): Promise<void> {
  const { refreshToken, clearSession } = useAuthStore.getState();
  if (refreshToken) {
    // Best-effort server-side invalidation; don't block on network failure.
    await apiFetch("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined);
  }
  clearSession();
}
