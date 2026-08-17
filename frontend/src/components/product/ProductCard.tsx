import { PackageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";

interface ProductCardProps {
  href: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  fallbackIcon?: ReactNode;
  /** Single product price. */
  price?: string;
  /** Variant group price range (e.g. "10.50–15.00"). */
  priceRange?: string;
  /** Warehouse page: show stock quantity. */
  stockQty?: number;
  /** Variant group: show "N variants" badge. */
  variantCount?: number;
}

/** Shared vertical product card used by both the Products page and the
 *  Warehouse browser.  The card is intentionally simple — image on top,
 *  text below — so it stays compact in 2–5-column grids. */
export function ProductCard({
  href,
  name,
  sku,
  imageUrl,
  fallbackIcon,
  price,
  priceRange,
  stockQty,
  variantCount,
}: ProductCardProps) {
  return (
    <Link
      to={href}
      className="bg-card hover:border-foreground/30 flex flex-col overflow-hidden rounded-md border transition-colors"
    >
      <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden">
        {imageUrl ? (
          <ProductImage src={imageUrl} alt={name} className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground">
            {fallbackIcon ?? <PackageIcon className="size-6" />}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="truncate text-xs font-medium">{name}</p>
        <div className="flex items-center justify-between gap-1">
          {stockQty !== undefined ? (
            <span className="text-xs font-semibold tabular-nums">{stockQty.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground truncate text-xs tabular-nums">
              {sku || "\u00A0"}
            </span>
          )}
          {priceRange ? (
            <span className="text-xs font-medium tabular-nums">{priceRange}</span>
          ) : price ? (
            <span className="text-xs font-medium tabular-nums">{price}</span>
          ) : stockQty !== undefined ? (
            <span className="text-muted-foreground text-[10px] uppercase">on hand</span>
          ) : null}
        </div>
        {variantCount !== undefined && variantCount > 1 && (
          <Badge variant="secondary" className="mt-0.5 w-fit text-[10px]">
            {variantCount} variants
          </Badge>
        )}
      </div>
    </Link>
  );
}
