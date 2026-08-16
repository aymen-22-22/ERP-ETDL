import { ApiError, apiFetch, apiFetchPaginated } from "@/services/api/client";
import { API_BASE_URL } from "@/services/api/config";
import { useAuthStore } from "@/store/authStore";

export interface Category {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  image_url?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

export interface CategoryInput {
  name: string;
  description?: string | undefined;
  parentId?: string | undefined;
  sortOrder?: number | undefined;
}

export async function listCategories(): Promise<Category[]> {
  const result = await apiFetchPaginated<Category>("/v1/categories?page_size=200");
  return result.data;
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  return apiFetch<CategoryTreeNode[]>("/v1/categories/tree");
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return apiFetch<Category>("/v1/categories", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description || null,
      parent_id: input.parentId || null,
      sort_order: input.sortOrder ?? 0,
    }),
  });
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return apiFetch<Category>(`/v1/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.parentId !== undefined && { parent_id: input.parentId || null }),
      ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
    }),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  return apiFetch<void>(`/v1/categories/${id}`, { method: "DELETE" });
}

/** Upload (or replace) the category's photo. The new file replaces whatever
 * image was stored before, so a category always shows one picture. */
export async function uploadCategoryImage(categoryId: string, file: File): Promise<Category> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/categories/${categoryId}/image`, {
    method: "POST",
    headers,
    body: form,
  });
  const body = (await resp.json()) as {
    data?: Category;
    error?: { code?: string; message?: string };
  };
  if (!resp.ok)
    throw new ApiError(resp.status, body.error?.code ?? "unknown_error", body.error?.message);
  if (!body.data) throw new ApiError(resp.status, "unknown_error");
  return body.data;
}

/** Remove the category's photo, falling back to the placeholder tile. */
export async function deleteCategoryImage(categoryId: string): Promise<Category> {
  return apiFetch<Category>(`/v1/categories/${categoryId}/image`, { method: "DELETE" });
}
