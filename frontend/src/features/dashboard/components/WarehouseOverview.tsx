import type { DashboardWarehouse } from "../types";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { SectionHeader } from "./SectionHeader";
import { WarehouseCard } from "./WarehouseCard";

interface WarehouseOverviewProps {
  warehouses: DashboardWarehouse[];
}

export function WarehouseOverview({ warehouses }: WarehouseOverviewProps) {
  if (warehouses.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Warehouses Overview" seeAllTo="/warehouses" />
        <DashboardEmptyState
          title="No warehouses yet"
          description="Create a warehouse to start tracking stock."
          actionLabel="Create a warehouse"
          actionTo="/warehouses"
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Warehouses Overview" seeAllTo="/warehouses" />
      <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:pb-0 lg:mx-auto lg:max-w-3xl lg:grid-cols-4">
        {warehouses.slice(0, 4).map((warehouse) => (
          <div key={warehouse.id} className="w-64 shrink-0 snap-start sm:w-auto">
            <WarehouseCard {...warehouse} />
          </div>
        ))}
      </div>
    </section>
  );
}
