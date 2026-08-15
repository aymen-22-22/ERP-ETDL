import { ArrowLeftRightIcon, BoxesIcon, PackagePlusIcon, ShoppingCartIcon } from "lucide-react";
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
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:mx-auto lg:max-w-3xl">
        {ACTIONS.map(({ label, to, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            aria-label={label}
            className="bg-card flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl border py-2.5 shadow-sm transition-colors select-none active:bg-accent active:scale-[0.98] hover:bg-accent/50 focus-visible:ring-ring/50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Icon className="text-primary size-4 shrink-0 sm:size-5" aria-hidden="true" />
            <span className="text-center text-[10px] leading-3 font-medium sm:text-[11px]">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
