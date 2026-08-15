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
    <div className="bg-card flex min-h-20 flex-col justify-between gap-1.5 rounded-xl border p-2 shadow-sm">
      <p className="text-muted-foreground truncate text-[10px] font-medium sm:text-[11px]">
        {label}
      </p>
      <p className="text-base leading-5 font-semibold tracking-tight break-words tabular-nums sm:text-lg sm:leading-6">
        {value}
      </p>
      <p
        className={cn(
          "flex min-w-0 items-center gap-1 text-[10px] leading-3 font-medium sm:text-[11px]",
          trendDirection === "up" && "text-green-600",
          trendDirection === "down" && "text-red-500",
          trendDirection === "neutral" && "text-muted-foreground",
        )}
      >
        {trendDirection === "up" && (
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        )}
        {trendDirection === "down" && (
          <ArrowDownRightIcon className="size-3 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{trend}</span>
      </p>
    </div>
  );
}
