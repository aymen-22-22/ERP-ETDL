import type { ReactNode } from "react";

import { TableLoader } from "@/components/TableLoader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  /** Stable key for React and for `hidden` lookups. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Extra classes for the body cell (e.g. `tabular-nums`). */
  className?: string;
  /** Drop this column on narrower desktops where space is tight. */
  hideBelowLg?: boolean;
}

interface DataViewProps<T> {
  /** `undefined` means loading — anything else renders, including `[]`. */
  rows: T[] | undefined;
  columns: DataColumn<T>[];
  keyExtractor: (row: T) => string;
  /** The mobile representation of a row. Use `ListCard` for the standard look. */
  renderCard: (row: T) => ReactNode;
  /** Shown when `rows` is an empty array. */
  empty?: ReactNode;
  skeletonRows?: number;
  className?: string;
}

/**
 * Renders a collection as a real `<table>` at `md`+ and as stacked cards below.
 *
 * This is the fix for the app's biggest mobile problem: five pages each drew
 * their own raw `<table>` with no horizontal scroll and no small-screen
 * fallback, which is unusable on a phone. Rather than making tables scroll
 * sideways — which hides data and feels broken — the same rows are rendered in
 * a card shape that actually fits a 375px viewport.
 *
 * Both representations come from one data definition, so the two can't drift.
 */
function DataView<T>({
  rows,
  columns,
  keyExtractor,
  renderCard,
  empty,
  skeletonRows = 5,
  className,
}: DataViewProps<T>) {
  if (rows === undefined) {
    return (
      <div className={className}>
        <div className="flex flex-col gap-3 md:hidden">
          {Array.from({ length: skeletonRows }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="hidden md:block">
          <TableLoader rows={skeletonRows} columns={columns.length} />
        </div>
      </div>
    );
  }

  if (rows.length === 0) return <>{empty ?? null}</>;

  return (
    <div className={className}>
      {/* Mobile: one card per record */}
      <ul className="flex list-none flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={keyExtractor(row)}>{renderCard(row)}</li>
        ))}
      </ul>

      {/* Desktop: a real table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.hideBelowLg && "hidden lg:table-cell",
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={keyExtractor(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.align === "right" && "text-right",
                      column.hideBelowLg && "hidden lg:table-cell",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export { DataView };
