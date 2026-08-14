import { BoxesIcon, PackagePlusIcon, ShoppingCartIcon, ArrowLeftRightIcon } from "lucide-react";
import { Link } from "react-router";

import { SectionHeader } from "./SectionHeader";

const ACTIONS = [
  { label: "New Product", to: "/products/new", icon: PackagePlusIcon },
  { label: "Stock Movement", to: "/warehouses", icon: BoxesIcon },
  { label: "New Sale", to: "/sales", icon: ShoppingCartIcon },
  { label: "Transfer Stock", to: "/transfers/new", icon: ArrowLeftRightIcon },
];

export function QuickActions() {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Quick Actions" />
      <div className="mx-auto grid w-full max-w-3xl gap-1.5 sm:gap-2 [grid-template-columns:repeat(4,minmax(0,1fr))]">
        {ACTIONS.map(({ label, to, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            className="bg-card flex h-16 flex-col items-center justify-center gap-1 rounded-xl border shadow-sm transition-colors hover:bg-accent/50 sm:h-20 sm:gap-1.5"
          >
            <Icon className="text-primary size-4 sm:size-5" />
            <span className="text-center text-[11px] leading-3 font-medium sm:text-xs sm:leading-4">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
