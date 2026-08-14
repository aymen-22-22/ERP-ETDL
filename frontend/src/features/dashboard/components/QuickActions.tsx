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
      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map(({ label, to, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            className="bg-card flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border shadow-sm transition-colors hover:bg-accent/50"
          >
            <Icon className="text-primary size-5" />
            <span className="text-center text-xs leading-4 font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
