import { useQuery } from "@tanstack/react-query";

import { getWarehouseSummary, listWarehouseStock } from "./api";

const STOCK_KEY = "warehouse-stock" as const;
const SUMMARY_KEY = "warehouse-summary" as const;

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
