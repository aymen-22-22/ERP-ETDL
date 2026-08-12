import { apiFetch, apiFetchPaginated, type PaginationMeta } from "@/services/api/client";

export interface SaleListItem {
  reference_id: string;
  sold_at: string;
  warehouse_id: string;
  /** How many product lines came off the shelf (a kit expands to several). */
  line_count: number;
  /** Total pieces deducted across all lines. */
  total_quantity: number;
}

export interface SaleLine {
  product_id: string;
  name: string;
  sku: string;
  /** Positive count taken off the shelf. */
  quantity: number;
  /** The cart line that caused it — a kit's name, for an exploded component. */
  sold_as: string | null;
  /** What the customer was charged per unit, when one was recorded. */
  unit_price_cents: number | null;
}

export interface SaleDetail {
  reference_id: string;
  sold_at: string;
  warehouse_id: string;
  line_count: number;
  total_quantity: number;
  lines: SaleLine[];
}

export interface SaleDayRow {
  /** A cart line as rung up — a kit/configurable's name, or a product's. */
  name: string;
  /** Units of that cart line sold that day (components folded into the parent). */
  quantity: number;
  unit_price_cents: number | null;
  total_cents: number | null;
}

export async function listSales(
  page = 1,
  pageSize = 25,
  warehouseId?: string,
): Promise<{ data: SaleListItem[]; meta: PaginationMeta }> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  if (warehouseId) q.set("warehouse_id", warehouseId);
  return apiFetchPaginated<SaleListItem>(`/v1/inventory/sales?${q.toString()}`);
}

export async function getSale(referenceId: string): Promise<SaleDetail> {
  return apiFetch<SaleDetail>(`/v1/inventory/sales/${referenceId}`);
}

/**
 * All products sold inside the half-open range `[from, to)` (ISO strings),
 * aggregated per cart line with exploded components folded into their parent.
 * The caller supplies the range so the "day" boundary uses the browser's local
 * timezone.
 */
export async function getDaySales(
  from: string,
  to: string,
  warehouseId?: string,
): Promise<SaleDayRow[]> {
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("to", to);
  if (warehouseId) q.set("warehouse_id", warehouseId);
  return apiFetch<SaleDayRow[]>(`/v1/inventory/sales/day?${q.toString()}`);
}
