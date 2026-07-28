import { ArrowLeftIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransfer } from "@/features/transfers/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function TransferDetailPage() {
  const { transferId = "" } = useParams();
  const navigate = useNavigate();
  const { data: transfer, isLoading } = useTransfer(transferId);
  const { data: warehouses } = useWarehouses();

  if (isLoading) return <PageLoader />;
  if (!transfer) return <NotFoundPage />;

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate("/transfers")}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">
          {warehouseName(transfer.source_warehouse_id)} →{" "}
          {warehouseName(transfer.dest_warehouse_id)}
        </h1>
        <Badge className="capitalize">{transfer.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {transfer.lines.map((line) => (
            <div key={line.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground truncate">{line.product_id}</span>
              <span className="tabular-nums">{line.quantity}</span>
            </div>
          ))}
          {transfer.note && (
            <p className="text-muted-foreground mt-2 text-sm">Note: {transfer.note}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
