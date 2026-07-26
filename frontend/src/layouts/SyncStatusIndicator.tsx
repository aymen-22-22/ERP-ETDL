import { AlertTriangleIcon, CheckCircle2Icon, CloudOffIcon, RefreshCwIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/offline/useOfflineSync";
import type { SyncStatus } from "@/offline/useOfflineSync";

const STATUS_CONFIG: Record<SyncStatus, { icon: LucideIcon; label: string; className: string }> = {
  offline: { icon: CloudOffIcon, label: "Offline", className: "text-muted-foreground" },
  syncing: { icon: RefreshCwIcon, label: "Syncing", className: "text-primary" },
  error: { icon: AlertTriangleIcon, label: "Sync error", className: "text-destructive" },
  idle: { icon: CheckCircle2Icon, label: "Online", className: "text-muted-foreground" },
};

export function SyncStatusIndicator() {
  const { status, pendingCount, conflictCount } = useOfflineSync();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const showPending = pendingCount > 0 && status === "idle";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("flex items-center gap-1.5 font-medium", config.className)}>
        <Icon className={cn("size-3.5", status === "syncing" && "animate-spin")} />
        {showPending ? `Pending (${pendingCount})` : config.label}
      </span>
      {conflictCount > 0 && (
        <Link to="/conflicts">
          <Badge variant="destructive" className="cursor-pointer hover:opacity-80">
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
          </Badge>
        </Link>
      )}
    </div>
  );
}
