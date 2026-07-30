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
  return apiFetch<PlatformUser[]>("/v1/platform/users");
}

export async function fetchPlatformTenants(): Promise<PlatformTenant[]> {
  return apiFetch<PlatformTenant[]>("/v1/platform/tenants");
}

export async function createPlatformUser(input: CreateUserInput): Promise<PlatformUser> {
  return apiFetch<PlatformUser>("/v1/platform/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
