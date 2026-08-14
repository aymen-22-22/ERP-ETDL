import { MinusIcon, PlusIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { CartLine } from "./cartStore";

interface CartPanelProps {
  lines: CartLine[];
  subtotalCents: number;
  totalCents: number;
  onSetQuantity: (key: string, quantity: number) => void;
  /** The cashier discounts a line by editing the charged unit price. */
  onSetUnitPrice: (key: string, unitPriceCents: number) => void;
  onRemove: (key: string) => void;
  onComplete: () => void;
  onClear: () => void;
  isSubmitting: boolean;
  /** Max sellable per product, so the stepper can't exceed available stock. */
  availableByProduct: Map<string, number>;
  className?: string;
}

/**
 * Editable unit price for one line. Kept as a local string so typing isn't
 * reformatted mid-edit; the store only sees whole cents, committed on blur
 * (moving focus to "Complete sale" fires blur before the click). The caller
 * keys this by the committed price so an external change remounts it fresh.
 */
function UnitPriceInput({ cents, onChange }: { cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState((cents / 100).toFixed(2));

  return (
    <Input
      inputMode="decimal"
      aria-label="Unit price"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = Number(text);
        // "0" is a legitimate free line; a garbled entry just reverts.
        if (!Number.isFinite(parsed) || parsed < 0) {
          setText((cents / 100).toFixed(2));
          return;
        }
        const next = Math.round(parsed * 100);
        if (next !== cents) onChange(next);
      }}
      className="h-9 w-20 px-1 text-right tabular-nums"
    />
  );
}

export function CartPanel({
  lines,
  subtotalCents,
  totalCents,
  onSetQuantity,
  onSetUnitPrice,
  onRemove,
  onComplete,
  onClear,
  isSubmitting,
  availableByProduct,
  className,
}: CartPanelProps) {
  if (lines.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-12 text-center",
          className,
        )}
      >
        <ShoppingCartIcon className="text-muted-foreground size-8" />
        <p className="text-sm font-medium">No items yet</p>
        <p className="text-muted-foreground text-sm">Tap a product to start the sale.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ul className="flex list-none flex-col gap-2">
        {lines.map((line) => {
          // Configurable lines carry their own cap (how many of that exact
          // configuration stock can build); plain lines cap against the
          // warehouse snapshot like before.
          const max = line.maxQuantity ?? availableByProduct.get(line.productId) ?? line.quantity;
          return (
            <li key={line.key} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{line.sku}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(line.unitPriceCents * line.quantity)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => onSetQuantity(line.key, line.quantity - 1)}
                >
                  <MinusIcon />
                </Button>
                <Input
                  inputMode="numeric"
                  aria-label={`Quantity for ${line.name}`}
                  value={line.quantity}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    onSetQuantity(line.key, Number.isFinite(next) ? next : 0);
                  }}
                  className="h-9 w-14 px-1 text-center tabular-nums"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Increase ${line.name}`}
                  disabled={line.quantity >= max}
                  onClick={() => onSetQuantity(line.key, line.quantity + 1)}
                >
                  <PlusIcon />
                </Button>
                <div className="ml-auto flex items-center gap-1.5">
                  <Label className="text-muted-foreground text-xs">Price</Label>
                  <UnitPriceInput
                    key={`${line.key}:${line.unitPriceCents}`}
                    cents={line.unitPriceCents}
                    onChange={(cents) => onSetUnitPrice(line.key, cents)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.key)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="label-caps text-muted-foreground">Total</span>
          <span className="text-2xl font-semibold tabular-nums">{formatMoney(totalCents)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onComplete} disabled={isSubmitting}>
          {isSubmitting ? "Completing…" : "Complete sale"}
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={isSubmitting}>
          Clear sale
        </Button>
      </div>
    </div>
  );
}
