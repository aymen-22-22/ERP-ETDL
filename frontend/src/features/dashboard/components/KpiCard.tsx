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
    <div className="bg-card flex min-h-24 flex-col justify-between rounded-xl border p-2.5 shadow-sm sm:min-h-28 sm:rounded-2xl sm:p-3">
      <p className="text-muted-foreground truncate text-[11px] font-medium sm:text-xs">{label}</p>
      <p className="text-base leading-5 font-semibold tracking-tight break-words tabular-nums sm:text-xl sm:leading-6">
        {value}
      </p>
      <p
        className={cn(
          "flex min-w-0 items-center gap-1 text-[11px] font-medium sm:text-xs",
          trendDirection === "up" && "text-green-600",
          trendDirection === "down" && "text-red-500",
          trendDirection === "neutral" && "text-muted-foreground",
        )}
      >
        {trendDirection === "up" && <ArrowUpRightIcon className="size-3.5 shrink-0" />}
        {trendDirection === "down" && <ArrowDownRightIcon className="size-3.5 shrink-0" />}
        <span className="truncate">{trend}</span>
      </p>
    </div>
  );
}
