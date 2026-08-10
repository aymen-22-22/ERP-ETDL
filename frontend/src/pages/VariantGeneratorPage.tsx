import { PlusIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { CategorySelector } from "@/features/categories/CategorySelector";
import {
  useGenerateVariantsMutation,
  useVariantPreview,
  useVariantScheme,
} from "@/features/variants/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

/**
 * Bulk-creates the parts that are named by formula rather than typed —
 * tubes, motifs, supports, bouchons.
 *
 * The shape of the screen follows the risk: ticking two diameters and two
 * colours is four new products, so nothing is created until you have seen the
 * exact generated names and put a price against each.
 */
export function VariantGeneratorPage() {
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
  const [customValue, setCustomValue] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  // Opening count per generated SKU, per warehouse. Entered here rather than
  // afterwards because a 16-row tube grid would otherwise be 32 separate trips
  // through the stock-adjustment screen.
  const [stocks, setStocks] = useState<Record<string, Record<string, string>>>({});
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  const setStock = (sku: string, warehouse: string, value: string) =>
    setStocks((current) => ({
      ...current,
      [sku]: { ...(current[sku] ?? {}), [warehouse]: value },
    }));

  const {
    data: scheme,
    isLoading: schemeLoading,
    isError: noScheme,
  } = useVariantScheme(categoryId);
  const { data: preview, isFetching: previewing } = useVariantPreview(categoryId, selectedValues);
  const { data: warehouses } = useWarehouses();
  const generateMutation = useGenerateVariantsMutation();

  // Switching category invalidates every prior choice.
  const chooseCategory = (id: string | null) => {
    setCategoryId(id);
    setSelectedValues({});
    setCustomValue({});
    setPrices({});
    setCosts({});
    setStocks({});
  };

  const toggleValue = (key: string, value: string) =>
    setSelectedValues((current) => {
      const existing = current[key] ?? [];
      return {
        ...current,
        [key]: existing.includes(value)
          ? existing.filter((v) => v !== value)
          : [...existing, value],
      };
    });

  const addCustomValue = (key: string) => {
    const value = (customValue[key] ?? "").trim();
    if (!value) return;
    setSelectedValues((current) => {
      const existing = current[key] ?? [];
      return existing.includes(value) ? current : { ...current, [key]: [...existing, value] };
    });
    setCustomValue((current) => ({ ...current, [key]: "" }));
  };

  const newItems = (preview ?? []).filter((item) => !item.already_exists);

  // Grouped by name: colour no longer appears in it, so every colour of one
  // structural product ("Tube 28 Torsadi 2m") lands in the same group. Price
  // and cost are entered once per group and applied to every colour in it —
  // the business prices a tube the same regardless of colour; only the stock
  // count differs, and that stays per colour.
  const groups = new Map<string, typeof newItems>();
  for (const item of newItems) {
    const list = groups.get(item.name) ?? [];
    list.push(item);
    groups.set(item.name, list);
  }

  const pricedCount = newItems.filter((item) => (prices[item.name] ?? "").trim() !== "").length;

  const generate = () => {
    if (!categoryId) return;
    generateMutation.mutate(
      {
        categoryId,
        items: newItems
          .filter((item) => (prices[item.name] ?? "").trim() !== "")
          .map((item) => {
            const cost = (costs[item.name] ?? "").trim();
            const perWarehouse = stocks[item.sku] ?? {};
            return {
              attributes: item.attributes,
              price: prices[item.name]!.trim(),
              ...(cost !== "" ? { cost_price: cost } : {}),
              opening_stock: Object.entries(perWarehouse).flatMap(([wid, raw]) => {
                const quantity = parseInt(raw, 10);
                return Number.isFinite(quantity) && quantity > 0
                  ? [{ warehouse_id: wid, quantity, min_quantity: null }]
                  : [];
              }),
            };
          }),
        defaultWarehouseId: warehouseId,
      },
      {
        onSuccess: () => {
          setPrices({});
          setCosts({});
          setStocks({});
          void navigate("/products");
        },
      },
    );
  };

  const warehouseOptions: SearchableSelectOption[] = (warehouses ?? [])
    .filter((w) => w.is_active)
    .map((w) => ({
      value: w.id,
      label: w.name,
      description: `${w.warehouse_type}${w.is_default ? " (default)" : ""}`,
    }));

  return (
    <PageShell size="content" className="pb-24">
      <PageHeader
        title="Generate products"
        description="Create the parts whose names follow a formula, in bulk."
        back="/products"
      />

      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <CategorySelector value={categoryId} onChange={chooseCategory} />
        <p className="text-muted-foreground text-xs">
          Only categories with a naming formula can be generated — tubes, motifs, supports,
          bouchons.
        </p>
      </div>

      {categoryId && schemeLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {categoryId && noScheme && (
        <EmptyState
          icon={WandSparklesIcon}
          title="This category is not generated"
          description="Products here are created one at a time from the normal product form."
          action={{ label: "New product", onClick: () => void navigate("/products/new") }}
        />
      )}

      {scheme && (
        <>
          <Separator />
          <div className="flex flex-col gap-5">
            {scheme.attribute_keys.map((key) => {
              const suggestions = scheme.allowed_values[key] ?? [];
              const chosen = selectedValues[key] ?? [];
              // Values typed in here are kept alongside the suggestions, so a
              // colour the shop just started stocking doesn't need a migration.
              const extras = chosen.filter((v) => !suggestions.includes(v));
              return (
                <div key={key} className="flex flex-col gap-2">
                  <Label className="capitalize">{key}</Label>
                  <div className="flex flex-wrap gap-2">
                    {[...suggestions, ...extras].map((value) => (
                      <label
                        key={value}
                        className="hover:bg-accent flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
                      >
                        <Checkbox
                          checked={chosen.includes(value)}
                          onChange={() => toggleValue(key, value)}
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Add a ${key}…`}
                      className="h-9 max-w-40"
                      value={customValue[key] ?? ""}
                      onChange={(e) =>
                        setCustomValue((current) => ({ ...current, [key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addCustomValue(key);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => addCustomValue(key)}
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Default warehouse (optional)</Label>
            <SearchableSelect
              options={warehouseOptions}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="No default warehouse"
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Preview</h2>
              {previewing && <Spinner size="sm" />}
            </div>

            {!preview || preview.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Tick at least one value above to see what would be created.
              </p>
            ) : (
              <>
                <ul className="flex list-none flex-col gap-3">
                  {[...groups.entries()].map(([name, items]) => (
                    <li key={name} className="flex flex-col gap-3 rounded-md border p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{name}</span>
                        <span className="text-muted-foreground text-xs">
                          {items.length} colour{items.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Input
                          inputMode="decimal"
                          placeholder="Purchase"
                          aria-label={`Purchase price for ${name}`}
                          className="h-9 w-28 text-right tabular-nums"
                          value={costs[name] ?? ""}
                          onChange={(e) =>
                            setCosts((current) => ({ ...current, [name]: e.target.value }))
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Selling"
                          aria-label={`Selling price for ${name}`}
                          className="h-9 w-28 text-right tabular-nums"
                          value={prices[name] ?? ""}
                          onChange={(e) =>
                            setPrices((current) => ({ ...current, [name]: e.target.value }))
                          }
                        />
                        <span className="text-muted-foreground self-center text-xs">
                          same price for every colour below
                        </span>
                      </div>

                      <ul className="flex list-none flex-col gap-2">
                        {items.map((item) => {
                          // Whatever attribute differs between this colour and
                          // its siblings in the group ("Argent" vs "Dorre").
                          const keys = Object.keys(item.attributes);
                          const varying = keys.filter(
                            (key) => new Set(items.map((i) => i.attributes[key] ?? "")).size > 1,
                          );
                          const colorLabel =
                            varying.map((key) => item.attributes[key]).join(" ") || item.sku;

                          return (
                            <li
                              key={item.sku}
                              className="flex flex-wrap items-center gap-2 border-t pt-2 first:border-t-0 first:pt-0"
                            >
                              <span className="min-w-20 text-sm font-medium">{colorLabel}</span>
                              <span className="text-muted-foreground truncate text-xs">
                                {item.sku}
                              </span>
                              {(warehouses ?? [])
                                .filter((w) => w.is_active)
                                .map((w) => (
                                  <Input
                                    key={w.id}
                                    inputMode="numeric"
                                    placeholder={w.name}
                                    aria-label={`Opening stock of ${item.name} ${colorLabel} in ${w.name}`}
                                    className="h-9 w-20 text-right tabular-nums"
                                    value={stocks[item.sku]?.[w.id] ?? ""}
                                    onChange={(e) => setStock(item.sku, w.id, e.target.value)}
                                  />
                                ))}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>

                {preview.some((item) => item.already_exists) && (
                  <div className="flex flex-wrap gap-2">
                    {preview
                      .filter((item) => item.already_exists)
                      .map((item) => (
                        <Badge key={item.sku} variant="outline">
                          {item.name} — already exists
                        </Badge>
                      ))}
                  </div>
                )}

                <p className="text-muted-foreground text-sm">
                  {newItems.length} new · {preview.length - newItems.length} already exist ·{" "}
                  {pricedCount} priced
                </p>

                <Button
                  size="lg"
                  disabled={pricedCount === 0 || generateMutation.isPending}
                  onClick={generate}
                >
                  {generateMutation.isPending
                    ? "Creating…"
                    : `Create ${pricedCount} product${pricedCount === 1 ? "" : "s"}`}
                </Button>
                {pricedCount < newItems.length && (
                  <p className="text-muted-foreground text-xs">
                    Only priced rows are created — a product needs a price.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
