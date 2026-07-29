import { v7 as uuidv7 } from "uuid";

import { apiFetch } from "@/services/api/client";

import type { CartLine } from "./cartStore";

export interface SaleResult {
  saleReference: string;
}

export async function submitSale(storeId: string, lines: CartLine[]): Promise<SaleResult> {
  const saleReference = uuidv7();

  for (const line of lines) {
    await apiFetch("/v1/inventory/movements", {
      method: "POST",
      body: JSON.stringify({
        product_id: line.productId,
        warehouse_id: storeId,
        movement_type: "sale",
        quantity_delta: -line.quantity,
        reference_id: saleReference,
        note: `Sale ${saleReference.slice(0, 8)}`,
      }),
    });
  }

  return { saleReference };
}
