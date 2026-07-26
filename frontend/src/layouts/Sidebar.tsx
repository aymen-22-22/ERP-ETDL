import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import { NavLink } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoutMutation } from "@/features/auth/hooks";
import { useSelectedWarehouseId } from "@/features/warehouses/hooks";
import { WarehouseSelector } from "@/features/warehouses/WarehouseSelector";
import { cn } from "@/lib/utils";
import { useWarehouseStore } from "@/store/warehouseStore";

import { navItems } from "./navItems";

export function Sidebar() {
  const logoutMutation = useLogoutMutation();
  const selectedWarehouseId = useSelectedWarehouseId();
  const setSelectedWarehouseId = useWarehouseStore((s) => s.setSelectedWarehouseId);

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r">
      <div className="flex flex-col gap-2 px-4 py-5">
        {/* Placeholder until Milestone 1 provides real tenant/store data */}
        <span className="text-sm font-semibold">Your Business</span>
        <WarehouseSelector
          value={selectedWarehouseId}
          onChange={setSelectedWarehouseId}
          className="text-xs"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
            <Avatar className="size-7">
              <AvatarFallback>
                <UserIcon className="size-4" />
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-left">Account</span>
            <ChevronsUpDownIcon className="text-muted-foreground size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem variant="destructive" onClick={() => logoutMutation.mutate()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
