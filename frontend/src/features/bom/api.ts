import { apiFetch } from "@/services/api/client";

/** "1 paire" deducts 2 pieces; stock is always counted in pieces. */
export type BomUnit = "piece" | "pair";

export interface BomLine {
  component_product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: BomUnit;
  pieces_required: number;
}

export interface BomCostComponent {
  component_product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: BomUnit;
  pieces_required: number;
  unit_cost: string | null;
  line_cost: string | null;
}

export interface BomCost {
  kit_product_id: string;
  selling_price: string;
  components_cost: string;
  margin: string;
  margin_pct: number;
  /** False when a component has no cost price — the margin is then incomplete. */
  cost_is_complete: boolean;
  components_missing_cost: string[];
  components: BomCostComponent[];
}

export interface BomBuildableComponent {
  component_product_id: string;
  name: string;
  pieces_required: number;
  available: number;
  builds: number;
}

export interface BomBuildable {
  buildable: number;
  /** Which component runs out first — the actionable part of the number. */
  limiting_component: string | null;
  reason: string | null;
  components: BomBuildableComponent[];
}

export async function getBom(kitProductId: string): Promise<BomLine[]> {
  return apiFetch<BomLine[]>(`/v1/products/${kitProductId}/bom`);
}

export async function replaceBom(
  kitProductId: string,
  lines: { component_product_id: string; quantity: number; unit: BomUnit }[],
): Promise<BomLine[]> {
  return apiFetch<BomLine[]>(`/v1/products/${kitProductId}/bom`, {
    method: "PUT",
    body: JSON.stringify({ lines }),
  });
}

export async function getBomCost(kitProductId: string): Promise<BomCost> {
  return apiFetch<BomCost>(`/v1/products/${kitProductId}/bom/cost`);
}

export async function getBomBuildable(
  kitProductId: string,
  warehouseId: string,
): Promise<BomBuildable> {
  return apiFetch<BomBuildable>(
    `/v1/products/${kitProductId}/bom/buildable?warehouse_id=${warehouseId}`,
  );
}
