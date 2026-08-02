import { ApiError, apiFetch, apiFetchPaginated } from "@/services/api/client";
import { API_BASE_URL } from "@/services/api/config";
import { useAuthStore } from "@/store/authStore";

export interface ProductInput {
  name: string;
  sku: string;
  barcode?: string | undefined;
  description?: string | undefined;
  price: string;
  costPrice?: string | undefined;
  status?: string | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId?: string | undefined;
  defaultWarehouseId?: string | undefined;
  initialStock?: string | undefined;
  productType?: ProductType | undefined;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  price: string;
  cost_price: string | null;
  status: string;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  default_warehouse_id: string | null;
  product_type: ProductType;
  attributes: Record<string, string>;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Mirrors the backend ProductType enum. */
export type ProductType = "simple" | "variant" | "kit";

export type ProductSort = "name" | "price" | "sku";
export type ProductSortDir = "asc" | "desc";

export interface ProductListParams {
  search?: string;
  status?: string;
  categoryId?: string | undefined;
  sort?: ProductSort;
  sortDir?: ProductSortDir;
}

function toPayload(input: ProductInput): Record<string, unknown> {
  return {
    name: input.name,
    sku: input.sku,
    barcode: input.barcode || null,
    description: input.description || null,
    price: input.price,
    cost_price: input.costPrice || null,
    status: input.status ?? "active",
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    unit_id: input.unitId || null,
    default_warehouse_id: input.defaultWarehouseId || null,
    initial_stock: input.initialStock ? Number(input.initialStock) : null,
  };
}

export async function listProducts(
  page = 1,
  pageSize = 25,
  params: ProductListParams = {},
): Promise<{
  data: Product[];
  meta: { page: number; page_size: number; total: number; pages: number };
}> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  if (params.categoryId) q.set("category_id", params.categoryId);
  if (params.sort) q.set("sort", params.sort);
  if (params.sortDir) q.set("sort_dir", params.sortDir);
  return apiFetchPaginated<Product>(`/v1/products?${q.toString()}`);
}

export async function getProduct(id: string): Promise<Product> {
  return apiFetch<Product>(`/v1/products/${id}`);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return apiFetch<Product>("/v1/products", {
    method: "POST",
    // product_type is create-only: the backend's update schema has no such
    // field, because changing a product with stock into a kit would make that
    // stock meaningless. Pick the wrong type and you duplicate as the right
    // one instead.
    body: JSON.stringify({ ...toPayload(input), product_type: input.productType ?? "simple" }),
  });
}

export async function updateProduct(
  id: string,
  version: number,
  input: ProductInput,
): Promise<Product> {
  return apiFetch<Product>(`/v1/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...toPayload(input), version }),
  });
}

export async function deleteProduct(id: string, version: number): Promise<void> {
  await apiFetch<void>(`/v1/products/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ version }),
  });
}

export async function bulkDeleteProducts(productIds: string[]): Promise<number> {
  const result = await apiFetch<{ deleted_count: number }>("/v1/products/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ product_ids: productIds }),
  });
  return result.deleted_count;
}

export async function duplicateProduct(productId: string): Promise<Product> {
  return apiFetch<Product>(`/v1/products/${productId}/duplicate`, { method: "POST" });
}

export async function downloadImportTemplate(): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/products/import/template`, { headers });
  return resp.blob();
}

interface ImportEnvelope {
  data?: Product[];
  error?: { code?: string };
}

export async function importProductsExcel(file: File): Promise<Product[]> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/products/import`, {
    method: "POST",
    headers,
    body: form,
  });
  const body = (await resp.json()) as ImportEnvelope;
  if (!resp.ok) throw new ApiError(resp.status, body.error?.code ?? "unknown_error");
  return body.data ?? [];
}
