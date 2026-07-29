import { apiFetch } from "@/services/api/client";

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

export async function listWarehouseStock(warehouseId: string): Promise<WarehouseStockItem[]> {
  return apiFetch<WarehouseStockItem[]>(`/v1/inventory/warehouses/${warehouseId}/stock`);
}

export async function getWarehouseSummary(warehouseId: string): Promise<WarehouseSummary> {
  return apiFetch<WarehouseSummary>(`/v1/inventory/warehouses/${warehouseId}/summary`);
}
