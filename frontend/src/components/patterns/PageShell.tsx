import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The single page container. Replaces ten hand-written
 * `mx-auto flex max-w-Nxl flex-col gap-4 p-6` strings that had drifted across
 * five different max-widths and used a fixed `p-6` at every breakpoint (far too
 * much padding on a 375px phone).
 *
 *  - `form`    narrow, for single-column forms
 *  - `content` default reading width for lists and detail pages
 *  - `wide`    dense tables and dashboards
 *  - `full`    edge-to-edge, for pages that manage their own width
 */
const sizes = {
  form: "max-w-2xl",
  content: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-none",
} as const;

interface PageShellProps extends React.ComponentProps<"div"> {
  size?: keyof typeof sizes;
}

function PageShell({ size = "content", className, ...props }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "mx-auto flex w-full flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6",
        // Keeps content clear of the mobile tab bar; released at `md` where the
        // sidebar takes over.
        "pb-nav md:pb-6",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export { PageShell };
