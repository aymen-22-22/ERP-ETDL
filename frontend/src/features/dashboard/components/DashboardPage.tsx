import { LayoutDashboardIcon } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/patterns/PageShell";

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

  const shell = "gap-5";

  if (isLoading && !data) {
    return (
      <PageShell size="wide" className={shell}>
        <GreetingSection />
        <DashboardSkeleton />
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell size="wide" className={shell}>
        <GreetingSection />
        <EmptyState
          icon={LayoutDashboardIcon}
          title="Couldn't load the dashboard"
          description="Something went wrong fetching your numbers. Pull to refresh or try again."
        />
      </PageShell>
    );
  }

  return (
    <PageShell size="wide" className={shell}>
      <GreetingSection />
      <KpiGrid kpis={data.kpis} />
      <QuickActions />
      <WarehouseOverview warehouses={data.warehouses} />
      <LowStockSection items={data.lowStockItems} />
      <RecentSalesSection sales={data.recentSales} />
      <TopCategories categories={data.topCategories} />
    </PageShell>
  );
}
