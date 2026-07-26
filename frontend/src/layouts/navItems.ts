import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRightIcon,
  LayersIcon,
  LayoutDashboardIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Drives the desktop Sidebar — full navigation list.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboardIcon },
  { label: "Products", path: "/products", icon: PackageIcon },
  { label: "Categories", path: "/categories", icon: LayersIcon },
  { label: "Warehouses", path: "/warehouses", icon: WarehouseIcon },
  { label: "Transfers", path: "/transfers", icon: ArrowLeftRightIcon },
  { label: "Sales", path: "/sales", icon: ShoppingCartIcon },
  { label: "Purchases", path: "/purchases", icon: TruckIcon },
  { label: "Customers", path: "/customers", icon: UsersIcon },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

/**
 * Mobile bottom tab bar — only the 4 core operational modules.
 * Dashboard and Settings are accessible from the TopBar header.
 */
export const mobileNavItems: NavItem[] = [
  { label: "Warehouses", path: "/warehouses", icon: WarehouseIcon },
  { label: "Products", path: "/products", icon: PackageIcon },
  { label: "Transfers", path: "/transfers", icon: ArrowLeftRightIcon },
  { label: "Sales", path: "/sales", icon: ShoppingCartIcon },
];
