import { NavLink } from "react-router";

import { cn } from "@/lib/utils";

import { mobileNavItems } from "./navItems";

export function MobileBottomNav() {
  return (
    <nav
      className={cn(
        "bg-background fixed inset-x-0 bottom-0 z-40 flex border-t",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium",
              isActive ? "text-primary" : "text-muted-foreground",
            )
          }
        >
          <item.icon className="size-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
