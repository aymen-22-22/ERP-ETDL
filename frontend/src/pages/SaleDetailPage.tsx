import { HistoryIcon, PackageXIcon } from "lucide-react";
import { useParams } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { useSale } from "@/features/sales/hooks";

/** A single completed sale: exactly which products came off the shelf. */
export function SaleDetailPage() {
  const { referenceId = "" } = useParams();
  const { data, isLoading, isError } = useSale(referenceId);

  const total = data?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  return (
    <PageShell size="content">
      <PageHeader
        title="Sale details"
        back="/sales/history"
        {...(data ? { description: `Sold ${new Date(data.sold_at).toLocaleString()}` } : {})}
      />

      {isLoading && <TableLoader rows={4} columns={3} />}

      {!isLoading && isError && (
        <EmptyState
          icon={HistoryIcon}
          title="Couldn't load this sale"
          description="The sale may no longer exist, or something went wrong fetching it."
        />
      )}

      {!isLoading && !isError && data && data.lines.length === 0 && (
        <EmptyState
          icon={PackageXIcon}
          title="No deductions recorded"
          description="This sale completed without taking anything off the shelf."
        />
      )}

      {!isLoading && !isError && data && data.lines.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-muted-foreground text-sm">Total off the shelf</span>
            <span className="text-sm font-semibold tabular-nums">{total} pce</span>
          </div>

          {data.lines.map((line) => (
            <div key={line.product_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <p className="text-muted-foreground text-xs">
                  {line.sku}
                  {line.sold_as ? ` · sold as ${line.sold_as}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                -{line.quantity}
              </span>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
