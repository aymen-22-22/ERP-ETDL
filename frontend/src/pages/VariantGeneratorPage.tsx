import { ArrowLeftIcon, PlusIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

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
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

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
  const pricedCount = newItems.filter((item) => (prices[item.sku] ?? "").trim() !== "").length;

  const generate = () => {
    if (!categoryId) return;
    generateMutation.mutate(
      {
        categoryId,
        items: newItems
          .filter((item) => (prices[item.sku] ?? "").trim() !== "")
          .map((item) => ({ attributes: item.attributes, price: prices[item.sku]!.trim() })),
        defaultWarehouseId: warehouseId,
      },
      {
        onSuccess: () => {
          setPrices({});
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
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/products">
              <ArrowLeftIcon className="mr-1 size-4" />
              Products
            </Link>
          </Button>
        }
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
                <ul className="flex list-none flex-col gap-2">
                  {preview.map((item) => (
                    <li
                      key={item.sku}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-muted-foreground truncate text-xs">{item.sku}</p>
                      </div>
                      {item.already_exists ? (
                        <Badge variant="outline">Already exists</Badge>
                      ) : (
                        <Input
                          inputMode="decimal"
                          placeholder="Price"
                          aria-label={`Price for ${item.name}`}
                          className="h-9 w-28 text-right tabular-nums"
                          value={prices[item.sku] ?? ""}
                          onChange={(e) =>
                            setPrices((current) => ({ ...current, [item.sku]: e.target.value }))
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>

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
