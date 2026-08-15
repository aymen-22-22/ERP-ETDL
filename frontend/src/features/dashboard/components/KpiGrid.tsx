import { formatMoney } from "@/lib/money";

import type { DashboardKpis } from "../types";
import { KpiCard } from "./KpiCard";

interface KpiGridProps {
  kpis: DashboardKpis;
}

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <div className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:pb-0 lg:mx-auto lg:max-w-3xl lg:grid-cols-4">
      <KpiCard
        className="w-44 shrink-0 snap-start sm:w-auto"
        label="Total Products"
        value={kpis.totalProducts.toLocaleString()}
        trend="+12 this week"
        trendDirection="up"
      />
      <KpiCard
        className="w-44 shrink-0 snap-start sm:w-auto"
        label="Total Stock"
        value={kpis.totalStock.toLocaleString()}
        trend="+5.2% vs last week"
        trendDirection="up"
      />
      <KpiCard
        className="w-44 shrink-0 snap-start sm:w-auto"
        label="Low Stock"
        value={kpis.lowStock.toLocaleString()}
        trend="−6% vs last week"
        trendDirection="down"
      />
      <KpiCard
        className="w-44 shrink-0 snap-start sm:w-auto"
        label="Today Sales"
        value={kpis.todaySalesCents !== null ? `${formatMoney(kpis.todaySalesCents)} DZD` : "—"}
        trend={
          kpis.salesDeltaPct !== null
            ? `${kpis.salesDeltaPct > 0 ? "+" : ""}${kpis.salesDeltaPct}% vs yesterday`
            : "vs yesterday"
        }
        trendDirection={
          kpis.salesDeltaPct === null ? "neutral" : kpis.salesDeltaPct >= 0 ? "up" : "down"
        }
      />
    </div>
  );
}
