import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useCategories } from "@/features/categories/hooks";
import { useWarehouseSummaries, useWarehouseStock } from "@/features/inventory/hooks";
import { resolveProductImageUrl } from "@/features/products/api";
import { useProducts } from "@/features/products/hooks";
import { getDaySales, getSale, type SaleListItem } from "@/features/sales/historyApi";
import { useSales } from "@/features/sales/hooks";
import { useSelectedWarehouseId, useWarehouses } from "@/features/warehouses/hooks";

import type {
  DashboardCategory,
  DashboardData,
  DashboardKpis,
  DashboardProduct,
  DashboardSale,
  DashboardWarehouse,
} from "./types";

/** The local-time half-open range for a YYYY-MM-DD day, as UTC ISO strings. */
function dayRange(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sum of a day's `total_cents`, or null when the backend recorded no prices. */
function dayTotalCents(rows: { total_cents: number | null }[] | undefined): number | null {
  if (!rows || rows.length === 0) return 0;
  const hasTotals = rows.some((row) => row.total_cents !== null);
  if (!hasTotals) return null;
  return rows.reduce((sum, row) => sum + (row.total_cents ?? 0), 0);
}

function computeSalesDeltaPct(today: number | null, yesterday: number | null): number | null {
  if (today === null || yesterday === null || yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/**
 * Fetches everything the dashboard needs in parallel and folds it into one
 * typed shape. Pure composition of existing hooks/queries — no new endpoints.
 */
export function useDashboardData(): { data: DashboardData | undefined; isLoading: boolean } {
  const { data: productsPage, isLoading: productsLoading } = useProducts(1, 200);
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: summaries, isLoading: summariesLoading } = useWarehouseSummaries();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: salesPage, isLoading: salesLoading } = useSales(1, 5);

  const defaultWarehouseId = useSelectedWarehouseId();
  const { data: defaultStock, isLoading: stockLoading } = useWarehouseStock(defaultWarehouseId);

  const today = dayRange(toDateInput(new Date()));
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayRange(toDateInput(yesterdayDate));

  const todayQuery = useQuery({
    queryKey: ["dashboard", "day-sales", today.from, today.to],
    queryFn: () => getDaySales(today.from, today.to),
  });
  const yesterdayQuery = useQuery({
    queryKey: ["dashboard", "day-sales", yesterday.from, yesterday.to],
    queryFn: () => getDaySales(yesterday.from, yesterday.to),
  });

  const saleDetails = useQueries({
    queries: (salesPage?.data ?? []).map((sale: SaleListItem) => ({
      queryKey: ["dashboard", "sale-detail", sale.reference_id],
      queryFn: () => getSale(sale.reference_id),
      enabled: !!salesPage,
    })),
  });

  const data = useMemo<DashboardData | undefined>(() => {
    if (!productsPage || !warehouses || !summaries || !categories || !salesPage) return undefined;

    const products = productsPage.data;
    const productById = new Map(products.map((p) => [p.id, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const summaryById = new Map(summaries.map((s) => [s.warehouse_id, s]));

    const warehousesView: DashboardWarehouse[] = warehouses.map((w) => {
      const summary = summaryById.get(w.id);
      return {
        id: w.id,
        name: w.name,
        warehouseType: w.warehouse_type,
        imageUrl: resolveProductImageUrl(w.image_url),
        productCount: summary?.total_products ?? 0,
        stockValue: null,
        utilization: null,
      };
    });

    const lowStockItems: DashboardProduct[] = (defaultStock ?? [])
      .filter(
        (item) => item.min_quantity !== null && item.available_quantity < (item.min_quantity ?? 0),
      )
      .sort((a, b) => a.available_quantity - b.available_quantity)
      .slice(0, 6)
      .map((item) => {
        const server = productById.get(item.product_id);
        return {
          id: item.product_id,
          name: item.product_name,
          imageUrl: resolveProductImageUrl(server?.image_url),
          categoryName: item.category_id
            ? (categoryById.get(item.category_id)?.name ?? null)
            : null,
          availableQuantity: item.available_quantity,
          minQuantity: item.min_quantity,
        };
      });

    const recentSales: DashboardSale[] = (salesPage.data ?? []).map((sale, index) => {
      const detail = saleDetails[index]?.data;
      const amountCents = detail
        ? detail.lines.reduce((sum, line) => sum + (line.unit_price_cents ?? 0) * line.quantity, 0)
        : null;
      return {
        referenceId: sale.reference_id,
        soldAt: sale.sold_at,
        amountCents,
      };
    });

    const productCountByCategory = new Map<string, number>();
    for (const product of products) {
      if (!product.category_id) continue;
      productCountByCategory.set(
        product.category_id,
        (productCountByCategory.get(product.category_id) ?? 0) + 1,
      );
    }
    const topCategories: DashboardCategory[] = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        imageUrl: resolveProductImageUrl(category.image_url),
        productCount: productCountByCategory.get(category.id) ?? 0,
      }))
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, 8);

    const todayCents = dayTotalCents(todayQuery.data);
    const yesterdayCents = dayTotalCents(yesterdayQuery.data);
    const kpis: DashboardKpis = {
      totalProducts: productsPage.meta.total,
      totalStock: summaries.reduce((sum, s) => sum + s.total_quantity, 0),
      lowStock: summaries.reduce((sum, s) => sum + s.low_stock_count, 0),
      todaySalesCents: todayCents,
      salesDeltaPct: computeSalesDeltaPct(todayCents, yesterdayCents),
    };

    return {
      kpis,
      warehouses: warehousesView,
      lowStockItems,
      recentSales,
      topCategories,
    };
  }, [
    productsPage,
    warehouses,
    summaries,
    categories,
    salesPage,
    defaultStock,
    todayQuery.data,
    yesterdayQuery.data,
    saleDetails,
  ]);

  return {
    data,
    isLoading:
      productsLoading ||
      warehousesLoading ||
      summariesLoading ||
      categoriesLoading ||
      salesLoading ||
      stockLoading ||
      todayQuery.isLoading ||
      yesterdayQuery.isLoading,
  };
}
