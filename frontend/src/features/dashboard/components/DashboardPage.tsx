import { EmptyState } from "@/components/EmptyState";
import { LayoutDashboardIcon } from "lucide-react";

import { useDashboardData } from "../useDashboardData";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { GreetingSection } from "./GreetingSection";
import { KpiGrid } from "./KpiGrid";
import { LowStockSection } from "./LowStockSection";
import { QuickActions } from "./QuickActions";
import { RecentSalesSection } from "./RecentSalesSection";
import { TopCategories } from "./TopCategories";
import { WarehouseOverview } from "./WarehouseOverview";

export function DashboardPage() {
  const { data, isLoading } = useDashboardData();

  const shell = "flex w-full flex-col gap-5 px-4 py-4 pb-nav md:pb-6";

  if (isLoading && !data) {
    return (
      <div className={shell}>
        <GreetingSection />
        <DashboardSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={shell}>
        <GreetingSection />
        <EmptyState
          icon={LayoutDashboardIcon}
          title="Couldn't load the dashboard"
          description="Something went wrong fetching your numbers. Pull to refresh or try again."
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <GreetingSection />
      <KpiGrid kpis={data.kpis} />
      <QuickActions />
      <WarehouseOverview warehouses={data.warehouses} />
      <LowStockSection items={data.lowStockItems} />
      <RecentSalesSection sales={data.recentSales} />
      <TopCategories categories={data.topCategories} />
    </div>
  );
}
