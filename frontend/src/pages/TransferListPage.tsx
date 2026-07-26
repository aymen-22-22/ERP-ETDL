import { ArrowLeftRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TransferStatus } from "@/features/transfers/api";
import { useTransfers } from "@/features/transfers/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 rounded-md border px-3 py-2 text-sm";

const STATUS_VARIANT: Record<TransferStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending: "secondary",
  approved: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export function TransferListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TransferStatus | "">("");
  const { data: transfers, isLoading } = useTransfers(status || undefined);
  const { data: warehouses } = useWarehouses();

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;

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

      {isLoading && <TableLoader rows={4} columns={4} />}

      {!isLoading && transfers?.length === 0 && (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title="No transfers"
          description="Move stock between warehouses by creating a transfer."
          action={{ label: "New transfer", onClick: () => void navigate("/transfers/new") }}
        />
      )}

      {!isLoading && transfers !== undefined && transfers.length > 0 && (
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
              {transfers.map((t) => (
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
