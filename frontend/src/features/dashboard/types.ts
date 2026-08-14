import type { WarehouseType } from "@/features/warehouses/api";

export interface DashboardWarehouse {
  id: string;
  name: string;
  warehouseType: WarehouseType;
  imageUrl: string | null;
  productCount: number;
  stockValue: number | null;
  utilization: number | null;
}

export interface DashboardProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  availableQuantity: number;
  minQuantity: number | null;
}

export interface DashboardSale {
  referenceId: string;
  soldAt: string;
  amountCents: number | null;
}

export interface DashboardCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
}

export interface DashboardKpis {
  totalProducts: number;
  totalStock: number;
  lowStock: number;
  todaySalesCents: number | null;
  /** Percentage change in today's sales vs yesterday, null when not computable. */
  salesDeltaPct: number | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  warehouses: DashboardWarehouse[];
  lowStockItems: DashboardProduct[];
  recentSales: DashboardSale[];
  topCategories: DashboardCategory[];
}
