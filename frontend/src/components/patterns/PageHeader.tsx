import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Renders a back button. `true` goes back in history; a string navigates to that path. */
  back?: boolean | string;
  /** Primary/secondary actions. Hidden on mobile when `actionsOnMobile` is false. */
  actions?: ReactNode;
  /**
   * Mobile usually surfaces the primary action as a `Fab` instead, so header
   * actions are hidden below `md` by default. Set true to keep them inline.
   */
  actionsOnMobile?: boolean;
  className?: string;
}

function PageHeader({
  title,
  description,
  back,
  actions,
  actionsOnMobile = false,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === "string") void navigate(back);
    else void navigate(-1);
  };

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {back && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            onClick={goBack}
            className="-ml-2 shrink-0"
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="min-w-0">
          {/* Long product names must wrap rather than push the page sideways. */}
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className={cn("flex shrink-0 items-center gap-2", !actionsOnMobile && "hidden md:flex")}>
          {actions}
        </div>
      )}
    </div>
  );
}

export { PageHeader };
