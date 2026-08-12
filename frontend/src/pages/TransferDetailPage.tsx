import { ArrowLeftIcon, ImageOffIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveProductImageUrl } from "@/features/products/api";
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
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
          <CardTitle>
            Lines
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {transfer.lines.length} product{transfer.lines.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
            {transfer.lines.map((line) => {
              const imageUrl = resolveProductImageUrl(line.image_url);
              return (
                <div
                  key={line.id}
                  className="bg-card flex flex-col overflow-hidden rounded-md border"
                >
                  <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={line.name} className="size-full object-cover" />
                    ) : (
                      <ImageOffIcon className="text-muted-foreground size-6" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 p-2">
                    <p className="truncate text-xs font-medium" title={line.name}>
                      {line.name || "Unknown product"}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs tabular-nums">{line.sku}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        ×{line.quantity}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {transfer.note && (
            <p className="text-muted-foreground mt-2 text-sm">Note: {transfer.note}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
