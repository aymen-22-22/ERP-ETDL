import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfigurableProducts } from "@/features/configurable/hooks";
import { formatMoney, toCents } from "@/lib/money";

/**
 * Admin side of configurable products: the list of everything the shop can
 * offer as "pick your support, motif, length and colour", each linking to its
 * definition editor.
 *
 * A product must already exist as a CONFIGURABLE product (created through
 * /configurable/new) before it can carry a definition here — the definition
 * only gives meaning to an existing product row.
 */
export function ConfigurableProductsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useConfigurableProducts();

  return (
    <PageShell size="content">
      <PageHeader
        title="Configurable products"
        description="Sold by options — support, motif, length and colour — with a price per length."
        actions={
          <Button onClick={() => void navigate("/configurable/new")}>
            <PlusIcon />
            New configurable product
          </Button>
        }
        actionsOnMobile
      />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ChevronRightIcon}
          title="No configurable products yet"
          description="Create a product like “Triangle Double 28/19”, then define its options, per-length prices and recipe."
          action={{
            label: "New configurable product",
            onClick: () => void navigate("/configurable/new"),
          }}
        />
      ) : (
        <ul className="flex list-none flex-col gap-3">
          {data.map((item) => (
            <li key={item.product_id}>
              <Link
                to={`/configurable/${item.product_id}`}
                className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-4 rounded-md border p-4 outline-none focus-visible:ring-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{item.name}</p>
                    {item.has_definition ? (
                      <Badge variant="secondary">Configured</Badge>
                    ) : (
                      <Badge variant="outline">No definition</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-sm">{item.sku}</p>
                </div>
                <div className="text-right">
                  {item.price_from !== null && (
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(toCents(item.price_from))}
                      <span className="text-muted-foreground font-normal"> from</span>
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {item.has_definition ? "Edit" : "Configure"}
                  </p>
                </div>
                <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
