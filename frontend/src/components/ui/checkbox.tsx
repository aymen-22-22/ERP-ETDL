import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Hand-rolled on a native `<input type="checkbox">` rather than pulling in
 * `@radix-ui/react-checkbox`, matching the call already made for tabs and
 * separator: a checkbox needs no focus management or portalling, and
 * `accent-color` styles the native control in every browser we target.
 *
 * Native also means the label association, keyboard toggle and screen-reader
 * semantics come for free, which a div-based reimplementation has to rebuild.
 */
export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        // 20px hit area at the control itself; rows add their own padding to
        // reach a 44px touch target.
        "border-input accent-primary size-5 shrink-0 cursor-pointer rounded border",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
