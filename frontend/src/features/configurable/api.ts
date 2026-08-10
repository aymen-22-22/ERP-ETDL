import { apiFetch } from "@/services/api/client";

export type BomUnit = "piece" | "pair";

export interface ConfigurableRecipeLine {
  label: string;
  category_id: string | null;
  category_name: string | null;
  attributes: Record<string, string>;
  quantity: number;
  /** Length -> quantity, e.g. {"4m": 3} for the third support at 4m. */
  quantity_by_length: Record<string, number>;
  unit: BomUnit;
  pieces_required: number;
}

export interface ConfigurablePrice {
  length: string;
  price: string;
}

export interface CatalogueAxisGroup {
  label: string;
  values: string[];
}

export interface ConfigurableDefinition {
  product_id: string;
  name: string;
  sku: string;
  color_key: string;
  length_key: string;
  /** Axis -> allowed values, in the order the till should offer them. */
  options: Record<string, string[]>;
  /** Axes whose options come from the catalogue (motif, tube). */
  catalogue_axes: string[];
  /** Two-step catalogue axes (motif): type -> models. */
  catalogue_groups: Record<string, CatalogueAxisGroup[]>;
  prices: ConfigurablePrice[];
  recipe: ConfigurableRecipeLine[];
}

/** One configurable product as the till/admin list needs it. */
export interface ConfigurableListItem {
  product_id: string;
  name: string;
  sku: string;
  category_id: string | null;
  /** Lowest length price — the "from 4600" on a till tile. */
  price_from: string | null;
  has_definition: boolean;
  /** Primary photo of the product, if one was uploaded. */
  image_url: string | null;
}

export interface ConfigurableRecipeLineInput {
  label: string;
  category_id: string | null;
  attributes: Record<string, string>;
  quantity: number;
  /** Length -> quantity, e.g. {"4m": 3}. */
  quantity_by_length?: Record<string, number>;
  unit: BomUnit;
}

export interface ConfigurablePriceInput {
  length: string;
  price: string;
}

export interface ConfigurableDefinitionInput {
  color_key: string;
  length_key: string;
  options: Record<string, string[]>;
  prices: ConfigurablePriceInput[];
  recipe: ConfigurableRecipeLineInput[];
}

export interface ConfigurableResolvedLine {
  label: string;
  component_product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: BomUnit;
  pieces_required: number;
  available: number;
  builds: number;
}

export interface ConfigurableResolution {
  product_id: string;
  name: string;
  display_name: string;
  price: string;
  configuration: Record<string, string>;
  lines: ConfigurableResolvedLine[];
  buildable: number;
}

export async function listConfigurableProducts(): Promise<ConfigurableListItem[]> {
  return apiFetch<ConfigurableListItem[]>("/v1/products/configurable");
}

export async function getConfigurableDefinition(
  productId: string,
): Promise<ConfigurableDefinition> {
  return apiFetch<ConfigurableDefinition>(`/v1/products/${productId}/configurable`);
}

export async function saveConfigurableDefinition(
  productId: string,
  input: ConfigurableDefinitionInput,
): Promise<ConfigurableDefinition> {
  return apiFetch<ConfigurableDefinition>(`/v1/products/${productId}/configurable`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteConfigurableDefinition(productId: string): Promise<void> {
  await apiFetch<void>(`/v1/products/${productId}/configurable`, { method: "DELETE" });
}

export async function resolveConfigurable(
  productId: string,
  configuration: Record<string, string>,
  warehouseId?: string | null,
): Promise<ConfigurableResolution> {
  const q = warehouseId ? `?warehouse_id=${warehouseId}` : "";
  return apiFetch<ConfigurableResolution>(`/v1/products/${productId}/configurable/resolve${q}`, {
    method: "POST",
    body: JSON.stringify({ configuration }),
  });
}
