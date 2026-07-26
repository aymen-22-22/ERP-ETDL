import { Slot } from "@radix-ui/react-slot";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface FabProps extends React.ComponentProps<"button"> {
  asChild?: boolean;
  /** Accessible name — the FAB is icon-only, so this is required. */
  label: string;
}

/**
 * Floating action button for the primary action on mobile.
 *
 * Sits above the bottom tab bar via the `bottom-nav-offset` utility (tab bar
 * height + the device's safe-area inset), and hides at `md` where the action
 * lives in the page header instead.
 */
function Fab({ className, asChild = false, label, children, ...props }: FabProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="fab"
      aria-label={label}
      className={cn(
        "bottom-nav-offset fixed right-4 z-30 mb-4 inline-flex size-14 items-center justify-center rounded-full shadow-lg transition-transform",
        "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "[&_svg]:size-6 [&_svg]:shrink-0",
        "md:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Fab };
