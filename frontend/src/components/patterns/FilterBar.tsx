import { SlidersHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  /** Always-visible control, typically the search input. */
  search?: ReactNode;
  /** Secondary controls — inline on desktop, inside a sheet on mobile. */
  children: ReactNode;
  /** Number of non-default filters, shown as a badge on the mobile trigger. */
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}

/**
 * Search stays visible at every size; the remaining filters collapse behind a
 * "Filters" button on mobile so they don't consume half the screen before the
 * user has seen a single result. The badge keeps hidden active filters
 * discoverable — otherwise a filtered-empty list looks like missing data.
 */
function FilterBar({ search, children, activeCount = 0, onClear, className }: FilterBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        {search && <div className="min-w-0 flex-1">{search}</div>}

        <Button
          type="button"
          variant="outline"
          className="shrink-0 md:hidden"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontalIcon />
          Filters
          {activeCount > 0 && (
            <Badge variant="default" className="ml-1 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Desktop: inline */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {children}
        {activeCount > 0 && onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      {/* Mobile: in a sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {children}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => setOpen(false)}>
                Show results
              </Button>
              {activeCount > 0 && onClear && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { FilterBar };
