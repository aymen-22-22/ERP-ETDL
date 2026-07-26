import type * as React from "react";

import { cn } from "@/lib/utils";

interface SeparatorProps extends React.ComponentProps<"div"> {
  orientation?: "horizontal" | "vertical";
  /** Set false when the rule carries meaning rather than being decorative. */
  decorative?: boolean;
}

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      // A purely decorative rule is hidden from assistive tech; a semantic one
      // is announced as a separator.
      {...(decorative ? { role: "none" } : { role: "separator", "aria-orientation": orientation })}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
