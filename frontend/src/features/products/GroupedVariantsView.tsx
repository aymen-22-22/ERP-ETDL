import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

import type { GroupedVariant, GroupedVariantColor } from "./api";

/** Whatever attribute values actually differ within the group ("Argent", or
 * "Dorre 19mm" if two axes vary) — the same rule the recipe picker uses to
 * label a colour, so the two screens read consistently. */
function colorLabel(color: GroupedVariantColor, group: GroupedVariantColor[]): string {
  const keys = Object.keys(color.attributes);
  const varying = keys.filter((key) => new Set(group.map((c) => c.attributes[key] ?? "")).size > 1);
  const label = varying.map((key) => color.attributes[key]).join(" ");
  return label || color.sku;
}

interface GroupedVariantsViewProps {
  groups: GroupedVariant[] | undefined;
}

/**
 * "4 clean products, colours inside each" instead of a flat list of eleven
 * near-duplicate names. Each colour is still its own product underneath (that
 * is what gives it independent stock), so it links to its own detail page for
 * editing — this view is a read layout, not a new place to edit from.
 */
export function GroupedVariantsView({ groups }: GroupedVariantsViewProps) {
  if (groups === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No variants in this category yet.
      </p>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-4">
      {groups.map((group) => (
        <li key={group.name} className="rounded-md border">
          <div className="flex items-center justify-between border-b p-3">
            <span className="font-medium">{group.name}</span>
            <Badge variant="secondary">{group.total_quantity} pcs total</Badge>
          </div>
          <ul className="flex list-none flex-col divide-y">
            {group.colors.map((color) => (
              <li key={color.product_id}>
                <Link
                  to={`/products/${color.product_id}`}
                  className="hover:bg-accent flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-24 flex-1 truncate font-medium">
                    {colorLabel(color, group.colors)}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">{color.sku}</span>
                  <span className="tabular-nums">{color.price}</span>
                  {color.stock.map((row) => (
                    <span key={row.warehouse_id} className="text-muted-foreground text-xs">
                      {row.warehouse_name}: <span className="tabular-nums">{row.quantity}</span>
                    </span>
                  ))}
                  <Badge variant="outline" className="ml-auto shrink-0">
                    {color.total_quantity} pcs
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
