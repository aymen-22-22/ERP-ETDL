import { formatMoney } from "@/lib/money";

import type { DashboardKpis } from "../types";
import { KpiCard } from "./KpiCard";

interface KpiGridProps {
  kpis: DashboardKpis;
}

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiCard
        label="Total Products"
        value={kpis.totalProducts.toLocaleString()}
        trend="+12 this week"
        trendDirection="up"
      />
      <KpiCard
        label="Total Stock"
        value={kpis.totalStock.toLocaleString()}
        trend="+5.2% vs last week"
        trendDirection="up"
      />
      <KpiCard
        label="Low Stock"
        value={kpis.lowStock.toLocaleString()}
        trend="−6% vs last week"
        trendDirection="down"
      />
      <KpiCard
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
