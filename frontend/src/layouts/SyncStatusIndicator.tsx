import { AlertTriangleIcon, CheckCircle2Icon, CloudOffIcon, RefreshCwIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/offline/useOfflineSync";
import type { SyncStatus } from "@/offline/useOfflineSync";

const STATUS_CONFIG: Record<SyncStatus, { icon: LucideIcon; label: string; className: string }> = {
  offline: { icon: CloudOffIcon, label: "Offline", className: "text-muted-foreground" },
  syncing: { icon: RefreshCwIcon, label: "Syncing", className: "text-foreground" },
  error: { icon: AlertTriangleIcon, label: "Sync error", className: "text-destructive" },
  idle: { icon: CheckCircle2Icon, label: "Online", className: "text-muted-foreground" },
};

export function SyncStatusIndicator() {
  const { status, pendingCount, conflictCount, syncNow } = useOfflineSync();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const showPending = pendingCount > 0 && status === "idle";
  const isSyncing = status === "syncing";

  const handleSync = () => {
    void syncNow().then((result) => {
      if (!result) {
        toast({
          title: "Can't sync",
          description: "You're offline. Changes will send when you reconnect.",
        });
        return;
      }
      const { pushed, pulled } = result;
      toast({
        title: pushed || pulled ? "Synced" : "Up to date",
        description:
          pushed || pulled ? `${pushed} sent · ${pulled} received` : "No changes to sync.",
      });
    });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        // The background drain runs every 30s; this is the manual override for
        // "I just changed something on my phone and want it here now".
        title="Sync now"
        aria-label="Sync now"
        className={cn(
          "flex min-h-9 items-center gap-1.5 rounded-md px-2 font-medium transition-colors",
          "hover:bg-accent focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
          "disabled:cursor-default disabled:opacity-70",
          config.className,
        )}
      >
        <Icon className={cn("size-3.5", isSyncing && "animate-spin")} />
        <span className="hidden sm:inline">
          {showPending ? `Pending (${pendingCount})` : config.label}
        </span>
        {/* On a phone the label is dropped, so surface the pending count as a
            digit rather than losing the signal entirely. */}
        {showPending && <span className="sm:hidden">{pendingCount}</span>}
      </button>

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
