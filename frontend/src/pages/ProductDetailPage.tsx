import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { TableLoader } from "@/components/TableLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotFoundPage } from "@/pages/NotFoundPage";
import {
  useAdjustStockMutation,
  useDeleteProductMutation,
  useMovements,
  useProduct,
  useStock,
} from "@/features/products/hooks";
import { useSelectedWarehouseId } from "@/features/warehouses/hooks";
import { WarehouseSelector } from "@/features/warehouses/WarehouseSelector";

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const navigate = useNavigate();

  const { product, isLoading } = useProduct(productId);
  const defaultWarehouseId = useSelectedWarehouseId();
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string | null>(null);
  const warehouseId = adjustWarehouseId ?? defaultWarehouseId;

  const totalStock = useStock(productId);
  const warehouseStock = useStock(productId, warehouseId ?? undefined);
  const movements = useMovements(productId, warehouseId ?? undefined);
  const adjustMutation = useAdjustStockMutation(productId);
  const deleteMutation = useDeleteProductMutation();

  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  if (isLoading) return <PageLoader />;
  if (!product) return <NotFoundPage />;

  const submitAdjustment = () => {
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0 || !warehouseId) return;
    adjustMutation.mutate(
      { warehouseId, quantityDelta: parsed, note: note || undefined },
      {
        onSuccess: () => {
          setDelta("");
          setNote("");
        },
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-muted-foreground text-sm">
            SKU {product.sku} · {product.price}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              to={`/transfers/new?product=${productId}&warehouse=${warehouseId ?? ""}`}
            >
              <ArrowRightIcon className="mr-1 size-4" />
              Transfer
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void navigate(`/products/${productId}/edit`)}>
            Edit
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() =>
              deleteMutation.mutate(
                { productId, baseVersion: product.version },
                { onSuccess: () => void navigate("/products") },
              )
            }
          >
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current stock</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">{totalStock ?? 0}</p>
          <p className="text-muted-foreground text-sm">
            {warehouseStock ?? 0} at selected warehouse
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjust stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouse">Warehouse</Label>
              <WarehouseSelector value={warehouseId} onChange={setAdjustWarehouseId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delta">Quantity change (+/-)</Label>
              <Input
                id="delta"
                inputMode="numeric"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                placeholder="e.g. 10 or -3"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <Button onClick={submitAdjustment} disabled={adjustMutation.isPending || !warehouseId}>
              {adjustMutation.isPending ? "Saving…" : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Movement history</h2>
        {movements === undefined && <TableLoader rows={3} columns={3} />}
        {movements && movements.length === 0 && (
          <p className="text-muted-foreground text-sm">No movements recorded yet.</p>
        )}
        {movements && movements.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Change</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-t">
                    <td className="px-4 py-2 capitalize">{movement.movementType}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {movement.quantityDelta > 0 ? "+" : ""}
                      {movement.quantityDelta}
                    </td>
                    <td className="text-muted-foreground px-4 py-2">{movement.note ?? "—"}</td>
                    <td className="text-muted-foreground px-4 py-2">
                      {new Date(movement.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
