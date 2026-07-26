import type { ReactNode } from "react";

import { StatusDot } from "@/components/patterns/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * Field-level validation message.
 *
 * The text is black like every other label; the error is signalled by a red dot
 * and by `aria-invalid` on the field itself. This keeps the design rule intact
 * — colour never carries meaning through text — while the message stays
 * announced to assistive tech via `role="alert"`.
 */
function FormError({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("flex items-center gap-1.5 text-sm", className)}>
      <StatusDot tone="destructive" />
      {children}
    </p>
  );
}

export { FormError };
