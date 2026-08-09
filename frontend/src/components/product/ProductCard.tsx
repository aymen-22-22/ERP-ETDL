import { PackageIcon } from "lucide-react";
import { Link } from "react-router";

import type { WarehouseStockItem } from "@/features/inventory/api";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  item: WarehouseStockItem;
}

/** Compact product row for the leaf level of the warehouse browser: a small
 * thumbnail, name/SKU and quantity-on-hand. Pairs 2-up on small+ screens. */
export function ProductCard({ item }: ProductCardProps) {
  return (
    <Link
      to={`/products/${item.product_id}`}
      className="bg-card flex items-center gap-3 rounded-2xl border p-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        <PackageIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.product_name}</p>
        <p className="text-muted-foreground truncate text-xs">{item.sku}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className={cn("block text-sm font-semibold tabular-nums")}>
          {item.quantity_on_hand.toLocaleString()}
        </span>
        <span className="text-muted-foreground block text-[10px] uppercase">on hand</span>
      </div>
    </Link>
  );
}
