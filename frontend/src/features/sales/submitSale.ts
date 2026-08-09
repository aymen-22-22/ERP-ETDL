import { apiFetch } from "@/services/api/client";

import type { CartLine } from "./cartStore";

export interface SaleDeduction {
  product_id: string;
  name: string;
  quantity: number;
  /** The cart line this came off — the kit's name, for an exploded component. */
  sold_as: string;
}

export interface SaleResult {
  reference_id: string;
  movements_created: number;
  deductions: SaleDeduction[];
}

/**
 * Records the whole basket in one request.
 *
 * This used to loop over the cart posting one movement per line: a round trip
 * each, and not atomic — a failure partway left the earlier lines already
 * deducted for a sale that never completed. The server now takes the basket as
 * a unit and expands any kit into its components there, so the till never
 * needs to know what a recipe is.
 */
export async function submitSale(storeId: string, lines: CartLine[]): Promise<SaleResult> {
  return apiFetch<SaleResult>("/v1/inventory/sales", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: storeId,
      lines: lines.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
        // Present on configurable lines only; the server re-resolves the
        // configuration into components itself rather than trusting a price.
        configuration: line.configuration,
      })),
    }),
  });
}
