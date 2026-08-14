import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type TrendDirection = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  trend: string;
  trendDirection: TrendDirection;
}

export function KpiCard({ label, value, trend, trendDirection }: KpiCardProps) {
  return (
    <div className="bg-card flex h-28 flex-col justify-between rounded-2xl border p-3 shadow-sm">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-2xl leading-8 font-semibold tracking-tight tabular-nums">{value}</p>
      <p
        className={cn(
          "flex items-center gap-1 text-xs font-medium",
          trendDirection === "up" && "text-green-600",
          trendDirection === "down" && "text-red-500",
          trendDirection === "neutral" && "text-muted-foreground",
        )}
      >
        {trendDirection === "up" && <ArrowUpRightIcon className="size-3.5" />}
        {trendDirection === "down" && <ArrowDownRightIcon className="size-3.5" />}
        {trend}
      </p>
    </div>
  );
}
