import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";

import type { DashboardProduct } from "../types";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { SectionHeader } from "./SectionHeader";

interface LowStockSectionProps {
  items: DashboardProduct[];
}

export function LowStockSection({ items }: LowStockSectionProps) {
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Low Stock Items" seeAllTo="/warehouses" />
        <DashboardEmptyState
          title="No low stock"
          description="All items are above their minimum."
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Low Stock Items" seeAllTo="/warehouses" />
      <div className="bg-card flex flex-col divide-y divide-border rounded-2xl border shadow-sm">
        {items.map((item) => (
          <div key={item.id} className="flex h-14 items-center gap-3 px-3">
            <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
              {item.imageUrl ? (
                <ProductImage
                  src={item.imageUrl}
                  alt={item.name}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              {item.categoryName && (
                <p className="text-muted-foreground truncate text-xs">{item.categoryName}</p>
              )}
            </div>
            {item.availableQuantity <= 0 ? (
              <Badge className="bg-red-50 text-red-500 border-red-100">Out of stock</Badge>
            ) : (
              <Badge className="bg-orange-50 text-orange-500 border-orange-100">
                {item.availableQuantity} left
              </Badge>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
