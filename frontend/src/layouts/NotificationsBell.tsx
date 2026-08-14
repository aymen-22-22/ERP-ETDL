import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/features/notifications/hooks";
import { cn } from "@/lib/utils";

function timeAgo(value: string): string {
  const then = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const { data: page, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = unread ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label="Notifications">
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 p-4 pt-0">
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
            ) : (page?.data.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No notifications yet</p>
            ) : (
              page?.data.map((notification) => {
                const isUnread = !notification.read_at;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      if (isUnread) markRead.mutate(notification.id);
                    }}
                    className={cn(
                      "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                      isUnread
                        ? "hover:bg-accent/50 border-border bg-muted/40"
                        : "border-transparent hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{notification.title}</span>
                      {isUnread && <span className="bg-primary size-2 shrink-0 rounded-full" />}
                    </div>
                    <span className="text-muted-foreground text-sm">{notification.message}</span>
                    <span className="text-muted-foreground text-xs">
                      {timeAgo(notification.created_at)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-between px-4">
          <span className="text-muted-foreground text-xs">
            {unreadCount === 0
              ? "All caught up"
              : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheckIcon className="size-4" />
            Mark all read
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
