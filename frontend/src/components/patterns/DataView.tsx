import type { ReactNode } from "react";

import { TableLoader } from "@/components/TableLoader";
import { Checkbox } from "@/components/ui/checkbox";
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
  /**
   * Selection. Passing `selectedIds` turns it on; leaving it out keeps every
   * existing caller unchanged.
   *
   * Handled here rather than as a caller-supplied column so the checkbox
   * appears in the mobile cards too — a selection that only worked on the
   * desktop table would be useless on the phone this app is mostly used on.
   */
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (allSelected: boolean) => void;
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
  selectedIds,
  onToggleRow,
  onToggleAll,
}: DataViewProps<T>) {
  const selectable = selectedIds !== undefined && onToggleRow !== undefined;
  const allSelected =
    selectable && rows !== undefined && rows.length > 0
      ? rows.every((row) => selectedIds.has(keyExtractor(row)))
      : false;

  if (rows === undefined) {
    return (
      <div className={className}>
        <div className="flex flex-col gap-3 md:hidden">
          {Array.from({ length: skeletonRows }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="hidden md:block">
          <TableLoader rows={skeletonRows} columns={columns.length + (selectable ? 1 : 0)} />
        </div>
      </div>
    );
  }

  if (rows.length === 0) return <>{empty ?? null}</>;

  return (
    <div className={className}>
      {/* Mobile: one card per record */}
      <ul className="flex list-none flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const id = keyExtractor(row);
          if (!selectable) return <li key={id}>{renderCard(row)}</li>;
          return (
            <li key={id} className="flex items-start gap-3">
              <label className="flex min-h-11 shrink-0 items-center pt-1">
                <span className="sr-only">Select row</span>
                <Checkbox checked={selectedIds.has(id)} onChange={() => onToggleRow(id)} />
              </label>
              <div className="min-w-0 flex-1">{renderCard(row)}</div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: a real table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <label className="flex items-center">
                    <span className="sr-only">Select all</span>
                    <Checkbox checked={allSelected} onChange={() => onToggleAll?.(allSelected)} />
                  </label>
                </TableHead>
              )}
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
                {selectable && (
                  <TableCell className="w-10">
                    <label className="flex items-center">
                      <span className="sr-only">Select row</span>
                      <Checkbox
                        checked={selectedIds.has(keyExtractor(row))}
                        onChange={() => onToggleRow(keyExtractor(row))}
                      />
                    </label>
                  </TableCell>
                )}
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
