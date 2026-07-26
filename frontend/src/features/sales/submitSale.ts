import { v7 as uuidv7 } from "uuid";

import { db } from "@/offline/db";
import { submitMutation } from "@/offline/submit";
import { useAuthStore } from "@/store/authStore";

import type { CartLine } from "./cartStore";

const ENTITY_TYPE = "inventory_movement";

export interface SaleResult {
  saleReference: string;
  /** True when at least one line is still queued (offline). */
  queued: boolean;
}

/**
 * Completes a sale by posting one `sale` inventory movement per cart line.
 *
 * There is no backend sales module yet, so the movement ledger *is* the record.
 * Every line of one sale shares a client-generated `reference_id`, which means:
 *  - the lines are already grouped as a single transaction in the ledger, and
 *  - a future `sales` module can adopt these movements retroactively by that
 *    reference instead of the history having to be rebuilt.
 *
 * Each line goes through the normal offline mutation queue, so a sale rung up
 * with no signal is queued and syncs later. The server re-validates stock, so
 * a sale made against a stale offline snapshot can still be rejected as a
 * conflict rather than silently overselling.
 */
export async function submitSale(storeId: string, lines: CartLine[]): Promise<SaleResult> {
  const saleReference = uuidv7();
  const tenantId = useAuthStore.getState().tenantId ?? "";
  const now = new Date().toISOString();
  let queued = false;

  for (const line of lines) {
    const movementId = uuidv7();

    // Optimistic local write so stock-derived views update immediately.
    await db.inventoryMovements.put({
      id: movementId,
      tenantId,
      version: 1,
      productId: line.productId,
      warehouseId: storeId,
      movementType: "sale",
      quantityDelta: -line.quantity,
      referenceId: saleReference,
      note: `Sale ${saleReference.slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    });

    const outcome = await submitMutation({
      entityType: ENTITY_TYPE,
      entityId: movementId,
      operation: "create",
      baseVersion: null,
      payload: {
        id: movementId,
        product_id: line.productId,
        warehouse_id: storeId,
        movement_type: "sale",
        // Negative: a sale removes stock from the store.
        quantity_delta: -line.quantity,
        reference_id: saleReference,
        note: `Sale ${saleReference.slice(0, 8)}`,
      },
    });

    if (outcome === "queued") queued = true;
  }

  return { saleReference, queued };
}
