import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CameraIcon,
  ImageOffIcon,
  PaletteIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";

import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import type { ProductFamily, ProductFamilyRow } from "@/features/products/api";
import { resolveProductImageUrl } from "@/features/products/api";
import {
  useDeleteFamilyImageMutation,
  useRenameFamilyMutation,
  useUpdateProductFieldsMutation,
  useUploadFamilyImageMutation,
} from "@/features/products/hooks";
import { submitStockAdjustment } from "@/features/products/inventoryMutations";
import type { VariantScheme } from "@/features/variants/api";
import { useSelectedWarehouseId, useWarehouses } from "@/features/warehouses/hooks";
import { WarehouseSelector } from "@/features/warehouses/WarehouseSelector";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function colorLabel(row: ProductFamilyRow): string {
  return row.color_label || "Base";
}

interface ProductFamilyViewProps {
  productId: string;
  family: ProductFamily;
  scheme: VariantScheme | undefined;
  onAddColor: () => void;
}

/**
 * One product as a colour family: "Support Cristal 28/19" is really several
 * Product rows (one per colour, each with its own stock). This is the one
 * page that manages the whole product — the name, ONE photo that every
 * colour card shares, a Couleur / Dépôt / Store / Total table, each colour's
 * price, and in-place stock adjustment for any warehouse. No need to open
 * each colour's own page just to tweak a number.
 */
export function ProductFamilyView({
  productId,
  family,
  scheme,
  onAddColor,
}: ProductFamilyViewProps) {
  const queryClient = useQueryClient();
  const { data: warehouses } = useWarehouses();
  const defaultWarehouseId = useSelectedWarehouseId();

  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState(family.name);
  const [photoOpen, setPhotoOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetWarehouseId = warehouseId ?? defaultWarehouseId;

  const renameMutation = useRenameFamilyMutation();
  const updateFieldsMutation = useUpdateProductFieldsMutation();
  const uploadPhotoMutation = useUploadFamilyImageMutation(productId);
  const deletePhotoMutation = useDeleteFamilyImageMutation(productId);

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

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === family.name) return;
    renameMutation.mutate({ productId, name: trimmed });
  };

  const priceValue = (row: ProductFamilyRow) => prices[row.product_id] ?? row.price;

  const applyPrice = (row: ProductFamilyRow) => {
    const value = priceValue(row).trim();
    const parsed = Number(value);
    if (!value || !Number.isFinite(parsed) || parsed <= 0) {
      setPrices((current) => ({ ...current, [row.product_id]: row.price }));
      return;
    }
    if (value === row.price) return;
    updateFieldsMutation.mutate({ productId: row.product_id, fields: { price: value } });
  };

  const handlePhotoFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Unsupported file type", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image exceeds the 5 MB limit", variant: "destructive" });
      return;
    }
    uploadPhotoMutation.mutate(file);
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
  const pricesOf = family.rows.map((row) => Number(row.price));
  const uniform = first && Math.min(...pricesOf) === Math.max(...pricesOf);
  const priceText = !first
    ? "—"
    : uniform
      ? first.price
      : `${Math.min(...pricesOf)}–${Math.max(...pricesOf)}`;
  const costText = family.rows.find((row) => row.cost_price !== null)?.cost_price;
  const familyImage = resolveProductImageUrl(family.image_url);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="bg-muted flex size-20 items-center justify-center overflow-hidden rounded-md border">
            {familyImage ? (
              <ProductImage
                src={familyImage}
                alt={family.name}
                className="size-full object-cover"
              />
            ) : (
              <ImageOffIcon className="text-muted-foreground size-6" />
            )}
          </div>
          <Button
            size="icon"
            className="absolute -right-2 -bottom-2 size-7"
            aria-label="Change product photo"
            title="Change product photo"
            onClick={() => setPhotoOpen(true)}
          >
            <CameraIcon className="size-3.5" />
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products" className="text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeftIcon className="size-4" />
            </Link>
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                saveName();
              }}
              aria-label="Product name"
              className="h-8 text-lg font-semibold"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={renameMutation.isPending || nameDraft.trim() === family.name}
              onClick={saveName}
              title="Rename the product and all its colours"
            >
              <SaveIcon className="size-4" />
              <span className="hidden sm:inline">Rename</span>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {family.rows.length} colour{family.rows.length === 1 ? "" : "s"} · Prix: {priceText} DA
            {costText ? ` (achat: ${costText} DA)` : ""}
          </p>
        </div>
        {scheme?.color_key && (
          <Button variant="outline" className="shrink-0" onClick={onAddColor}>
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
              <th className="px-4 py-2 text-right font-medium">Prix</th>
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
                  <Input
                    inputMode="decimal"
                    aria-label={`Price for ${colorLabel(row)}`}
                    className="h-8 w-24 text-right tabular-nums"
                    value={priceValue(row)}
                    onChange={(event) =>
                      setPrices((current) => ({
                        ...current,
                        [row.product_id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      applyPrice(row);
                    }}
                    onBlur={() => applyPrice(row)}
                  />
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
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-sm">
        This is one product with {family.rows.length} colour row
        {family.rows.length === 1 ? "" : "s"}; each colour keeps its own stock, so counts never mix.
        Every colour shares the same photo and product name.
      </p>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Product photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden rounded-md border">
              {familyImage ? (
                <ProductImage
                  src={familyImage}
                  alt={family.name}
                  className="size-full object-cover"
                />
              ) : (
                <ImageOffIcon className="text-muted-foreground size-8" />
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              One photo for the whole product — every colour card and the products list show the
              same picture.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <UploadIcon className="mr-1 size-4" />
                Change photo
              </Button>
              {familyImage && (
                <Button
                  variant="destructive"
                  disabled={deletePhotoMutation.isPending}
                  onClick={() => deletePhotoMutation.mutate()}
                >
                  <TrashIcon className="mr-1 size-4" />
                  Remove photo
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                handlePhotoFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
