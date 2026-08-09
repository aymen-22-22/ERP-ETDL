import type { ReactNode } from "react";

/** Dense two-column grid on phones, widening on larger screens — the same
 * rhythm as warehouse cards so the warehouse browser feels like one surface. */
export function CategoryGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
