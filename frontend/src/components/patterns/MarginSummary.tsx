import { cn } from "@/lib/utils";

interface MarginSummaryProps {
  /** Raw form strings; anything unparseable is treated as "not entered yet". */
  costPrice: string | number | null | undefined;
  sellingPrice: string | number | null | undefined;
  costLabel?: string;
  className?: string;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cost against selling price, with the margin worked out.
 *
 * Shown wherever a price is entered because the brief asks the ERP to
 * calculate the margin — and seeing it while typing is what stops a product
 * being priced below what it cost.
 *
 * Deliberately silent until both numbers exist: a margin of "2500 DA (100%)"
 * because the cost hasn't been typed yet is worse than showing nothing.
 */
export function MarginSummary({
  costPrice,
  sellingPrice,
  costLabel = "Cost",
  className,
}: MarginSummaryProps) {
  const cost = toNumber(costPrice);
  const sell = toNumber(sellingPrice);

  if (cost === null || sell === null) {
    return (
      <p className={cn("text-muted-foreground text-xs", className)}>
        Enter both prices to see the margin.
      </p>
    );
  }

  const margin = sell - cost;
  const pct = sell !== 0 ? (margin / sell) * 100 : 0;
  const loss = margin < 0;

  return (
    <div className={cn("flex flex-col gap-1 rounded-md border p-3 text-sm", className)}>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{costLabel}</span>
        <span className="tabular-nums">{cost.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Selling price</span>
        <span className="tabular-nums">{sell.toFixed(2)}</span>
      </div>
      <div className={cn("flex justify-between font-medium", loss && "text-destructive")}>
        <span>{loss ? "Loss" : "Margin"}</span>
        <span className="tabular-nums">
          {margin.toFixed(2)} ({pct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}
