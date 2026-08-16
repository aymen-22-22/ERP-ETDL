import { StoreIcon, TruckIcon, Undo2Icon, WarehouseIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { ProductImage } from "@/components/ProductImage";
import { resolveProductImageUrl } from "@/features/products/api";
import type { Warehouse, WarehouseType } from "@/features/warehouses/api";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<WarehouseType, LucideIcon> = {
  depot: WarehouseIcon,
  store: StoreIcon,
  transit: TruckIcon,
  return: Undo2Icon,
};

const TYPE_LABELS: Record<WarehouseType, string> = {
  depot: "Depot",
  store: "Store",
  transit: "Transit",
  return: "Return",
};

interface WarehouseCardProps {
  warehouse: Warehouse;
  productCount?: number | undefined;
}

/** Large image-led card for the warehouse overview: a full-width photo (or a
 * themed type icon as a placeholder), a floating type chip, and name/status
 * below. Card body only — the surrounding grid owns spacing. */
export function WarehouseCard({ warehouse, productCount }: WarehouseCardProps) {
  const Icon = TYPE_ICONS[warehouse.warehouse_type];
  const imageUrl = resolveProductImageUrl(warehouse.image_url);

  return (
    <Link to={`/warehouses/${warehouse.id}`} className="group block h-full">
      <div className="bg-card overflow-hidden rounded-2xl border shadow-sm transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[4/3] overflow-hidden">
          {imageUrl ? (
            <ProductImage
              src={imageUrl}
              alt={warehouse.name}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="bg-primary/5 flex size-full items-center justify-center">
              <Icon className="text-primary/40 size-10" />
            </div>
          )}
          <span className="bg-background/90 text-primary absolute bottom-2 left-2 flex size-7 items-center justify-center rounded-full shadow-sm backdrop-blur">
            <Icon className="size-4" />
          </span>
          {warehouse.is_default && (
            <span className="bg-primary text-primary-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm">
              Default
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <p className="truncate text-sm font-semibold">{warehouse.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                warehouse.is_active ? "bg-success" : "bg-muted-foreground",
              )}
            />
            <span className="capitalize">{TYPE_LABELS[warehouse.warehouse_type]}</span>
            <span className="text-muted-foreground/70">·</span>
            <span className="tabular-nums">{productCount?.toLocaleString() ?? "—"} products</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
