import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import type { Product } from "@/features/products/api";
import { useAddProductVariantMutation } from "@/features/products/hooks";
import type { VariantScheme } from "@/features/variants/api";
import { useWarehouses } from "@/features/warehouses/hooks";

/** One SKU segment: alphabetic values are abbreviated ("Torsadi" -> TOR),
 * values with a digit are kept whole ("28", "2m"). Mirrors the backend. */
function skuSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return "";
  return /^[A-Z]+$/.test(cleaned) ? cleaned.slice(0, 3) : cleaned;
}

function buildName(
  baseName: string,
  keys: string[],
  attributes: Record<string, string>,
  colorKey?: string | null,
): string {
  const parts = [baseName.trim()];
  for (const key of keys) {
    if (key === colorKey) continue;
    const value = (attributes[key] ?? "").trim();
    if (value) parts.push(value);
  }
  return parts.join(" ");
}

function buildSku(prefix: string, keys: string[], attributes: Record<string, string>): string {
  const segments = [prefix.trim().toUpperCase()];
  for (const key of keys) {
    const segment = skuSegment(attributes[key] ?? "");
    if (segment) segments.push(segment);
  }
  return segments.join("-");
}

interface AddVariantDialogProps {
  product: Product;
  scheme: VariantScheme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddVariantDialog({ product, scheme, open, onOpenChange }: AddVariantDialogProps) {
  const colorKey = scheme.color_key;
  const { data: warehouses } = useWarehouses();
  const addVariant = useAddProductVariantMutation();

  const [color, setColor] = useState("");
  const [custom, setCustom] = useState("");
  const [price, setPrice] = useState(() => product.price);
  const [cost, setCost] = useState(() => product.cost_price ?? "");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<string | null>(
    () => product.default_warehouse_id ?? null,
  );
  const [stocks, setStocks] = useState<Record<string, string>>({});

  const setStock = (warehouseId: string, value: string) =>
    setStocks((current) => ({ ...current, [warehouseId]: value }));

  const suggestions = useMemo(
    () => (colorKey ? (scheme.allowed_values[colorKey] ?? []) : []),
    [colorKey, scheme.allowed_values],
  );

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    setColor(value);
    setCustom("");
  };

  const preview = useMemo(() => {
    const trimmed = color.trim();
    if (!colorKey || !trimmed) return null;
    const merged = { ...(product.attributes ?? {}), [colorKey]: trimmed };
    const structuralKeys = scheme.attribute_keys.filter((key) => key !== colorKey);
    const hasFullStructure = structuralKeys.every((key) => (merged[key] ?? "").trim() !== "");
    if (hasFullStructure) {
      return {
        name: buildName(scheme.base_name, scheme.attribute_keys, merged, colorKey),
        sku: buildSku(scheme.sku_prefix, scheme.attribute_keys, merged),
      };
    }
    const segment = skuSegment(trimmed);
    return {
      name: product.name,
      sku: segment ? `${product.sku}-${segment}` : product.sku,
    };
  }, [color, colorKey, product, scheme]);

  const submit = () => {
    const trimmed = color.trim();
    if (!colorKey || !trimmed) return;
    const entries = Object.entries(stocks).flatMap(([warehouseId, raw]) => {
      const quantity = parseInt(raw, 10);
      return Number.isFinite(quantity) && quantity > 0
        ? [{ warehouseId, quantity, minQuantity: null }]
        : [];
    });
    addVariant.mutate(
      {
        productId: product.id,
        input: {
          attributes: { [colorKey]: trimmed },
          price: price.trim(),
          ...(cost.trim() !== "" ? { costPrice: cost.trim() } : {}),
          defaultWarehouseId: defaultWarehouseId ?? undefined,
          openingStock: entries,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const selected = color.trim();
  const colorChips = [
    ...suggestions,
    ...(selected && !suggestions.includes(selected) ? [selected] : []),
  ];
  const warehouseOptions: SearchableSelectOption[] = (warehouses ?? [])
    .filter((w) => w.is_active)
    .map((w) => ({
      value: w.id,
      label: w.name,
      description: `${w.warehouse_type}${w.is_default ? " (default)" : ""}`,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a colour</DialogTitle>
          <DialogDescription>
            A new row sharing "{product.name}" with its own stock. The name and SKU follow the
            category's formula.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="capitalize">{colorKey}</Label>
            <div className="flex flex-wrap gap-2">
              {colorChips.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={selected === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setColor(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={`Add a ${colorKey}…`}
                className="h-9 max-w-48"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addCustom();
                }}
              />
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={addCustom}>
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">{preview.name}</p>
              <p className="text-muted-foreground text-xs">{preview.sku}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-cost">Purchase price</Label>
              <Input
                id="variant-cost"
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-price">Selling price</Label>
              <Input
                id="variant-price"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Opening stock</Label>
            <div className="flex flex-col gap-2">
              {(warehouses ?? [])
                .filter((w) => w.is_active)
                .map((warehouse) => (
                  <div
                    key={warehouse.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {warehouse.name}
                      {warehouse.is_default && (
                        <span className="text-muted-foreground"> (default)</span>
                      )}
                    </span>
                    <Input
                      inputMode="numeric"
                      placeholder="Qty"
                      aria-label={`Opening stock in ${warehouse.name}`}
                      className="h-9 w-20 text-right tabular-nums"
                      value={stocks[warehouse.id] ?? ""}
                      onChange={(event) => setStock(warehouse.id, event.target.value)}
                    />
                  </div>
                ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Default warehouse (optional)</Label>
            <SearchableSelect
              options={warehouseOptions}
              value={defaultWarehouseId}
              onChange={setDefaultWarehouseId}
              placeholder="No default warehouse"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!selected || price.trim() === "" || addVariant.isPending}
          >
            {addVariant.isPending ? "Adding…" : "Add colour"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
