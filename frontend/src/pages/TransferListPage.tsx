import { AlertTriangleIcon, ArrowLeftRightIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TransferStatus } from "@/features/transfers/api";
import { useTransfers } from "@/features/transfers/hooks";
import { useWarehouseSummary } from "@/features/inventory/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 rounded-md border px-3 py-2 text-sm";

const STATUS_VARIANT: Record<TransferStatus, "default" | "secondary" | "destructive" | "outline"> =
  {
    draft: "outline",
    pending: "secondary",
    approved: "secondary",
    completed: "default",
    cancelled: "destructive",
  };

type TimeRange = "today" | "week" | "month" | "all" | "custom";

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
  { value: "custom", label: "By date" },
];

function WarehouseStockCard({ id, name }: { id: string; name: string }) {
  const { data: summary, isLoading } = useWarehouseSummary(id);
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-sm font-medium">{name}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {isLoading ? "…" : (summary?.total_products ?? 0)}
      </span>
      <span className="text-muted-foreground text-xs">products in stock</span>
    </div>
  );
}

export function TransferListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TransferStatus | "">("");
  const [range, setRange] = useState<TimeRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { data: transfers, isLoading, isError, refetch } = useTransfers(status || undefined);
  const { data: warehouses } = useWarehouses();

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    if (!transfers) return transfers;
    if (range === "all") return transfers;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);

    let from: Date;
    let to: Date;
    if (range === "today") {
      from = startOfToday;
      to = endOfToday;
    } else if (range === "week") {
      from = new Date(startOfToday);
      from.setDate(from.getDate() - 6);
      to = endOfToday;
    } else if (range === "month") {
      from = new Date(startOfToday);
      from.setDate(from.getDate() - 29);
      to = endOfToday;
    } else {
      if (!customFrom && !customTo) return transfers;
      from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0);
      to = customTo ? new Date(`${customTo}T23:59:59.999`) : new Date(8640000000000000);
    }

    const fromTs = from.getTime();
    const toTs = to.getTime();
    return transfers.filter((t) => {
      const created = new Date(t.created_at).getTime();
      return created >= fromTs && created <= toTs;
    });
  }, [transfers, range, customFrom, customTo]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stock Transfers</h1>
        <Button asChild>
          <Link to="/transfers/new">
            <PlusIcon />
            New transfer
          </Link>
        </Button>
      </div>

      {warehouses && warehouses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {warehouses.map((w) => (
            <WarehouseStockCard key={w.id} id={w.id} name={w.name} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted flex items-center gap-0.5 rounded-md p-0.5">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={range === option.value ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={cn(selectClass, "w-auto")}
              aria-label="From date"
            />
            <span className="text-muted-foreground text-sm">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={cn(selectClass, "w-auto")}
              aria-label="To date"
            />
          </div>
        )}
        <select
          className={`${selectClass} max-w-xs`}
          value={status}
          onChange={(e) => setStatus(e.target.value as TransferStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading && <TableLoader rows={4} columns={4} />}

      {!isLoading && isError && (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load transfers"
          description="Something went wrong fetching your transfers. Check your connection and try again."
          action={{ label: "Retry", onClick: () => void refetch() }}
        />
      )}

      {!isLoading && !isError && filtered?.length === 0 && (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title="No transfers"
          description="Move stock between warehouses by creating a transfer."
          action={{ label: "New transfer", onClick: () => void navigate("/transfers/new") }}
        />
      )}

      {!isLoading && filtered !== undefined && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Route</th>
                <th className="px-4 py-2 font-medium">Lines</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-accent/50 border-t">
                  <td className="px-4 py-2">
                    <Link
                      to={`/transfers/${t.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {warehouseName(t.source_warehouse_id)} → {warehouseName(t.dest_warehouse_id)}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-4 py-2">{t.lines.length}</td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[t.status]} className="capitalize">
                      {t.status}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-2">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
