import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

interface ListCardProps {
  title: ReactNode;
  /** Secondary line — SKU, code, route, etc. */
  subtitle?: ReactNode;
  /** Badges or status chips, shown under the subtitle. */
  meta?: ReactNode;
  /** Right-aligned value, e.g. a price or quantity. */
  trailing?: ReactNode;
  /** Makes the whole card a link. Adds a chevron affordance. */
  to?: string;
  /** Actions row pinned to the bottom of the card. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The mobile counterpart to a table row. The entire card is the tap target
 * (comfortably past the 44px floor), with the chevron signalling navigation.
 *
 * `actions` renders outside the link so buttons inside a card don't trigger
 * navigation when tapped.
 */
function ListCard({ title, subtitle, meta, trailing, to, actions, className }: ListCardProps) {
  const body = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle && <p className="text-muted-foreground mt-0.5 truncate text-sm">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right text-sm tabular-nums">{trailing}</div>}
      {to && <ChevronRightIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
    </div>
  );

  return (
    <div
      className={cn(
        // Structure comes from the border, not a shadow — flatter and more
        // document-like, which is the classic-professional read.
        "bg-card rounded-md border transition-colors",
        to && "hover:border-foreground/30 active:bg-accent",
        className,
      )}
    >
      {to ? (
        <Link to={to} className="block p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-lg">
          {body}
        </Link>
      ) : (
        <div className="p-4">{body}</div>
      )}
      {actions && (
        <div className="flex items-center gap-2 border-t px-4 py-2">{actions}</div>
      )}
    </div>
  );
}

export { ListCard };
