import { CalendarDaysIcon, HistoryIcon, ReceiptTextIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDaySales, useSales } from "@/features/sales/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import { formatMoney } from "@/lib/money";

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The local-time half-open range for a YYYY-MM-DD day, as UTC ISO strings. */
function dayRange(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Completed-sales log: every sale that took stock off the shelf, newest
 * first. Two views share the page:
 *
 * - "By sale": one row per completed sale; tapping it shows exactly which
 *   products were deducted and how much.
 * - "By day": everything sold on one day, aggregated per cart line with the
 *   exploded components of kits and configurable products folded back into
 *   their parent — `2x Triangle 28/19 2m`, not a wall of component rows.
 */
export function SalesHistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [view, setView] = useState("sales");
  const [day, setDay] = useState(() => toDateInput(new Date()));
  const { data, isLoading, isError } = useSales(page);
  const range = dayRange(day);
  const {
    data: dayRows,
    isLoading: dayLoading,
    isError: dayError,
  } = useDaySales(range.from, range.to);
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

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="sales">By sale</TabsTrigger>
          <TabsTrigger value="day">By day</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
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
        </TabsContent>

        <TabsContent value="day">
          <div className="flex flex-col gap-3">
            <div className="flex w-fit items-center gap-2">
              <CalendarDaysIcon className="text-muted-foreground size-4" />
              <Input
                type="date"
                value={day}
                max={toDateInput(new Date())}
                onChange={(event) => setDay(event.target.value)}
                className="w-fit"
                aria-label="Day"
              />
            </div>

            {dayLoading && <TableLoader rows={5} columns={3} />}

            {!dayLoading && dayError && (
              <EmptyState
                icon={HistoryIcon}
                title="Couldn't load that day"
                description="Something went wrong fetching the day's sales. Check your connection and try again."
              />
            )}

            {!dayLoading && !dayError && dayRows && dayRows.length === 0 && (
              <EmptyState
                icon={CalendarDaysIcon}
                title="Nothing sold that day"
                description="Pick another day, or complete a sale on the till and it will show up here."
              />
            )}

            {!dayLoading && !dayError && dayRows && dayRows.length > 0 && (
              <div className="flex flex-col gap-2">
                {dayRows.map((row) => (
                  <div key={row.name} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.unit_price_cents !== null
                          ? `${formatMoney(row.unit_price_cents)} / pce`
                          : "Price not recorded"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        ×{row.quantity}{" "}
                        <span className="text-muted-foreground text-xs font-normal">pce</span>
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {row.total_cents !== null ? formatMoney(row.total_cents) : "—"}
                      </p>
                    </div>
                  </div>
                ))}

                {(() => {
                  const hasTotals = dayRows.some((row) => row.total_cents !== null);
                  const total = dayRows.reduce((sum, row) => sum + (row.total_cents ?? 0), 0);
                  return (
                    <div className="flex items-center justify-between border-t pt-3">
                      <p className="text-sm font-medium">Total</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {hasTotals ? formatMoney(total) : "—"}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
