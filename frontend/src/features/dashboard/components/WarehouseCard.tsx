import { Link } from "react-router";

import type { WarehouseType } from "@/features/warehouses/api";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<WarehouseType, string> = {
  depot: "Depot",
  store: "Store",
  transit: "Transit",
  return: "Return",
};

interface WarehouseCardProps {
  id: string;
  name: string;
  warehouseType: WarehouseType;
  imageUrl: string | null;
  productCount: number;
  utilization: number | null;
}

export function WarehouseCard({
  id,
  name,
  warehouseType,
  imageUrl,
  productCount,
  utilization,
}: WarehouseCardProps) {
  return (
    <Link to={`/warehouses/${id}`} className="group block h-full">
      <div className="bg-card relative h-full overflow-hidden rounded-2xl border shadow-sm">
        <div className="relative aspect-[16/9] overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={name} loading="lazy" className="size-full object-cover" />
          ) : (
            <div className="bg-muted size-full" />
          )}
          <div className="from-black/55 via-black/20 absolute inset-0 bg-gradient-to-t to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2.5">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="text-white/85 text-xs tabular-nums">
              {TYPE_LABELS[warehouseType]} · {productCount.toLocaleString()} products
              {utilization !== null && <span className={cn("ml-1")}>· {utilization}% util</span>}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
