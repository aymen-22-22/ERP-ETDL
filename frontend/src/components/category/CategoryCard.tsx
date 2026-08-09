import { ChevronRightIcon, FolderIcon } from "lucide-react";

import { resolveProductImageUrl } from "@/features/products/api";
import type { CategoryTreeNode } from "@/features/categories/api";
import { cn } from "@/lib/utils";

/** Soft pastel tints for category placeholders. Each category gets a stable
 * tint derived from its name, so a category looks the same across screens. */
const PASTELS = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

interface CategoryCardProps {
  category: CategoryTreeNode;
  productCount?: number;
  imageUrl?: string | null;
  onClick?: () => void;
}

/** Image-led card for a category inside the warehouse browser. Category
 * images aren't on the API yet, so a deterministic pastel folder tile stands
 * in until they are. */
export function CategoryCard({ category, productCount, imageUrl, onClick }: CategoryCardProps) {
  const pastel = PASTELS[hashName(category.name) % PASTELS.length];
  const resolved = resolveProductImageUrl(imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group bg-card flex h-full flex-col overflow-hidden rounded-2xl border text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {resolved ? (
          <img
            src={resolved}
            alt={category.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className={cn("flex size-full items-center justify-center", pastel)}>
            <FolderIcon className="size-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{category.name}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {productCount?.toLocaleString() ?? "—"} products
          </p>
        </div>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
      </div>
    </button>
  );
}
