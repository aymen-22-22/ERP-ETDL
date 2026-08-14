import type { DashboardCategory } from "../types";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { SectionHeader } from "./SectionHeader";

interface TopCategoriesProps {
  categories: DashboardCategory[];
}

export function TopCategories({ categories }: TopCategoriesProps) {
  if (categories.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Top Categories" seeAllTo="/categories" />
        <DashboardEmptyState
          title="No categories yet"
          description="Add categories to organize your products."
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Top Categories" seeAllTo="/categories" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {categories.map((category) => (
          <div key={category.id} className="w-32 shrink-0">
            <div className="bg-card relative overflow-hidden rounded-xl border shadow-sm">
              <div className="relative aspect-video overflow-hidden">
                {category.imageUrl ? (
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="bg-muted size-full" />
                )}
              </div>
            </div>
            <p className="mt-1 truncate text-xs font-medium">{category.name}</p>
            <p className="text-muted-foreground text-[11px] leading-4">
              {category.productCount} products
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
