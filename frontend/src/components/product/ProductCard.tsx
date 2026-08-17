import { PackageIcon } from "lucide-react";
import { Link } from "react-router";

import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import type { WarehouseStockItem } from "@/features/inventory/api";
import { resolveProductImageUrl } from "@/features/products/api";

interface ProductCardProps {
  item: WarehouseStockItem;
  variantCount?: number;
}

/** Compact product card for the warehouse browser: thumbnail, name/SKU, and
 * stock quantity. When `variantCount` is provided (for grouped variant
 * families), a badge shows how many variants the card represents. */
export function ProductCard({ item, variantCount }: ProductCardProps) {
  const imageUrl = resolveProductImageUrl(item.image_url);
  return (
    <Link
      to={`/products/${item.product_id}`}
      className="bg-card flex items-center gap-3 rounded-2xl border p-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        {imageUrl ? (
          <ProductImage src={imageUrl} alt={item.product_name} className="size-full object-cover" />
        ) : (
          <PackageIcon className="text-muted-foreground size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.product_name}</p>
        <p className="text-muted-foreground truncate text-xs">{item.sku}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-sm font-semibold tabular-nums">
          {item.quantity_on_hand.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-[10px] uppercase">on hand</span>
        {variantCount !== undefined && variantCount > 1 && (
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {variantCount} variants
          </Badge>
        )}
      </div>
    </Link>
  );
}
