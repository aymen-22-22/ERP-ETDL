import { MinusIcon, PlusIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { CartLine } from "./cartStore";

interface CartPanelProps {
  lines: CartLine[];
  subtotalCents: number;
  totalCents: number;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onComplete: () => void;
  onClear: () => void;
  isSubmitting: boolean;
  /** Max sellable per product, so the stepper can't exceed available stock. */
  availableByProduct: Map<string, number>;
  className?: string;
}

export function CartPanel({
  lines,
  subtotalCents,
  totalCents,
  onSetQuantity,
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
          const max = availableByProduct.get(line.productId) ?? line.quantity;
          return (
            <li key={line.productId} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {line.sku} · {formatMoney(line.unitPriceCents)} each
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(line.unitPriceCents * line.quantity)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => onSetQuantity(line.productId, line.quantity - 1)}
                >
                  <MinusIcon />
                </Button>
                <Input
                  inputMode="numeric"
                  aria-label={`Quantity for ${line.name}`}
                  value={line.quantity}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    onSetQuantity(line.productId, Number.isFinite(next) ? next : 0);
                  }}
                  className="h-9 w-14 px-1 text-center tabular-nums"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Increase ${line.name}`}
                  disabled={line.quantity >= max}
                  onClick={() => onSetQuantity(line.productId, line.quantity + 1)}
                >
                  <PlusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-9"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.productId)}
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
