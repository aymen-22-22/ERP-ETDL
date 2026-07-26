import { Suspense } from "react";
import { Outlet } from "react-router";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoader } from "@/components/PageLoader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSyncDrain } from "@/offline/useSyncDrain";

import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function DashboardLayout() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  useSyncDrain();

  return (
    <div className="flex min-h-svh">
      {isDesktop && <Sidebar />}

      <div className="flex flex-1 flex-col">
        <TopBar showBusinessName={!isDesktop} showMobileNav={!isDesktop} />

        <main className="flex-1 pb-16 md:pb-0">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {!isDesktop && <MobileBottomNav />}
    </div>
  );
}
