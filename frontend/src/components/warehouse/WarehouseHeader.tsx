import { ArrowLeftIcon, EllipsisVerticalIcon } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Warehouse } from "@/features/warehouses/api";

interface WarehouseHeaderProps {
  warehouse: Warehouse;
  onSetDefault?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

/** Detail-page header: back navigation, the warehouse name, and overflow
 * actions (set default / delete) tucked into a kebab menu so the title row
 * stays clean. */
export function WarehouseHeader({ warehouse, onSetDefault, onDelete }: WarehouseHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to warehouses"
          className="text-muted-foreground -ml-2 shrink-0"
          onClick={() => void navigate("/warehouses")}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="truncate text-lg font-semibold sm:text-xl">{warehouse.name}</h1>
        {warehouse.is_default && (
          <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
            Default
          </span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Warehouse actions">
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!warehouse.is_default && onSetDefault && (
            <DropdownMenuItem onClick={onSetDefault}>Set as default</DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete warehouse
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
