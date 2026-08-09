import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useResolveConfiguration, useConfigurableDefinition } from "@/features/configurable/hooks";
import { formatMoney, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";

import type { CartLineDraft } from "../sales/cartStore";

interface ConfigurableWizardProps {
  /** The tile that was tapped; null closes the wizard. */
  product: { productId: string; name: string; sku: string } | null;
  storeId: string | null;
  onOpenChange: (open: boolean) => void;
  onAdd: (draft: CartLineDraft) => void;
}

const AXIS_LABELS: Record<string, string> = {
  support: "Support",
  motif: "Motif",
  length: "Length",
  color: "Colour",
};

function axisLabel(key: string): string {
  return AXIS_LABELS[key] ?? (key.length > 0 ? key[0]!.toUpperCase() + key.slice(1) : key);
}

/**
 * The configuration picker, opened from a configurable tile on the till.
 *
 * Each axis is one step (support → motif → length → colour, length priced per
 * choice). The resolution query follows the chosen values, so price,
 * composition and how many can be built update as choices are made. Nothing is
 * added to the sale until the cashier confirms a buildable combination.
 */
export function ConfigurableWizard({
  product,
  storeId,
  onOpenChange,
  onAdd,
}: ConfigurableWizardProps) {
  const open = product !== null;
  const { data: definition, isLoading } = useConfigurableDefinition(
    product?.productId ?? null,
    open,
  );

  // Reset the in-progress configuration whenever the wizard opens, so the
  // previous product's choices can't leak into this one. Render-phase sync,
  // as elsewhere: an effect would flash one frame of stale selections.
  const readyKey = open && definition ? product.productId : null;
  const [wizardKey, setWizardKey] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<Record<string, string>>({});
  if (readyKey !== wizardKey) {
    setWizardKey(readyKey);
    setConfiguration({});
  }

  const optionKeys = definition ? Object.keys(definition.options) : [];
  const colorKey = definition?.color_key ?? "";
  const lengthKey = definition?.length_key ?? "";
  // Structure options in their stored order, then length, then colour — the
  // order the shop reads a triangle in (support, motif, length, colour).
  const stepKeys = [
    ...optionKeys.filter((key) => key !== colorKey && key !== lengthKey),
    lengthKey,
    colorKey,
  ].filter((key) => key.length > 0);

  const complete = stepKeys.length > 0 && stepKeys.every((key) => configuration[key]);
  const resolution = useResolveConfiguration(
    product?.productId ?? null,
    configuration,
    storeId,
    open && complete,
  );
  const resolved = resolution.data;

  const select = (key: string, value: string) =>
    setConfiguration((current) => ({ ...current, [key]: value }));

  const valuesFor = (key: string): { value: string; price?: string }[] => {
    if (key === lengthKey) {
      return (definition?.prices ?? []).map((p) => ({ value: p.length, price: p.price }));
    }
    return (definition?.options[key] ?? []).map((value) => ({ value }));
  };

  const add = () => {
    if (!product || !resolved || resolved.buildable <= 0) return;
    onAdd({
      productId: product.productId,
      name: resolved.display_name,
      sku: product.sku,
      unitPriceCents: toCents(resolved.price),
      configuration: resolved.configuration,
      maxQuantity: resolved.buildable,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{product?.name ?? "Configure"}</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {isLoading || !definition ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {stepKeys.map((key) => (
                <div key={key} className="flex flex-col gap-2">
                  <span className="label-caps text-muted-foreground">{axisLabel(key)}</span>
                  <div className="flex flex-wrap gap-2">
                    {valuesFor(key).map(({ value, price }) => {
                      const selected = configuration[key] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => select(key, value)}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm transition-colors",
                            "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                            selected
                              ? "bg-primary text-primary-foreground border-transparent"
                              : "hover:bg-accent",
                          )}
                        >
                          {value}
                          {price !== undefined && (
                            <span
                              className={cn(
                                "ml-2 text-xs tabular-nums",
                                selected ? "text-primary-foreground/80" : "text-muted-foreground",
                              )}
                            >
                              {formatMoney(toCents(price))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!complete ? (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  Choose every option to see the price and composition.
                </p>
              ) : resolution.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : resolution.error ? (
                <p className="text-destructive flex items-start gap-1.5 text-sm">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {resolution.error instanceof ApiError
                      ? (resolution.error.detail ?? "Could not resolve this configuration.")
                      : "Could not resolve this configuration."}
                  </span>
                </p>
              ) : resolved ? (
                <div className="flex flex-col gap-3 rounded-md border p-3 text-sm">
                  <div className="flex items-end justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{resolved.display_name}</p>
                      <p className="text-muted-foreground text-xs">{product!.sku}</p>
                    </div>
                    <span className="text-xl font-semibold tabular-nums">
                      {formatMoney(toCents(resolved.price))}
                    </span>
                  </div>

                  <ul className="flex list-none flex-col gap-1.5">
                    {resolved.lines.map((line) => (
                      <li key={line.component_product_id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground">{line.label} ·</span> {line.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {line.quantity} {line.unit}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {resolved.buildable > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Can build{" "}
                      <span className="font-medium tabular-nums">{resolved.buildable}</span> from
                      stock on hand.
                    </p>
                  ) : (
                    <p className="text-warning flex items-start gap-1.5 text-xs">
                      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>Components are short — this configuration cannot be sold yet.</span>
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button
            className="flex-1"
            onClick={add}
            disabled={!resolved || resolved.buildable <= 0 || resolution.isLoading}
          >
            Add to sale
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
