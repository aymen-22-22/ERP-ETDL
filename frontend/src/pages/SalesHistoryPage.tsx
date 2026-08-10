import { HistoryIcon, ReceiptTextIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { useSales } from "@/features/sales/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";

/**
 * Completed-sales log: every sale that took stock off the shelf, newest
 * first. Each row is a group of SALE movements sharing a `reference_id` —
 * tapping one shows exactly which products were deducted and how much.
 */
export function SalesHistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useSales(page);
  const { data: warehouses } = useWarehouses();
  const warehouseNames = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  const sales = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageShell size="content">
      <PageHeader
        title="Sales history"
        description="Every sale that took stock off the shelf."
        back="/sales"
      />

      {isLoading && <TableLoader rows={5} columns={3} />}

      {!isLoading && isError && (
        <EmptyState
          icon={HistoryIcon}
          title="Couldn't load the sales log"
          description="Something went wrong fetching your sales. Check your connection and try again."
        />
      )}

      {!isLoading && !isError && sales.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          title="No sales recorded yet"
          description="When you complete a sale on the till, it shows up here with the products taken off the shelf."
        />
      )}

      {!isLoading && !isError && sales.length > 0 && (
        <div className="flex flex-col gap-2">
          {sales.map((sale) => (
            <button
              key={sale.reference_id}
              type="button"
              onClick={() => void navigate(`/sales/history/${sale.reference_id}`)}
              className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
                <ReceiptTextIcon className="text-muted-foreground size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {warehouseNames.get(sale.warehouse_id) ?? "Warehouse"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(sale.sold_at).toLocaleString()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{sale.total_quantity} pce</p>
                <p className="text-muted-foreground text-xs">
                  {sale.line_count} line{sale.line_count === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          ))}

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {meta.page} of {meta.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
