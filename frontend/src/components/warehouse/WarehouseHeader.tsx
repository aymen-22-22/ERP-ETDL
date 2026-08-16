import { ArrowLeftIcon, EllipsisVerticalIcon, ImageIcon, ImageOffIcon } from "lucide-react";
import { useRef } from "react";
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
  onUploadPhoto?: ((file: File) => void) | undefined;
  onRemovePhoto?: (() => void) | undefined;
}

/** Detail-page header: back navigation, the warehouse name, and overflow
 * actions (upload photo / set default / delete) tucked into a kebab menu so
 * the title row stays clean. */
export function WarehouseHeader({
  warehouse,
  onSetDefault,
  onDelete,
  onUploadPhoto,
  onRemovePhoto,
}: WarehouseHeaderProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          {onUploadPhoto && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                fileInputRef.current?.click();
              }}
            >
              <ImageIcon className="size-4" />
              {warehouse.image_url ? "Change photo" : "Upload photo"}
            </DropdownMenuItem>
          )}
          {warehouse.image_url && onRemovePhoto && (
            <DropdownMenuItem onClick={onRemovePhoto}>
              <ImageOffIcon className="size-4" />
              Remove photo
            </DropdownMenuItem>
          )}
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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && onUploadPhoto) onUploadPhoto(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
