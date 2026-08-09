import { useQuery } from "@tanstack/react-query";

import {
  getProductStock,
  getWarehouseSummary,
  listProductMovements,
  listWarehouseStock,
  listWarehouseSummaries,
} from "./api";

const STOCK_KEY = "warehouse-stock" as const;
const SUMMARY_KEY = "warehouse-summary" as const;
const SUMMARIES_KEY = "warehouse-summaries" as const;
const PRODUCT_STOCK_KEY = "product-stock" as const;
const MOVEMENTS_KEY = "product-movements" as const;

export function useWarehouseSummaries() {
  return useQuery({ queryKey: [SUMMARIES_KEY], queryFn: listWarehouseSummaries });
}

export function useWarehouseStock(warehouseId: string | null) {
  return useQuery({
    queryKey: [STOCK_KEY, warehouseId],
    queryFn: () => listWarehouseStock(warehouseId!),
    enabled: !!warehouseId,
  });
}

export function useWarehouseSummary(warehouseId: string | null) {
  return useQuery({
    queryKey: [SUMMARY_KEY, warehouseId],
    queryFn: () => getWarehouseSummary(warehouseId!),
    enabled: !!warehouseId,
  });
}

export function useProductStock(productId: string, warehouseId?: string) {
  return useQuery({
    queryKey: [PRODUCT_STOCK_KEY, productId, warehouseId],
    queryFn: () => getProductStock(productId, warehouseId!),
    enabled: !!productId && !!warehouseId,
  });
}

export function useMovements(productId: string, warehouseId?: string) {
  return useQuery({
    queryKey: [MOVEMENTS_KEY, productId, warehouseId],
    queryFn: () => listProductMovements(productId, warehouseId),
    enabled: !!productId,
  });
}
