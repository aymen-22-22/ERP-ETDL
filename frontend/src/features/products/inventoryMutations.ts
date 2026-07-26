import { v7 as uuidv7 } from "uuid";

import { db } from "@/offline/db";
import { type SubmitOutcome, submitMutation } from "@/offline/submit";
import { useAuthStore } from "@/store/authStore";

const ENTITY_TYPE = "inventory_movement";

export async function submitStockAdjustment(
  productId: string,
  warehouseId: string,
  quantityDelta: number,
  note: string | undefined,
): Promise<SubmitOutcome> {
  const id = uuidv7();
  const now = new Date().toISOString();

  await db.inventoryMovements.put({
    id,
    tenantId: useAuthStore.getState().tenantId ?? "",
    version: 1,
    productId,
    warehouseId,
    movementType: "adjustment",
    quantityDelta,
    referenceId: null,
    note: note ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return submitMutation({
    entityType: ENTITY_TYPE,
    entityId: id,
    operation: "create",
    baseVersion: null,
    payload: {
      id,
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type: "adjustment",
      quantity_delta: quantityDelta,
      note: note ?? null,
    },
  });
}
