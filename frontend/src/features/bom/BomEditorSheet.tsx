import { AlertTriangleIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useProducts } from "@/features/products/hooks";

import type { BomUnit } from "./api";
import { useBom, useBomCost, useReplaceBomMutation } from "./hooks";

interface DraftLine {
  component_product_id: string;
  name: string;
  quantity: number;
  unit: BomUnit;
}

interface PickableProduct {
  id: string;
  name: string;
  sku: string;
  attributes: Record<string, string>;
}

/**
 * The label for one product inside a same-name group — whatever attribute
 * values actually differ between the group's members, joined ("Argent", or
 * "Dorre 19mm" if two axes vary). Falls back to the SKU if nothing does,
 * which should not happen but must still be pickable if it somehow does.
 *
 * There's no `color_key` here to lean on: this list mixes every category's
 * variants, and asking for every scheme just to label a dropdown is a lot of
 * requests for a cosmetic string when the group's own attributes already
 * contain the answer.
 */
function colorLabel(product: PickableProduct, group: PickableProduct[]): string {
  const keys = Object.keys(product.attributes);
  const varying = keys.filter((key) => new Set(group.map((p) => p.attributes[key] ?? "")).size > 1);
  const label = varying.map((key) => product.attributes[key]).join(" ");
  return label || product.sku;
}

interface BomEditorSheetProps {
  kitProductId: string;
  kitName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edits a kit's recipe.
 *
 * The margin is shown live because the brief asks the ERP to work out the
 * component cost against the selling price — that number is the reason to
 * open this screen, not a footnote.
 */
export function BomEditorSheet({ kitProductId, kitName, open, onOpenChange }: BomEditorSheetProps) {
  const { data: existing, isLoading } = useBom(kitProductId, open);
  const { data: cost } = useBomCost(kitProductId, open);
  const replaceMutation = useReplaceBomMutation(kitProductId);

  // Components are picked from the whole catalogue; a kit cannot contain
  // another kit, so those are filtered out before they can be chosen.
  const { data: catalogue } = useProducts(1, 200);
  const [lines, setLines] = useState<DraftLine[]>([]);
  // Two-step pick: first the structural product ("Tube 28 Torsadi 2m"), then
  // which colour — variants of the same structural product now share a name,
  // so a flat list would show indistinguishable duplicate entries.
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  // Load the saved recipe into the draft once it arrives, and drop it when the
  // sheet closes so a previous kit's recipe can't leak into the next one.
  //
  // Done as a render-phase adjustment rather than in an effect: syncing state
  // from an effect renders once with the wrong contents before correcting
  // itself, which here means briefly showing the previous kit's components.
  const readyKey = open && existing ? kitProductId : null;
  const [draftKey, setDraftKey] = useState<string | null>(null);
  if (readyKey !== draftKey) {
    setDraftKey(readyKey);
    setLines(
      readyKey && existing
        ? existing.map((line) => ({
            component_product_id: line.component_product_id,
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
          }))
        : [],
    );
  }

  const chosen = new Set(lines.map((line) => line.component_product_id));
  const selectable = (catalogue?.data ?? []).filter(
    (product) => product.id !== kitProductId && product.product_type !== "kit",
  );

  // Group by name so colours of one structural product collapse to a single
  // entry in the first picker, matching how they now appear everywhere else.
  const byName = new Map<string, PickableProduct[]>();
  for (const product of selectable) {
    const list = byName.get(product.name) ?? [];
    list.push({
      id: product.id,
      name: product.name,
      sku: product.sku,
      attributes: product.attributes,
    });
    byName.set(product.name, list);
  }

  const groupOptions: SearchableSelectOption[] = [...byName.entries()].map(([name, group]) => ({
    value: name,
    label: name,
    description: group.length > 1 ? `${group.length} colours` : group[0]!.sku,
  }));

  const activeGroup = pickedGroup ? (byName.get(pickedGroup) ?? []) : [];
  // A group of one has nothing to disambiguate — add it straight away instead
  // of showing a colour picker with a single, forced choice.
  const needsColorPick = activeGroup.length > 1;

  const addLine = (product: PickableProduct) => {
    if (chosen.has(product.id)) return;
    setLines((current) => [
      ...current,
      { component_product_id: product.id, name: product.name, quantity: 1, unit: "piece" },
    ]);
    setPickedGroup(null);
    setPickedColor(null);
  };

  const pickGroup = (name: string | null) => {
    setPickedColor(null);
    if (!name) {
      setPickedGroup(null);
      return;
    }
    const group = byName.get(name) ?? [];
    if (group.length === 1) {
      addLine(group[0]!);
      return;
    }
    setPickedGroup(name);
  };

  const pickColor = (productId: string | null) => {
    const product = activeGroup.find((p) => p.id === productId);
    if (product) addLine(product);
  };

  const updateLine = (productId: string, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) =>
        line.component_product_id === productId ? { ...line, ...patch } : line,
      ),
    );

  const removeLine = (productId: string) =>
    setLines((current) => current.filter((line) => line.component_product_id !== productId));

  const save = () => {
    replaceMutation.mutate(
      lines.map((line) => ({
        component_product_id: line.component_product_id,
        quantity: line.quantity,
        unit: line.unit,
      })),
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Recipe — {kitName}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-muted-foreground">Add component</span>
                <SearchableSelect
                  options={groupOptions}
                  value={pickedGroup}
                  onChange={pickGroup}
                  placeholder="Search a product…"
                />
                {needsColorPick && (
                  <NativeSelect
                    aria-label={`Colour of ${pickedGroup}`}
                    value={pickedColor ?? ""}
                    onChange={(e) => {
                      setPickedColor(e.target.value);
                      pickColor(e.target.value);
                    }}
                  >
                    <option value="" disabled>
                      Choose a colour…
                    </option>
                    {activeGroup
                      .filter((product) => !chosen.has(product.id))
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {colorLabel(product, activeGroup)}
                        </option>
                      ))}
                  </NativeSelect>
                )}
              </div>

              {lines.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No components yet. A kit with an empty recipe cannot be built.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-2">
                  {lines.map((line) => (
                    <li
                      key={line.component_product_id}
                      className="flex flex-col gap-2 rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 text-sm font-medium">{line.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => removeLine(line.component_product_id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="numeric"
                          aria-label={`Quantity of ${line.name}`}
                          className="h-9 w-20 text-center tabular-nums"
                          value={line.quantity}
                          onChange={(e) => {
                            const next = parseInt(e.target.value, 10);
                            updateLine(line.component_product_id, {
                              quantity: Number.isFinite(next) && next > 0 ? next : 1,
                            });
                          }}
                        />
                        <NativeSelect
                          aria-label={`Unit for ${line.name}`}
                          className="h-9 w-28"
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(line.component_product_id, {
                              unit: e.target.value as BomUnit,
                            })
                          }
                        >
                          <option value="piece">piece</option>
                          <option value="pair">pair</option>
                        </NativeSelect>
                        {line.unit === "pair" && (
                          <span className="text-muted-foreground text-xs">
                            = {line.quantity * 2} pieces
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {cost && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Components cost</span>
                      <span className="tabular-nums">{cost.components_cost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sells for</span>
                      <span className="tabular-nums">{cost.selling_price}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Margin</span>
                      <span className="tabular-nums">
                        {cost.margin} ({cost.margin_pct}%)
                      </span>
                    </div>
                    {!cost.cost_is_complete && (
                      <p className="text-warning flex items-start gap-1.5 text-xs">
                        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Margin is incomplete — no cost price on:{" "}
                          {cost.components_missing_cost.join(", ")}
                        </span>
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">Figures update after saving.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button
            className="flex-1"
            onClick={save}
            disabled={replaceMutation.isPending || isLoading}
          >
            {replaceMutation.isPending ? "Saving…" : "Save recipe"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
