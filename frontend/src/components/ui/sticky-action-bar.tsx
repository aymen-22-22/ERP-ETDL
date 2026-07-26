import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky bottom bar holding a form's primary actions on mobile, so Save is
 * always reachable without scrolling to the end of a long form.
 *
 * On mobile it's fixed above the tab bar (clearing the safe-area inset); at
 * `md` it relaxes into a normal inline row at the bottom of the form.
 *
 * Pair it with `<div className="pb-24 md:pb-0" />` (or `pb-nav`) at the end of
 * the form so the final field isn't hidden underneath the bar.
 */
function StickyActionBar({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sticky-action-bar"
      className={cn(
        "bottom-nav-offset bg-background/95 fixed inset-x-0 z-20 flex items-center gap-2 border-t p-4 backdrop-blur",
        "supports-[backdrop-filter]:bg-background/80",
        "md:static md:inset-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { StickyActionBar };
