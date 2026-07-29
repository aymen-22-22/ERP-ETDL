import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function SyncStatusIndicator() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        online ? "text-muted-foreground" : "text-destructive",
      )}
      title={online ? "Online" : "Offline"}
    >
      <span className={cn("inline-block size-2 rounded-full", online ? "bg-green-500" : "bg-destructive")} />
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
    </div>
  );
}
