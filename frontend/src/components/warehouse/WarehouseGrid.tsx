import type { ReactNode } from "react";

/** Dense two-column grid on phones (the spec's default rhythm), widening on
 * larger screens. Children are typically image-led cards. */
export function WarehouseGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
