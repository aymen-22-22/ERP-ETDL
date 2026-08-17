import { LayoutDashboardIcon, SettingsIcon } from "lucide-react";
import { NavLink } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { ProductImage } from "@/components/ProductImage";
import { resolveProductThumbUrl } from "@/features/products/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

import { NotificationsBell } from "./NotificationsBell";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

interface TopBarProps {
  showBusinessName?: boolean;
  showMobileNav?: boolean;
}

export function TopBar({ showBusinessName = false, showMobileNav = false }: TopBarProps) {
  const tenantName = useAuthStore((s) => s.tenantName);
  const tenantLogoUrl = useAuthStore((s) => s.tenantLogoUrl);
  const resolvedLogo = resolveProductThumbUrl(tenantLogoUrl);
  const displayName = tenantName || "Your Business";

  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 items-center justify-between border-b px-4">
      {showBusinessName ? (
        <NavLink to="/" end className="flex items-center gap-2 text-sm font-semibold">
          {resolvedLogo ? (
            <ProductImage
              src={resolvedLogo}
              alt={displayName}
              className="size-6 shrink-0 rounded object-contain"
            />
          ) : (
            <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
          {displayName}
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
