import { ProductImage } from "@/components/ProductImage";
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
 * A compact, image-dominant card built for tapping quickly at a till: the
 * photo is the largest surface, name/type/price stay small, and the whole tile
 * is the tap target. `min-w-0` lets the card shrink inside its grid column so
 * a long label can never push a column (or the page) past the viewport.
 */
export function ProductTile({ product, inCart, onAdd }: ProductTileProps) {
  // A configurable tile is never "sold out": how many can be built depends on
  // the configuration, which is only known once the wizard resolves it. It is
  // also never exhausted by the basket — two different configurations of the
  // same product are separate lines.
  const soldOut = !product.isConfigurable && product.available <= 0;
  const exhausted = !product.isConfigurable && inCart >= product.available;
  const disabled = soldOut || exhausted;

  const actionLabel = product.isConfigurable
    ? "Configure"
    : soldOut
      ? "Out"
      : exhausted
        ? "In cart"
        : "Add";

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      aria-label={`Add ${product.name} to sale`}
      className={cn(
        "bg-card relative flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm text-left transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-foreground/30 active:bg-accent cursor-pointer",
      )}
    >
      {inCart > 0 && (
        <span
          aria-label={`${inCart} in sale`}
          className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 z-10 flex size-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
        >
          {inCart}
        </span>
      )}

      <div className="bg-muted flex h-30 w-full shrink-0 items-center justify-center overflow-hidden">
        {product.imageUrl && (
          <ProductImage src={product.imageUrl} className="size-full object-contain p-1.5" />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1 p-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-4 font-medium">{product.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {product.isConfigurable ? "Configurable" : product.isKit ? "Kit" : product.sku}
          </p>
        </div>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-1.5">
          <span className="min-w-0 truncate text-[17px] leading-6 font-semibold tabular-nums">
            {product.isConfigurable && (
              <span className="text-muted-foreground text-xs font-normal">from </span>
            )}
            {formatMoney(product.unitPriceCents)}
          </span>
          <span
            aria-hidden
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center rounded-md px-2.5 text-xs font-medium",
              disabled ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {actionLabel}
          </span>
        </div>
      </div>
    </button>
  );
}
