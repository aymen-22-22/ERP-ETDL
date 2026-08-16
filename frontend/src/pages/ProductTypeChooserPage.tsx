import { BoxIcon, ChevronRightIcon, LayersIcon, PuzzleIcon } from "lucide-react";
import { Link } from "react-router";

import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";

/**
 * Step one of adding a product: which of the three kinds is it?
 *
 * Asked up front rather than as a dropdown inside one giant form, because the
 * three kinds barely overlap — a kit has a recipe and no stock of its own, a
 * variable product is a grid of generated rows, and only a simple product is
 * the plain "name, price, stock" case. One form trying to be all three would
 * hide most of its fields most of the time.
 */
const TYPES = [
  {
    to: "/products/new/simple",
    icon: BoxIcon,
    title: "Simple product",
    subtitle: "Sold as-is, with its own stock",
    examples: "Porte Chaussure 3 étages · Lustre Moderne 1 Lampe · Rail Simple 2m",
  },
  {
    to: "/products/generate",
    icon: LayersIcon,
    title: "Variable product",
    subtitle: "One base name, many generated variations",
    examples: "Tube 28 2m Torsadi Argent · Motif Cristal · Support · Bouchon",
  },
  {
    to: "/products/new/kit",
    icon: PuzzleIcon,
    title: "Kit",
    subtitle: "Assembled from components; holds no stock itself",
    examples: "Triangle Fix 4600 DA · Triangle Fix 2300 DA",
  },
] as const;

export function ProductTypeChooserPage() {
  return (
    <PageShell size="form">
      <PageHeader title="New product" back="/products" />

      <ul className="flex list-none flex-col gap-2">
        {TYPES.map((type) => (
          <li key={type.to}>
            <Link
              to={type.to}
              className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-3 rounded-md border p-3 outline-none focus-visible:ring-2"
            >
              <type.icon className="text-muted-foreground size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{type.title}</p>
                <p className="text-muted-foreground text-xs">{type.subtitle}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">{type.examples}</p>
              </div>
              <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
