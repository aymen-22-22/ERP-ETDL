import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for image-led card grids (warehouses, categories). Mirrors
 * the WarehouseGrid/CategoryGrid layout so the page doesn't jump when data
 * arrives. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
