import { ApiError, apiFetch, apiFetchPaginated } from "@/services/api/client";
import { API_BASE_URL } from "@/services/api/config";
import { useAuthStore } from "@/store/authStore";

export interface ProductInput {
  name: string;
  /** Optional: the server derives one from the category when omitted. */
  sku?: string | undefined;
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
  /** Opening count per warehouse, so depot and store are set in one go. */
  openingStock?: OpeningStockInput[] | undefined;
}

export interface OpeningStockInput {
  warehouseId: string;
  quantity: number;
  /** Low-stock alert threshold. null means no alert for this warehouse. */
  minQuantity?: number | null;
}

/** The axis values (usually just the colour) plus price/stock for a new
 * sibling variant of an existing product. */
export interface AddVariantInput {
  attributes: Record<string, string>;
  price: string;
  costPrice?: string | undefined;
  defaultWarehouseId?: string | undefined;
  openingStock?: OpeningStockInput[] | undefined;
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
  image_url: string | null;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

/** Mirrors the backend ProductType enum. */
export type ProductType = "simple" | "variant" | "kit" | "configurable";

export type ProductSort = "name" | "price" | "sku";
export type ProductSortDir = "asc" | "desc";

export interface ProductListParams {
  search?: string;
  status?: string;
  categoryId?: string | undefined;
  sort?: ProductSort;
  sortDir?: ProductSortDir;
  /**
   * Defaults to true server-side. The product list page passes false so a
   * dozen generated tubes don't bury everything else; the POS and the recipe
   * editor need them and leave it alone.
   */
  includeVariants?: boolean | undefined;
  /**
   * Defaults to true server-side. The product list page passes false so
   * configurable products only show on their own /configurable screen and in
   * the POS; the POS and recipe editor need them and leave it alone.
   */
  includeConfigurable?: boolean | undefined;
}

export interface VariantGroup {
  category_id: string;
  category_name: string;
  variant_count: number;
  min_price: string;
  max_price: string;
  /** Primary photo of the first variant in the family, if it has one. */
  image_url: string | null;
}

export async function listVariantGroups(): Promise<VariantGroup[]> {
  return apiFetch<VariantGroup[]>("/v1/products/variant-groups");
}

export interface GroupedVariantStock {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export interface GroupedVariantColor {
  product_id: string;
  sku: string;
  attributes: Record<string, string>;
  price: string;
  cost_price: string | null;
  stock: GroupedVariantStock[];
  total_quantity: number;
}

export interface GroupedVariant {
  name: string;
  colors: GroupedVariantColor[];
  total_quantity: number;
}

/** One product's colour family as the detail page shows it. */
export interface ProductFamilyRow {
  product_id: string;
  sku: string;
  attributes: Record<string, string>;
  color_label: string;
  price: string;
  cost_price: string | null;
  stock: GroupedVariantStock[];
  total_quantity: number;
}

export interface ProductFamily {
  name: string;
  category_id: string;
  has_scheme: boolean;
  color_key: string | null;
  rows: ProductFamilyRow[];
  total_quantity: number;
}

/** One product as a colour family: name plus Couleur / Dépôt / Store / Total. */
export async function getProductFamily(productId: string): Promise<ProductFamily> {
  return apiFetch<ProductFamily>(`/v1/products/${productId}/family`);
}

/** One category's variants grouped by structural name, colours nested. */
export async function listGroupedVariants(categoryId: string): Promise<GroupedVariant[]> {
  return apiFetch<GroupedVariant[]>(`/v1/products/variant-groups/${categoryId}`);
}

function toPayload(input: ProductInput): Record<string, unknown> {
  return {
    name: input.name,
    // Blank means "generate one" on create and "leave it alone" on update.
    // Sent as undefined rather than "" so it is omitted from the JSON — the
    // server rejects an empty SKU, it does not treat it as absent.
    sku: input.sku?.trim() || undefined,
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
  if (params.includeVariants === false) q.set("include_variants", "false");
  if (params.includeConfigurable === false) q.set("include_configurable", "false");
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
    body: JSON.stringify({
      ...toPayload(input),
      product_type: input.productType ?? "simple",
      opening_stock: (input.openingStock ?? []).map((entry) => ({
        warehouse_id: entry.warehouseId,
        quantity: entry.quantity,
        min_quantity: entry.minQuantity ?? null,
      })),
    }),
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

/**
 * `image_url` from the API is mount-relative (e.g. "/media/products/...") —
 * it must resolve against the API host, not the frontend's own origin, the
 * same way every other request in this file does via `API_BASE_URL`.
 */
export function resolveProductImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url}`;
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const res = await apiFetch<ProductImage[]>(`/v1/products/${productId}/images`);
  return res;
}

export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/products/${productId}/images`, {
    method: "POST",
    headers,
    body: form,
  });
  const body = (await resp.json()) as { data?: ProductImage; error?: { code?: string } };
  if (!resp.ok) throw new ApiError(resp.status, body.error?.code ?? "unknown_error");
  if (!body.data) throw new ApiError(resp.status, "unknown_error");
  return body.data;
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  await apiFetch<void>(`/v1/products/${productId}/images/${imageId}`, { method: "DELETE" });
}

export async function setPrimaryProductImage(
  productId: string,
  imageId: string,
): Promise<ProductImage> {
  return apiFetch<ProductImage>(`/v1/products/${productId}/images/${imageId}/primary`, {
    method: "POST",
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

export async function addProductVariant(
  productId: string,
  input: AddVariantInput,
): Promise<Product> {
  return apiFetch<Product>(`/v1/products/${productId}/variants`, {
    method: "POST",
    body: JSON.stringify({
      attributes: input.attributes,
      price: input.price,
      cost_price: input.costPrice || null,
      default_warehouse_id: input.defaultWarehouseId || null,
      opening_stock: (input.openingStock ?? []).map((entry) => ({
        warehouse_id: entry.warehouseId,
        quantity: entry.quantity,
        min_quantity: entry.minQuantity ?? null,
      })),
    }),
  });
}

export async function downloadImportTemplate(): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/products/import/template`, { headers });
  return resp.blob();
}

export async function exportProductsExcel(): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE_URL}/v1/products/export`, { headers });
  if (!resp.ok) throw new ApiError(resp.status, "unknown_error");
  return resp.blob();
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportSummary {
  created: Product[];
  updated: Product[];
  errors: ImportRowError[];
}

interface ImportEnvelope {
  data?: ImportSummary;
  error?: { code?: string };
}

export async function importProductsExcel(file: File): Promise<ImportSummary> {
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
  if (!body.data) throw new ApiError(resp.status, "unknown_error");
  return body.data;
}
