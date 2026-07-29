import { useMemo } from "react";

import type { CategoryTreeNode } from "@/features/categories/api";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { useProducts } from "@/features/products/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import type { Warehouse } from "@/features/warehouses/api";
import { toCents } from "@/lib/money";

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

export function useSaleWarehouses(): Warehouse[] {
  const { data } = useWarehouses();
  return useMemo(
    () => (data ?? []).filter((w) => w.is_active && w.allow_sales && w.warehouse_type === "store"),
    [data],
  );
}

export function useSellableProducts(storeId: string | null): {
  products: SellableProduct[] | undefined;
  isLoading: boolean;
} {
  const { data: stock, isLoading: stockLoading } = useWarehouseStock(storeId);
  const { data: productsPage, isLoading: productsLoading } = useProducts(1, 200);

  const products = useMemo(() => {
    if (!stock || !productsPage) return undefined;
    const byId = new Map(productsPage.data.map((p) => [p.id, p]));

    return stock.map((item) => {
      const server = byId.get(item.product_id);
      return {
        productId: item.product_id,
        name: item.product_name || server?.name || "Unknown product",
        sku: item.sku || server?.sku || "",
        barcode: server?.barcode ?? null,
        categoryId: item.category_id,
        unitPriceCents: toCents(server?.price ?? 0),
        available: item.available_quantity,
        minQuantity: item.min_quantity,
      } satisfies SellableProduct;
    });
  }, [stock, productsPage]);

  return { products, isLoading: stockLoading || productsLoading };
}

export function collectCategoryIds(node: CategoryTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectCategoryIds)];
}
