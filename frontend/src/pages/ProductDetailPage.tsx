import { ArrowRightIcon, LayersIcon, PaletteIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { TableLoader } from "@/components/TableLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductStock, useMovements } from "@/features/inventory/hooks";
import { AddVariantDialog } from "@/features/products/AddVariantDialog";
import { ProductImageManager } from "@/features/products/ProductImageManager";
import {
  useAdjustStockMutation,
  useDeleteProductMutation,
  useProduct,
  useProductFamily,
} from "@/features/products/hooks";
import { ProductFamilyView } from "@/features/products/ProductFamilyView";
import { useVariantScheme } from "@/features/variants/hooks";
import { useSelectedWarehouseId } from "@/features/warehouses/hooks";
import { WarehouseSelector } from "@/features/warehouses/WarehouseSelector";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const forceSingle = searchParams.get("view") === "single";
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);

  const { data: product, isLoading } = useProduct(productId);
  const { data: family } = useProductFamily(productId);
  const { data: scheme } = useVariantScheme(product?.category_id ?? null);

  const defaultWarehouseId = useSelectedWarehouseId();
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string | null>(null);
  const warehouseId = adjustWarehouseId ?? defaultWarehouseId;

  const { data: stockSnapshot } = useProductStock(productId, warehouseId ?? "");
  const { data: movementsPage } = useMovements(productId, warehouseId ?? undefined);
  const adjustMutation = useAdjustStockMutation(productId);
  const deleteMutation = useDeleteProductMutation();

  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  if (isLoading) return <PageLoader />;
  if (!product) return <NotFoundPage />;

  // A product whose category has a naming scheme (or that already has colour
  // rows) is shown as a colour family by default; ?view=single opens one
  // colour's own page for movements and editing.
  const showFamily =
    !forceSingle &&
    !!family &&
    (family.has_scheme || family.rows.length > 1) &&
    family.rows.length > 0;

  if (showFamily && family) {
    return (
      <>
        <ProductFamilyView
          family={family}
          scheme={scheme}
          onAddColor={() => setVariantDialogOpen(true)}
        />
        {scheme?.color_key && variantDialogOpen && (
          <AddVariantDialog
            product={product}
            scheme={scheme}
            open={variantDialogOpen}
            onOpenChange={setVariantDialogOpen}
          />
        )}
      </>
    );
  }

  const isFamilyMember = !!family && family.rows.length > 0;

  const backToFamily = () =>
    setSearchParams((previous) => {
      previous.delete("view");
      return previous;
    });

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

  const movements = movementsPage?.data;

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
          {isFamilyMember && (
            <Button variant="outline" onClick={backToFamily}>
              <LayersIcon className="mr-1 size-4" />
              {family.rows.length} colour{family.rows.length === 1 ? "" : "s"}
            </Button>
          )}
          {scheme?.color_key && (
            <Button variant="outline" onClick={() => setVariantDialogOpen(true)}>
              <PaletteIcon className="mr-1 size-4" />
              Add colour
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/transfers/new?product=${productId}&warehouse=${warehouseId ?? ""}`}>
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
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductImageManager productId={product.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current stock</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">
            {stockSnapshot?.available_quantity ?? 0}
          </p>
          <p className="text-muted-foreground text-sm">
            On hand: {stockSnapshot?.quantity_on_hand ?? 0}
            {stockSnapshot && stockSnapshot.reserved_quantity > 0
              ? ` · Reserved: ${stockSnapshot.reserved_quantity}`
              : ""}
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
                    <td className="px-4 py-2 capitalize">{movement.movement_type}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {movement.quantity_delta > 0 ? "+" : ""}
                      {movement.quantity_delta}
                    </td>
                    <td className="text-muted-foreground px-4 py-2">{movement.note ?? "—"}</td>
                    <td className="text-muted-foreground px-4 py-2">
                      {new Date(movement.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {scheme?.color_key && variantDialogOpen && (
        <AddVariantDialog
          product={product}
          scheme={scheme}
          open={variantDialogOpen}
          onOpenChange={setVariantDialogOpen}
        />
      )}
    </div>
  );
}
