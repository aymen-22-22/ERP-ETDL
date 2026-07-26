import { Loader2Icon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface SpinnerProps extends React.ComponentProps<"svg"> {
  size?: "sm" | "default" | "lg";
}

const sizeClasses = {
  sm: "size-4",
  default: "size-6",
  lg: "size-8",
} as const;

function Spinner({ className, size = "default", ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("text-muted-foreground animate-spin", sizeClasses[size], className)}
      {...props}
    />
  );
}

export { Spinner };
