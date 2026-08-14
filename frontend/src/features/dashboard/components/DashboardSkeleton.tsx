import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for the whole dashboard. Each block mirrors the final
 * layout's dimensions so nothing jumps when data arrives. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-2 sm:gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr))]">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="bg-card flex h-24 flex-col justify-between rounded-xl border p-2.5 sm:h-28 sm:rounded-2xl sm:p-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-1.5 sm:gap-2 [grid-template-columns:repeat(4,minmax(0,1fr))]">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl sm:h-20" />
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-[16/9] rounded-xl sm:rounded-2xl" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </div>

      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-32 shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
