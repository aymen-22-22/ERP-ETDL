import { StockBadge } from "@/components/patterns/StatusBadge";
import { Badge } from "@/components/ui/badge";
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
  // A configurable tile is never "sold out": how many can be built depends on
  // the configuration, which is only known once the wizard resolves it. It is
  // also never exhausted by the basket — two different configurations of the
  // same product are separate lines.
  const soldOut = !product.isConfigurable && product.available <= 0;
  const exhausted = !product.isConfigurable && inCart >= product.available;
  const disabled = soldOut || exhausted;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      aria-label={`Add ${product.name} to sale`}
      className={cn(
        // Same card language as the Products page: a bordered, flat surface
        // with the photo as a full-width banner rather than a small thumbnail.
        "bg-card relative flex flex-col overflow-hidden rounded-md border text-left transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-foreground/30 active:bg-accent cursor-pointer",
      )}
    >
      {inCart > 0 && (
        <span
          aria-label={`${inCart} in sale`}
          className="bg-primary text-primary-foreground absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
        >
          {inCart}
        </span>
      )}

      <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
        {product.imageUrl && (
          <img src={product.imageUrl} alt="" className="size-full object-cover" />
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {product.isConfigurable ? "Configurable" : product.isKit ? "Kit" : product.sku}
          </p>
        </div>

        <div className="flex items-end justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {product.isConfigurable && (
              <span className="text-muted-foreground text-xs font-normal">from </span>
            )}
            {formatMoney(product.unitPriceCents)}
          </span>
          {product.isConfigurable ? (
            <Badge variant="secondary">Configure</Badge>
          ) : product.isKit ? (
            // A kit's number is how many its components can build, which is not
            // the same claim as "we have N on the shelf" — labelled so nobody
            // reads it as a physical count.
            <Badge variant={product.available > 0 ? "secondary" : "outline"}>
              {product.available > 0 ? `${product.available} buildable` : "Components short"}
            </Badge>
          ) : (
            <StockBadge quantity={product.available} minQuantity={product.minQuantity} />
          )}
        </div>
      </div>
    </button>
  );
}
