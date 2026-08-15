import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type TrendDirection = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  trend: string;
  trendDirection: TrendDirection;
  className?: string;
}

export function KpiCard({ label, value, trend, trendDirection, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-card flex min-h-24 flex-col justify-between gap-1.5 rounded-xl border p-2.5 shadow-sm",
        className,
      )}
    >
      <p className="text-muted-foreground truncate text-[11px] font-medium">{label}</p>
      <p className="text-lg leading-6 font-semibold tracking-tight break-words tabular-nums">
        {value}
      </p>
      <p
        className={cn(
          "flex min-w-0 items-center gap-1 text-[11px] leading-3 font-medium",
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
