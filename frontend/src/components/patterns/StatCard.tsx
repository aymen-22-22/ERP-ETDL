import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import type { ReactNode } from "react";

import { StatusDot } from "@/components/patterns/StatusBadge";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: string;
  /** Draws attention with a dot beside the label — the number stays black. */
  tone?: Tone;
  className?: string;
}

/** A single KPI tile. Compose with `StatGrid`. */
function StatCard({ label, value, icon: Icon, hint, tone = "default", className }: StatCardProps) {
  return (
    <div className={cn("bg-card rounded-md border p-4", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 shrink-0" />}
        <span className="label-caps truncate">{label}</span>
        {tone !== "default" && <StatusDot tone={tone} className="ml-auto size-2" />}
      </div>
      {/* Deliberately not tinted: the figure is always black so the numbers
          read as data, not decoration. Emphasis comes from the dot above. */}
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

/** Two columns on a phone, four once there's room. */
function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)} {...props} />
  );
}

export { StatCard, StatGrid };
