import { apiFetch } from "@/services/api/client";

export interface VariantScheme {
  category_id: string;
  /** Leading word(s) of every generated name, e.g. "Tube". */
  base_name: string;
  sku_prefix: string;
  /** Axis order — the generated name follows exactly this sequence. */
  attribute_keys: string[];
  /** Suggested values per axis. Suggestions, not constraints. */
  allowed_values: Record<string, string[]>;
  /** The axis grouped as a sub-row (a product's colour), null when every
   * axis is structural. */
  color_key?: string | null;
}

export interface VariantSchemeInput {
  base_name: string;
  sku_prefix: string;
  attribute_keys: string[];
  allowed_values: Record<string, string[]>;
  color_key?: string | null;
}

export interface VariantPreviewItem {
  name: string;
  sku: string;
  attributes: Record<string, string>;
  /** Already in the catalogue — generating will skip it rather than fail. */
  already_exists: boolean;
}

export interface VariantGenerateResult {
  created_count: number;
  skipped_skus: string[];
}

export async function getVariantScheme(categoryId: string): Promise<VariantScheme> {
  return apiFetch<VariantScheme>(`/v1/products/variants/scheme/${categoryId}`);
}

export async function upsertVariantScheme(
  categoryId: string,
  data: VariantSchemeInput,
): Promise<VariantScheme> {
  return apiFetch<VariantScheme>(`/v1/products/variants/scheme/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function previewVariants(
  categoryId: string,
  selectedValues: Record<string, string[]>,
): Promise<VariantPreviewItem[]> {
  return apiFetch<VariantPreviewItem[]>("/v1/products/variants/preview", {
    method: "POST",
    body: JSON.stringify({ category_id: categoryId, selected_values: selectedValues }),
  });
}

export interface VariantGenerateItemInput {
  attributes: Record<string, string>;
  price: string;
  cost_price?: string | null;
  opening_stock?: { warehouse_id: string; quantity: number; min_quantity: number | null }[];
}

export async function generateVariants(
  categoryId: string,
  items: VariantGenerateItemInput[],
  defaultWarehouseId: string | null,
): Promise<VariantGenerateResult> {
  return apiFetch<VariantGenerateResult>("/v1/products/variants/generate", {
    method: "POST",
    body: JSON.stringify({
      category_id: categoryId,
      default_warehouse_id: defaultWarehouseId,
      items,
    }),
  });
}
