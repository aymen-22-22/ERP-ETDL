import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // text-base on mobile is deliberate: iOS zooms the viewport when a
        // focused input's font-size is under 16px.
        "border-input flex h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none md:h-9 md:text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
