import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CameraIcon, PaletteIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import type { ProductFamily, ProductFamilyRow } from "@/features/products/api";
import { ProductImageManager } from "@/features/products/ProductImageManager";
import { submitStockAdjustment } from "@/features/products/inventoryMutations";
import type { VariantScheme } from "@/features/variants/api";
import { useSelectedWarehouseId, useWarehouses } from "@/features/warehouses/hooks";
import { WarehouseSelector } from "@/features/warehouses/WarehouseSelector";

function colorLabel(row: ProductFamilyRow): string {
  return row.color_label || "Base";
}

interface ProductFamilyViewProps {
  family: ProductFamily;
  scheme: VariantScheme | undefined;
  onAddColor: () => void;
}

/**
 * One product as a colour family: "Support Cristal 28/19" is really several
 * Product rows (one per colour, each with its own stock). This is the card
 * view — the name, a Couleur / Dépôt / Store / Total table, and a way to add
 * another colour — so the shop reads and manages one product, not seven.
 * Every colour row can also be stocked in place: pick a warehouse and enter a
 * quantity change on the row, no need to open each colour's own page.
 */
export function ProductFamilyView({ family, scheme, onAddColor }: ProductFamilyViewProps) {
  const queryClient = useQueryClient();
  const { data: warehouses } = useWarehouses();
  const defaultWarehouseId = useSelectedWarehouseId();

  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [photoProduct, setPhotoProduct] = useState<ProductFamilyRow | null>(null);
  const targetWarehouseId = warehouseId ?? defaultWarehouseId;

  const adjustMutation = useMutation({
    mutationFn: (vars: { productId: string; warehouseId: string; quantityDelta: number }) =>
      submitStockAdjustment(vars.productId, vars.warehouseId, vars.quantityDelta, undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-family"] });
      void queryClient.invalidateQueries({ queryKey: ["grouped-variants"] });
      toast({ title: "Stock adjusted" });
    },
    onError: () => toast({ title: "Adjustment failed", variant: "destructive" }),
  });

  const addStock = (row: ProductFamilyRow) => {
    const parsed = Number(deltas[row.product_id]);
    if (!Number.isInteger(parsed) || parsed === 0 || !targetWarehouseId) return;
    adjustMutation.mutate(
      { productId: row.product_id, warehouseId: targetWarehouseId, quantityDelta: parsed },
      {
        onSuccess: () => setDeltas((current) => ({ ...current, [row.product_id]: "" })),
      },
    );
  };

  // Every active warehouse is a column even when no colour has stock there, so
  // a family always reads as Dépôt / Store / Total — never a warehouse quietly
  // missing from the table until a movement happens to touch it.
  const warehouseColumns: { id: string; name: string }[] = [];
  for (const w of (warehouses ?? []).filter((w) => w.is_active)) {
    warehouseColumns.push({ id: w.id, name: w.name });
  }
  for (const row of family.rows) {
    for (const entry of row.stock) {
      if (!warehouseColumns.some((column) => column.id === entry.warehouse_id)) {
        warehouseColumns.push({ id: entry.warehouse_id, name: entry.warehouse_name });
      }
    }
  }

  const columnTotals = new Map<string, number>();
  for (const row of family.rows) {
    for (const entry of row.stock) {
      columnTotals.set(
        entry.warehouse_id,
        (columnTotals.get(entry.warehouse_id) ?? 0) + entry.quantity,
      );
    }
  }

  const quantity = (row: ProductFamilyRow, warehouseId: string) =>
    row.stock.find((entry) => entry.warehouse_id === warehouseId)?.quantity ?? 0;

  const first = family.rows[0];
  const prices = family.rows.map((row) => Number(row.price));
  const uniform = first && Math.min(...prices) === Math.max(...prices);
  const priceText = !first
    ? "—"
    : uniform
      ? first.price
      : `${Math.min(...prices)}–${Math.max(...prices)}`;
  const costText = family.rows.find((row) => row.cost_price !== null)?.cost_price;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/products" className="text-muted-foreground hover:text-foreground">
              <ArrowLeftIcon className="size-4" />
            </Link>
            <h1 className="text-2xl font-semibold">{family.name}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {family.rows.length} colour{family.rows.length === 1 ? "" : "s"} · Prix: {priceText} DA
            {costText ? ` (achat: ${costText} DA)` : ""}
          </p>
        </div>
        {scheme?.color_key && (
          <Button variant="outline" onClick={onAddColor}>
            <PaletteIcon className="mr-1 size-4" />
            Add colour
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
        <span className="text-sm">Add stock to</span>
        <WarehouseSelector value={targetWarehouseId} onChange={setWarehouseId} className="h-9" />
        <span className="text-muted-foreground text-xs">
          then enter a quantity change (+/-) on a colour row.
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Couleur</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              {warehouseColumns.map((column) => (
                <th key={column.id} className="px-4 py-2 text-right font-medium">
                  {column.name}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-right font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {family.rows.map((row) => (
              <tr key={row.product_id} className="border-t">
                <td className="px-4 py-2 font-medium">{colorLabel(row)}</td>
                <td className="text-muted-foreground px-4 py-2 text-xs">{row.sku}</td>
                {warehouseColumns.map((column) => (
                  <td key={column.id} className="px-4 py-2 text-right tabular-nums">
                    {quantity(row, column.id)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-medium tabular-nums">
                  {row.total_quantity}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="numeric"
                        placeholder="qty"
                        aria-label={`Stock change for ${colorLabel(row)}`}
                        className="h-8 w-16 text-right tabular-nums"
                        value={deltas[row.product_id] ?? ""}
                        onChange={(event) =>
                          setDeltas((current) => ({
                            ...current,
                            [row.product_id]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          addStock(row);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        disabled={adjustMutation.isPending || !targetWarehouseId}
                        onClick={() => addStock(row)}
                        title="Add the quantity to the selected warehouse"
                      >
                        <PlusIcon className="size-4" />
                      </Button>
                    </div>
                    <Link
                      to={`/products/${row.product_id}?view=single`}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Details
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => setPhotoProduct(row)}
                      title={`Add or change the photo of ${colorLabel(row)}`}
                    >
                      <CameraIcon className="size-4" />
                      Photo
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 border-t">
              <td className="px-4 py-2 font-semibold">TOTAL</td>
              <td />
              {warehouseColumns.map((column) => (
                <td key={column.id} className="px-4 py-2 text-right font-semibold tabular-nums">
                  {columnTotals.get(column.id) ?? 0}
                </td>
              ))}
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {family.total_quantity}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-sm">
        This is one product with {family.rows.length} colour row
        {family.rows.length === 1 ? "" : "s"}; each colour keeps its own stock, so counts never mix.
      </p>

      <Dialog open={photoProduct !== null} onOpenChange={(open) => !open && setPhotoProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Photo — {photoProduct ? colorLabel(photoProduct) : ""}</DialogTitle>
          </DialogHeader>
          {photoProduct && <ProductImageManager productId={photoProduct.product_id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
