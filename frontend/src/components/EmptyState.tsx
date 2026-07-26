import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

/**
 * Reused by every future list view for its "no rows yet" state (e.g. "No
 * products yet", "No sales recorded") instead of each module inventing its
 * own empty-list markup.
 */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className="text-muted-foreground size-10" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
      {children}
    </div>
  );
}
