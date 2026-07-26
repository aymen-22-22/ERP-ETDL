import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import type { CategoryTreeNode } from "@/features/categories/api";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import type { Warehouse } from "@/features/warehouses/api";
import { toCents } from "@/lib/money";
import { db } from "@/offline/db";
import { useAuthStore } from "@/store/authStore";

export interface SellableProduct {
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  unitPriceCents: number;
  available: number;
  minQuantity: number | null;
}

/**
 * Warehouses a sale can actually be rung up against: a Store that permits
 * sales. Depots and transit locations are deliberately excluded — selling out
 * of them would put stock in a state the rest of the system doesn't expect.
 */
export function useSaleWarehouses(): Warehouse[] {
  const { data } = useWarehouses();
  return useMemo(
    () => (data ?? []).filter((w) => w.is_active && w.allow_sales && w.warehouse_type === "store"),
    [data],
  );
}

/**
 * The sellable catalogue for one store.
 *
 * Stock comes from the server (it's the authority, and `min_quantity` exists
 * nowhere else), price and barcode come from the local Dexie product cache.
 * They're joined on product id — so a product with no stock row in this
 * warehouse simply doesn't appear, which is the correct behaviour for a till.
 */
export function useSellableProducts(storeId: string | null): {
  products: SellableProduct[] | undefined;
  isLoading: boolean;
} {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { data: stock, isLoading } = useWarehouseStock(storeId);

  const localProducts = useLiveQuery(async () => {
    if (!tenantId) return [];
    return db.products.where("tenantId").equals(tenantId).toArray();
  }, [tenantId]);

  const products = useMemo(() => {
    if (!stock || !localProducts) return undefined;
    const byId = new Map(localProducts.map((p) => [p.id, p]));

    return stock.map((item) => {
      const local = byId.get(item.product_id);
      return {
        productId: item.product_id,
        // Prefer the server's name/sku — the local row may be a stale cache.
        name: item.product_name || local?.name || "Unknown product",
        sku: item.sku || local?.sku || "",
        barcode: local?.barcode ?? null,
        categoryId: item.category_id,
        unitPriceCents: toCents(local?.price ?? 0),
        available: item.available_quantity,
        minQuantity: item.min_quantity,
      } satisfies SellableProduct;
    });
  }, [stock, localProducts]);

  return { products, isLoading: isLoading || localProducts === undefined };
}

/** Every category id in a subtree, so filtering by a parent includes children. */
export function collectCategoryIds(node: CategoryTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectCategoryIds)];
}
