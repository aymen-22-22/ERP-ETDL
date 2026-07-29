import { apiFetch, apiFetchPaginated } from "@/services/api/client";

export type WarehouseType = "depot" | "store" | "transit" | "return";

export interface Warehouse {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  warehouse_type: WarehouseType;
  is_default: boolean;
  is_active: boolean;
  allow_sales: boolean;
  allow_purchases: boolean;
  allow_transfers: boolean;
  allow_negative_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface WarehouseInput {
  name: string;
  code?: string | undefined;
  warehouseType: WarehouseType;
  isActive: boolean;
  allowSales: boolean;
  allowPurchases: boolean;
  allowTransfers: boolean;
  allowNegativeStock: boolean;
}

function toPayload(input: WarehouseInput): Record<string, unknown> {
  return {
    name: input.name,
    code: input.code || null,
    warehouse_type: input.warehouseType,
    is_active: input.isActive,
    allow_sales: input.allowSales,
    allow_purchases: input.allowPurchases,
    allow_transfers: input.allowTransfers,
    allow_negative_stock: input.allowNegativeStock,
  };
}

export async function listWarehouses(): Promise<Warehouse[]> {
  const result = await apiFetchPaginated<Warehouse>("/v1/warehouses?page_size=200");
  return result.data;
}

export async function getWarehouse(id: string): Promise<Warehouse> {
  return apiFetch<Warehouse>(`/v1/warehouses/${id}`);
}

export async function createWarehouse(input: WarehouseInput): Promise<Warehouse> {
  return apiFetch<Warehouse>("/v1/warehouses", {
    method: "POST",
    body: JSON.stringify(toPayload(input)),
  });
}

export async function updateWarehouse(id: string, input: WarehouseInput): Promise<Warehouse> {
  return apiFetch<Warehouse>(`/v1/warehouses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toPayload(input)),
  });
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiFetch<void>(`/v1/warehouses/${id}`, { method: "DELETE" });
}

export async function setDefaultWarehouse(id: string): Promise<Warehouse> {
  return apiFetch<Warehouse>(`/v1/warehouses/${id}/set-default`, { method: "POST" });
}
