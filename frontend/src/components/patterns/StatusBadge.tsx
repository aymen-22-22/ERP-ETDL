import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for status presentation.
 *
 * The badge itself is always neutral — white surface, black label — and the
 * state is carried by a small coloured dot. This keeps every label legible and
 * the interface monochrome, while still letting someone scan a long list and
 * spot the exceptions instantly.
 */

type Tone = "neutral" | "success" | "warning" | "destructive" | "info";

const dotTone: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

function StatusDot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", dotTone[tone], className)}
    />
  );
}

function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Badge variant="status" className="capitalize">
      <StatusDot tone={tone} />
      {label}
    </Badge>
  );
}

const TRANSFER_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending: "warning",
  approved: "info",
  completed: "success",
  cancelled: "destructive",
};

const PRODUCT_TONES: Record<string, Tone> = {
  active: "success",
  draft: "neutral",
  archived: "destructive",
};

function TransferStatusBadge({ status }: { status: string }) {
  return <StatusChip tone={TRANSFER_TONES[status] ?? "neutral"} label={status} />;
}

function ProductStatusBadge({ status }: { status: string }) {
  return <StatusChip tone={PRODUCT_TONES[status] ?? "neutral"} label={status} />;
}

interface StockBadgeProps {
  quantity: number;
  /** Reorder threshold. When known, quantities at or below it read as low. */
  minQuantity?: number | null;
}

/** Stock level as a dot: out of stock, at/below the reorder point, or healthy. */
function StockBadge({ quantity, minQuantity }: StockBadgeProps) {
  if (quantity <= 0) return <StatusChip tone="destructive" label="Out of stock" />;
  if (minQuantity != null && quantity <= minQuantity) {
    return <StatusChip tone="warning" label={`Low · ${quantity}`} />;
  }
  return <StatusChip tone="success" label={`In stock · ${quantity}`} />;
}

export { StatusDot, StatusChip, TransferStatusBadge, ProductStatusBadge, StockBadge };
