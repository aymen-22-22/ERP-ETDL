import { apiFetch } from "@/services/api/client";

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  password: string;
  tenant_id?: string;
  role?: string;
}

export async function fetchPlatformUsers(): Promise<PlatformUser[]> {
  const res = await apiFetch<{ data: PlatformUser[] }>("/v1/platform/users");
  return res.data;
}

export async function fetchPlatformTenants(): Promise<PlatformTenant[]> {
  const res = await apiFetch<{ data: PlatformTenant[] }>("/v1/platform/tenants");
  return res.data;
}

export async function createPlatformUser(input: CreateUserInput): Promise<PlatformUser> {
  const res = await apiFetch<{ data: PlatformUser }>("/v1/platform/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}
