import type { DashboardSale } from "../types";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { SectionHeader } from "./SectionHeader";

interface RecentSalesSectionProps {
  sales: DashboardSale[];
}

/** A stable short reference from the UUID tail: "INV-…3f2a" */
function shortReference(referenceId: string): string {
  const tail = referenceId.slice(-4);
  return `INV-…${tail}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentSalesSection({ sales }: RecentSalesSectionProps) {
  if (sales.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Recent Sales" seeAllTo="/sales/history" />
        <DashboardEmptyState
          title="No sales yet"
          description="Complete a sale on the till and it shows up here."
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Recent Sales" seeAllTo="/sales/history" />
      <div className="bg-card flex flex-col divide-y divide-border rounded-2xl border shadow-sm">
        {sales.map((sale) => (
          <div key={sale.referenceId} className="flex h-14 items-center gap-3 px-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{shortReference(sale.referenceId)}</p>
              <p className="text-muted-foreground text-xs">{timeLabel(sale.soldAt)}</p>
            </div>
            <p className="text-sm font-semibold tabular-nums">
              {sale.amountCents !== null ? `${(sale.amountCents / 100).toLocaleString()} DZD` : "—"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
