import { StockBadge } from "@/components/patterns/StatusBadge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { SellableProduct } from "./hooks";

interface ProductTileProps {
  product: SellableProduct;
  /** Quantity already in the cart, shown as a corner badge. */
  inCart: number;
  onAdd: () => void;
}

/**
 * One sellable product in the grid.
 *
 * A card rather than a table row: a till is tap-driven, and the whole tile
 * being the target makes it usable at speed on a phone. Price is the most
 * prominent element because it's what gets read aloud.
 */
export function ProductTile({ product, inCart, onAdd }: ProductTileProps) {
  const soldOut = product.available <= 0;
  // Everything already in the basket counts against what's left on the shelf.
  const exhausted = inCart >= product.available;
  const disabled = soldOut || exhausted;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      aria-label={`Add ${product.name} to sale`}
      className={cn(
        "bg-card relative flex min-h-28 flex-col justify-between rounded-md border p-3 text-left transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-foreground/30 active:bg-accent cursor-pointer",
      )}
    >
      {inCart > 0 && (
        <span
          aria-label={`${inCart} in sale`}
          className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
        >
          {inCart}
        </span>
      )}

      <div className="min-w-0 pr-7">
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{product.sku}</p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {formatMoney(product.unitPriceCents)}
        </span>
        <StockBadge quantity={product.available} minQuantity={product.minQuantity} />
      </div>
    </button>
  );
}
