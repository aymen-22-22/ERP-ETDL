import { apiFetch } from "@/services/api/client";
import { API_BASE_URL } from "@/services/api/config";
import { useAuthStore } from "@/store/authStore";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export async function getCurrentTenant(): Promise<Tenant> {
  return apiFetch<Tenant>("/v1/tenants/me");
}

export async function updateTenantName(name: string): Promise<Tenant> {
  const result = await apiFetch<Tenant>("/v1/tenants/me", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  useAuthStore.getState().setTenantBranding(result.name, result.logo_url);
  return result;
}

export async function uploadTenantLogo(file: File): Promise<Tenant> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/tenants/me/logo`, {
    method: "POST",
    headers,
    body: form,
  });
  const body = (await resp.json()) as { data?: Tenant; error?: { code?: string } };
  if (!resp.ok) throw new Error(body.error?.code ?? "upload_failed");
  if (!body.data) throw new Error("upload_failed");
  useAuthStore.getState().setTenantBranding(body.data.name, body.data.logo_url);
  return body.data;
}

export async function deleteTenantLogo(): Promise<Tenant> {
  const result = await apiFetch<Tenant>("/v1/tenants/me/logo", {
    method: "DELETE",
  });
  useAuthStore.getState().setTenantBranding(result.name, result.logo_url);
  return result;
}
