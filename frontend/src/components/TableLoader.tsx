import { Skeleton } from "@/components/ui/skeleton";

interface TableLoaderProps {
  rows?: number;
  columns?: number;
}

/**
 * Loading state for list/table views (Products, Sales, ...) — every future
 * module's list page uses this instead of a bare spinner, so loading tables
 * look consistent across the app.
 */
export function TableLoader({ rows = 5, columns = 4 }: TableLoaderProps) {
  return (
    <div role="status" aria-label="Loading table" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
