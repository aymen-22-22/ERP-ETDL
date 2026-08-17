import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useVariantScheme } from "@/features/variants/hooks";
import type { SellableProduct } from "./hooks";

interface VariantPickerProps {
  /** The variant group whose variants to pick from. */
  product: SellableProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the resolved variant product when the user taps "Add". */
  onAdd: (variant: SellableProduct) => void;
}

/**
 * Bottom sheet that lets the cashier pick a specific variant from a family.
 *
 * Axes are shown as horizontally scrollable chip rows (e.g. "Couleur: Noir |
 * Blanc | Rouge").  The first axis with no selection is highlighted.  Once
 * every axis has a value, the matching variant is resolved and the "Add"
 * button becomes enabled.
 */
export function VariantPicker({ product, open, onOpenChange, onAdd }: VariantPickerProps) {
  const categoryId = product.categoryId;
  const { data: scheme, isLoading: schemeLoading } = useVariantScheme(categoryId);

  // Current selections per axis, e.g. { "couleur": "Noir" }
  const [selections, setSelections] = useState<Record<string, string>>({});

  const selectAxis = (axis: string, value: string) => {
    setSelections((prev) => ({
      ...prev,
      [axis]: prev[axis] === value ? "" : value,
    }));
  };

  // Axes to display: only the color_key axis varies within a group (the
  // group name already encodes the other axes like diameter/length/model).
  const displayAxes = scheme?.color_key ? [scheme.color_key] : (scheme?.attribute_keys ?? []);

  // Resolve the matching variant from the selections using each variant's
  // per-product `attributes` map (e.g. { "Couleur": "Noir", "Taille": "M" }).
  const variants = product.variantProducts ?? [];
  const resolved =
    displayAxes.length > 0
      ? variants.find((v) =>
          displayAxes.every((axis) => {
            const selected = selections[axis];
            if (!selected) return true;
            return v.attributes?.[axis]?.toLowerCase() === selected.toLowerCase();
          }),
        )
      : variants[0];
  const allAxesSelected = displayAxes.length > 0 && displayAxes.every((axis) => selections[axis]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>Select the variant you want to add to the sale.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {schemeLoading && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}

          {!schemeLoading && displayAxes.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No variant options available. Adding the first available variant.
            </p>
          )}

          {displayAxes.map((axis) => {
            const values = scheme?.allowed_values[axis] ?? [];
            return (
              <div key={axis} className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">{axis}</span>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((value) => {
                    const active = selections[axis] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => selectAxis(axis, value)}
                        className={cn(
                          "h-8 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
                          "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                          active
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "hover:bg-accent",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {resolved && (
            <div className="bg-muted flex items-center justify-between rounded-md p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{resolved.name}</p>
                <p className="text-muted-foreground text-xs">{resolved.sku}</p>
              </div>
              <span className="shrink-0 pl-3 font-semibold tabular-nums">
                {resolved.available} in stock
              </span>
            </div>
          )}

          <Button
            size="lg"
            disabled={
              (!allAxesSelected && displayAxes.length > 0) || !resolved || resolved.available <= 0
            }
            onClick={() => {
              if (resolved) {
                onAdd(resolved);
                onOpenChange(false);
                setSelections({});
              }
            }}
          >
            {!resolved || resolved.available <= 0 ? "Out of stock" : "Add to sale"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
