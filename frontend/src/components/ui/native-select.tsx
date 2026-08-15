import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Styled native `<select>` — replaces the `selectClass` string that was
 * duplicated across four files.
 *
 * Deliberately native rather than a Radix listbox: on mobile this hands off to
 * the OS picker, which is a far better experience than a custom dropdown (and
 * costs nothing in bundle size). Reach for `SearchableSelect` only when the
 * option list is long enough to need filtering.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    // No `w-full` here: in a form this wrapper is a block element that fills
    // the row anyway, while in a flex row (e.g. a page header) `width:100%`
    // would demand the whole row width and push the page past the viewport.
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "border-input bg-background flex h-11 w-full appearance-none rounded-md border px-3 py-2 pr-9 text-base shadow-xs transition-colors outline-none md:h-9 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
