import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { CategorySelector } from "@/features/categories/CategorySelector";
import {
  useConfigurableDefinition,
  useDeleteConfigurableDefinition,
  useSaveConfigurableDefinition,
} from "@/features/configurable/hooks";
import type { BomUnit, ConfigurableRecipeLineInput } from "@/features/configurable/api";
import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

interface AxisRow {
  axis: string;
  values: string;
}

interface PriceRow {
  length: string;
  price: string;
}

interface RecipeRow {
  label: string;
  categoryId: string | null;
  attributes: string;
  quantity: number;
  unit: BomUnit;
}

/** "size=28/19, model=@support" -> {"size":"28/19","model":"@support"}. */
function parseAttributes(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) return null;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key || !value) return null;
    out[key] = value;
  }
  return out;
}

function formatAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

const EMPTY: { axisRows: AxisRow[]; priceRows: PriceRow[]; recipeRows: RecipeRow[] } = {
  axisRows: [{ axis: "", values: "" }],
  priceRows: [{ length: "", price: "" }],
  recipeRows: [{ label: "", categoryId: null, attributes: "", quantity: 1, unit: "piece" }],
};

/**
 * The definition editor: what a configurable product can be sold as.
 *
 * Three parts that mirror the backend shape — the option axes (support,
 * motif, colour…), the per-length prices (length drives the selling price and
 * the tube's length), and the recipe of *patterns* that map the chosen values
 * onto real products via "@axis" placeholders. The whole definition is saved
 * and replaced as one unit.
 */
export function ConfigurableDefinitionPage() {
  const { productId = "" } = useParams();
  const navigate = useNavigate();
  const saveMutation = useSaveConfigurableDefinition(productId);
  const deleteMutation = useDeleteConfigurableDefinition(productId);

  const { data, isLoading, error } = useConfigurableDefinition(productId, true);
  // A product created but not yet given a definition starts the editor empty
  // instead of stuck on the "not found" error.
  const missing = error instanceof ApiError && error.code === "configurable_no_definition";

  const [colorKey, setColorKey] = useState("");
  const [axisRows, setAxisRows] = useState<AxisRow[]>(EMPTY.axisRows);
  const [priceRows, setPriceRows] = useState<PriceRow[]>(EMPTY.priceRows);
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>(EMPTY.recipeRows);
  const [attributesError, setAttributesError] = useState<string | null>(null);

  // Hydrate the draft once per product: from the saved definition, or empty
  // for a definition-less product. Render-phase sync so the first paint never
  // shows another product's definition.
  const readyKey = productId + (data ? ":loaded" : missing ? ":missing" : "");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  if (readyKey !== draftKey) {
    setDraftKey(readyKey);
    setAttributesError(null);
    if (data) {
      setColorKey(data.color_key);
      setAxisRows(
        Object.entries(data.options).map(([axis, values]) => ({
          axis,
          values: values.join(", "),
        })),
      );
      setPriceRows(data.prices.map((p) => ({ length: p.length, price: p.price })));
      setRecipeRows(
        data.recipe.map((line) => ({
          label: line.label,
          categoryId: line.category_id,
          attributes: formatAttributes(line.attributes),
          quantity: line.quantity,
          unit: line.unit,
        })),
      );
    } else {
      setColorKey("");
      setAxisRows(EMPTY.axisRows);
      setPriceRows(EMPTY.priceRows);
      setRecipeRows(EMPTY.recipeRows);
    }
  }

  const updateAxis = (index: number, patch: Partial<AxisRow>) =>
    setAxisRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updatePrice = (index: number, patch: Partial<PriceRow>) =>
    setPriceRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateRecipe = (index: number, patch: Partial<RecipeRow>) =>
    setRecipeRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const axisKeys = axisRows.map((row) => row.axis.trim()).filter(Boolean);

  const save = () => {
    // Drop rows the admin left blank; let the server flag anything that is
    // required but missing.
    const options: Record<string, string[]> = {};
    for (const row of axisRows) {
      const axis = row.axis.trim();
      if (!axis) continue;
      const values = [
        ...new Set(
          row.values
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
      if (values.length > 0) options[axis] = values;
    }

    if (!colorKey || !options[colorKey]) {
      toast({
        title: "Cannot save",
        description: "Pick which axis is the colour.",
        variant: "destructive",
      });
      return;
    }

    const recipe: ConfigurableRecipeLineInput[] = [];
    for (const row of recipeRows) {
      if (!row.label.trim()) continue;
      const attributes = parseAttributes(row.attributes);
      if (attributes === null) {
        setAttributesError(row.label);
        toast({
          title: "Cannot save",
          description: `Attributes for “${row.label}” must be "key=value" pairs separated by commas.`,
          variant: "destructive",
        });
        return;
      }
      recipe.push({
        label: row.label.trim(),
        category_id: row.categoryId,
        attributes,
        quantity: Math.max(1, row.quantity),
        unit: row.unit,
      });
    }

    saveMutation.mutate(
      {
        color_key: colorKey,
        length_key: "length",
        options,
        prices: priceRows
          .filter((row) => row.length.trim() && row.price.trim())
          .map((row) => ({ length: row.length.trim(), price: row.price.trim() })),
        recipe,
      },
      {
        onSuccess: () => toast({ title: "Definition saved" }),
        onError: (saveError) =>
          toast({
            title: "Save failed",
            description:
              saveError instanceof ApiError
                ? (saveError.detail ?? "Please check the definition and try again.")
                : "Please check the definition and try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const removeDefinition = () => {
    if (!window.confirm("Remove this product's configuration? It will no longer be sellable."))
      return;
    deleteMutation.mutate(undefined, {
      onSuccess: () => void navigate("/configurable"),
      onError: (deleteError) =>
        toast({
          title: "Delete failed",
          description:
            deleteError instanceof ApiError
              ? (deleteError.detail ?? "Could not remove the definition.")
              : "Could not remove the definition.",
          variant: "destructive",
        }),
    });
  };

  if (isLoading) {
    return (
      <PageShell size="form">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell size="form">
      <PageHeader
        title={data?.name ?? "Define options"}
        description={
          data
            ? `${data.sku} — how the till offers and prices this product`
            : "Give this product its options, prices and recipe."
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Option axes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Colour axis</Label>
              <NativeSelect
                aria-label="Colour axis"
                value={colorKey}
                onChange={(e) => setColorKey(e.target.value)}
              >
                <option value="" disabled>
                  Which axis is the colour?
                </option>
                {axisKeys.map((axis) => (
                  <option key={axis} value={axis}>
                    {axis}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                The colour is applied to every component — one choice, whole triangle.
              </p>
            </div>

            <Separator />

            {axisRows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Axis (e.g. support)"
                  className="h-9 w-44"
                  value={row.axis}
                  onChange={(e) => updateAxis(index, { axis: e.target.value })}
                />
                <Input
                  placeholder="Values, comma-separated (e.g. F2, F3, F4)"
                  className="h-9 flex-1"
                  value={row.values}
                  onChange={(e) => updateAxis(index, { values: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label="Remove axis"
                  onClick={() => setAxisRows((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              className="self-start"
              onClick={() => setAxisRows((rows) => [...rows, { axis: "", values: "" }])}
            >
              <PlusIcon />
              Add axis
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lengths and prices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">
              The chosen length sets the selling price and the tube’s length in the recipe. Each
              length has exactly one price.
            </p>
            {priceRows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Length (e.g. 2)"
                  className="h-9 w-40"
                  value={row.length}
                  onChange={(e) => updatePrice(index, { length: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  placeholder="Price (e.g. 4600)"
                  className="h-9 flex-1"
                  value={row.price}
                  onChange={(e) => updatePrice(index, { price: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label="Remove length"
                  onClick={() => setPriceRows((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="self-start"
              onClick={() => setPriceRows((rows) => [...rows, { length: "", price: "" }])}
            >
              <PlusIcon />
              Add length
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recipe</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">
              Each line is a pattern matched against the real catalogue. Attributes can use the axes
              with an <code>@</code> prefix — <code>model=@support</code>,{" "}
              <code>length=@length</code>, <code>color=@color</code> — and are substituted with the
              chosen values.
            </p>
            {recipeRows.map((row, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Label (e.g. Tube, Support, Motif, Bouchons)"
                    className="h-9 flex-1"
                    value={row.label}
                    onChange={(e) => updateRecipe(index, { label: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label="Remove recipe line"
                    onClick={() => setRecipeRows((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <CategorySelector
                    value={row.categoryId}
                    onChange={(categoryId) => updateRecipe(index, { categoryId })}
                  />
                  <Input
                    placeholder="Attributes (e.g. size=28/19, model=@support)"
                    className="h-9 min-w-0 sm:w-72"
                    value={row.attributes}
                    onChange={(e) => updateRecipe(index, { attributes: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    aria-label={`Quantity of ${row.label || "this line"}`}
                    className="h-9 w-20 text-center tabular-nums"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      updateRecipe(index, {
                        quantity: Number.isFinite(next) && next > 0 ? next : 1,
                      });
                    }}
                  />
                  <NativeSelect
                    aria-label="Unit"
                    className="h-9 w-28"
                    value={row.unit}
                    onChange={(e) => updateRecipe(index, { unit: e.target.value as BomUnit })}
                  >
                    <option value="piece">piece</option>
                    <option value="pair">pair</option>
                  </NativeSelect>
                  {attributesError === row.label && (
                    <p className="text-destructive text-sm">
                      Attributes must be "key=value" pairs, comma-separated.
                    </p>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="self-start"
              onClick={() =>
                setRecipeRows((rows) => [
                  ...rows,
                  { label: "", categoryId: null, attributes: "", quantity: 1, unit: "piece" },
                ])
              }
            >
              <PlusIcon />
              Add recipe line
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button onClick={save} disabled={saveMutation.isPending} className="flex-1">
              {saveMutation.isPending ? "Saving…" : "Save definition"}
            </Button>
            <Button variant="outline" onClick={() => void navigate("/configurable")}>
              Cancel
            </Button>
          </div>
          {data && (
            <Button
              variant="ghost"
              onClick={removeDefinition}
              disabled={deleteMutation.isPending}
              className="text-destructive"
            >
              Remove definition
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
