import { AlertTriangleIcon, BoxesIcon, PackageIcon } from "lucide-react";

import type { WarehouseSummary } from "@/features/inventory/api";
import { cn } from "@/lib/utils";

interface WarehouseStatsProps {
  summary?: WarehouseSummary | undefined;
}

/** Three-key summary strip for a warehouse: total products, total quantity and
 * low-stock count. Low stock turns orange so a supply gap is visible at a
 * glance. */
export function WarehouseStats({ summary }: WarehouseStatsProps) {
  const lowStockCount = summary?.low_stock_count ?? 0;

  const items = [
    { icon: PackageIcon, label: "Products", value: summary?.total_products, warn: false },
    { icon: BoxesIcon, label: "Quantity", value: summary?.total_quantity, warn: false },
    {
      icon: AlertTriangleIcon,
      label: "Low stock",
      value: lowStockCount,
      warn: lowStockCount > 0,
    },
  ];

  return (
    <div className="bg-card grid grid-cols-3 overflow-hidden rounded-2xl border shadow-sm">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col items-center gap-1 py-4",
            index > 0 && "border-border border-l",
          )}
        >
          <item.icon className={cn("size-5", item.warn ? "text-warning" : "text-primary")} />
          <span className="text-lg font-bold tabular-nums">
            {item.value?.toLocaleString() ?? "…"}
          </span>
          <span className="text-muted-foreground text-[11px]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
