import { LayoutDashboardIcon, SettingsIcon } from "lucide-react";
import { NavLink } from "react-router";

import { Button } from "@/components/ui/button";

import { SyncStatusIndicator } from "./SyncStatusIndicator";

interface TopBarProps {
  showBusinessName?: boolean;
  showMobileNav?: boolean;
}

export function TopBar({ showBusinessName = false, showMobileNav = false }: TopBarProps) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 items-center justify-between border-b px-4">
      {showBusinessName ? (
        <span className="text-sm font-semibold">Your Business</span>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        {showMobileNav && (
          <>
            <NavLink to="/" end>
              {({ isActive }) => (
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="icon"
                  className="size-9"
                  aria-label="Dashboard"
                >
                  <LayoutDashboardIcon className="size-5" />
                </Button>
              )}
            </NavLink>
            <NavLink to="/settings">
              {({ isActive }) => (
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="icon"
                  className="size-9"
                  aria-label="Settings"
                >
                  <SettingsIcon className="size-5" />
                </Button>
              )}
            </NavLink>
          </>
        )}
        <SyncStatusIndicator />
      </div>
    </header>
  );
}
