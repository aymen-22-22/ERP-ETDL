import { ChevronRightIcon, FolderIcon } from "lucide-react";

import { resolveProductImageUrl } from "@/features/products/api";
import type { CategoryTreeNode } from "@/features/categories/api";
import { cn } from "@/lib/utils";

/** Soft grey placeholder tile for categories. Category images aren't on the
 * API yet, so a neutral folder tile stands in until they are — kept
 * monochrome so placeholder tints never compete with real photos. */
const PASTELS = [
  "bg-muted text-muted-foreground",
  "bg-secondary text-secondary-foreground",
  "bg-accent text-muted-foreground",
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
