import { apiFetch } from "@/services/api/client";

export async function submitStockAdjustment(
  productId: string,
  warehouseId: string,
  quantityDelta: number,
  note: string | undefined,
): Promise<void> {
  await apiFetch("/v1/inventory/movements", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type: "adjustment",
      quantity_delta: quantityDelta,
      note: note ?? null,
    }),
  });
}
