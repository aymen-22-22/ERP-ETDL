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
      <div className="grid grid-cols-2 gap-3">
        {warehouses.slice(0, 4).map((warehouse) => (
          <WarehouseCard key={warehouse.id} {...warehouse} />
        ))}
      </div>
    </section>
  );
}
