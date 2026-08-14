import { Link } from "react-router";

interface DashboardEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
}

/** Compact per-section empty state — keeps the section's place on the page
 * without the full-page EmptyState's large footprint. */
export function DashboardEmptyState({
  title,
  description,
  actionLabel,
  actionTo,
}: DashboardEmptyStateProps) {
  return (
    <div className="bg-card flex flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{description}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="text-primary mt-2 text-sm font-medium">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
