import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useSellableKits } from "@/features/bom/hooks";
import type { CategoryTreeNode } from "@/features/categories/api";
import { useConfigurableProducts } from "@/features/configurable/hooks";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { getSale, listSales } from "@/features/sales/historyApi";
import { resolveProductImageUrl } from "@/features/products/api";
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
  /** For a kit this is how many can be built from components on hand. */
  available: number;
  minQuantity: number | null;
  isKit: boolean;
  /** A configurable product is picked through the wizard, not added as-is. */
  isConfigurable: boolean;
  imageUrl: string | null;
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
  // Kits have no stock snapshot, so they are absent from the warehouse stock
  // listing entirely — without this the till could not sell a Triangle Fix at
  // all. "Available" for a kit is how many its components can build.
  const { data: kits, isLoading: kitsLoading } = useSellableKits(storeId);
  // Configurable products likewise hold no stock of their own. A tile opens
  // the configuration wizard; buildability is resolved per configuration, so
  // the tile itself only needs to exist (available=1 keeps it enabled).
  const { data: configurable, isLoading: configurableLoading } = useConfigurableProducts();

  const products = useMemo(() => {
    if (!stock || !productsPage) return undefined;
    const byId = new Map(productsPage.data.map((p) => [p.id, p]));

    const stocked = stock.map((item) => {
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
        isKit: false,
        isConfigurable: false,
        imageUrl: resolveProductImageUrl(server?.image_url),
      } satisfies SellableProduct;
    });

    // A kit with no recipe is excluded rather than shown as unsellable: it
    // would deduct nothing, so ringing it up would quietly overstate stock.
    const kitTiles = (kits ?? [])
      .filter((kit) => kit.has_recipe)
      .map(
        (kit) =>
          ({
            productId: kit.product_id,
            name: kit.name,
            sku: kit.sku,
            barcode: null,
            categoryId: kit.category_id,
            unitPriceCents: toCents(kit.price),
            available: kit.buildable,
            minQuantity: null,
            isKit: true,
            isConfigurable: false,
            imageUrl: null,
          }) satisfies SellableProduct,
      );

    // A configurable product without a definition cannot be configured, so it
    // is excluded exactly like a recipe-less kit.
    const configurableTiles = (configurable ?? [])
      .filter((item) => item.has_definition)
      .map(
        (item) =>
          ({
            productId: item.product_id,
            name: item.name,
            sku: item.sku,
            barcode: null,
            categoryId: item.category_id,
            // "From" price: the cheapest length, shown until one is picked.
            unitPriceCents: toCents(item.price_from ?? 0),
            available: 1,
            minQuantity: null,
            isKit: false,
            isConfigurable: true,
            imageUrl: resolveProductImageUrl(item.image_url),
          }) satisfies SellableProduct,
      );

    return [...kitTiles, ...configurableTiles, ...stocked];
  }, [stock, productsPage, kits, configurable]);

  return {
    products,
    isLoading: stockLoading || productsLoading || kitsLoading || configurableLoading,
  };
}

export function collectCategoryIds(node: CategoryTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectCategoryIds)];
}

/** The completed-sales log, newest first. */
export function useSales(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["sales-history", page, pageSize],
    queryFn: () => listSales(page, pageSize),
  });
}

/** One completed sale's deductions. */
export function useSale(referenceId: string | null) {
  return useQuery({
    queryKey: ["sales-history", "detail", referenceId],
    queryFn: () => getSale(referenceId!),
    enabled: !!referenceId,
  });
}
