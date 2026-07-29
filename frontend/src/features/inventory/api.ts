import { apiFetch, apiFetchPaginated } from "@/services/api/client";

export interface WarehouseStockItem {
  product_id: string;
  product_name: string;
  sku: string;
  category_id: string | null;
  quantity_on_hand: number;
  available_quantity: number;
  reserved_quantity: number;
  min_quantity: number | null;
  max_quantity: number | null;
  updated_at: string;
}

export interface WarehouseSummary {
  total_products: number;
  total_quantity: number;
  low_stock_count: number;
}

export interface StockSnapshot {
  product_id: string;
  warehouse_id: string;
  quantity_on_hand: number;
  available_quantity: number;
  reserved_quantity: number;
  updated_at: string;
}

export interface Movement {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: string;
  quantity_delta: number;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export async function listWarehouseStock(warehouseId: string): Promise<WarehouseStockItem[]> {
  return apiFetch<WarehouseStockItem[]>(`/v1/inventory/warehouses/${warehouseId}/stock`);
}

export async function getWarehouseSummary(warehouseId: string): Promise<WarehouseSummary> {
  return apiFetch<WarehouseSummary>(`/v1/inventory/warehouses/${warehouseId}/summary`);
}

export async function getProductStock(productId: string, warehouseId: string): Promise<StockSnapshot> {
  return apiFetch<StockSnapshot>(`/v1/inventory/products/${productId}/stock?warehouse_id=${warehouseId}`);
}

export async function listProductMovements(
  productId: string,
  warehouseId?: string,
  page = 1,
  pageSize = 50,
): Promise<{ data: Movement[]; meta: { page: number; page_size: number; total: number; pages: number } }> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  if (warehouseId) q.set("warehouse_id", warehouseId);
  return apiFetchPaginated<Movement>(`/v1/inventory/products/${productId}/movements?${q.toString()}`);
}
