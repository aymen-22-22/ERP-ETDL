import { LayoutDashboardIcon, SettingsIcon } from "lucide-react";
import { NavLink } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NotificationsBell } from "./NotificationsBell";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

interface TopBarProps {
  showBusinessName?: boolean;
  showMobileNav?: boolean;
}

export function TopBar({ showBusinessName = false, showMobileNav = false }: TopBarProps) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 items-center justify-between border-b px-4">
      {showBusinessName ? (
        <NavLink to="/" end className="text-sm font-semibold">
          Your Business
        </NavLink>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        {showMobileNav && (
          <>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "icon" }),
                  "size-9",
                )
              }
              aria-label="Dashboard"
            >
              <LayoutDashboardIcon className="size-5" />
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "icon" }),
                  "size-9",
                )
              }
              aria-label="Settings"
            >
              <SettingsIcon className="size-5" />
            </NavLink>
          </>
        )}
        <NotificationsBell />
        <SyncStatusIndicator />
      </div>
    </header>
  );
}
