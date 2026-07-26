/**
 * Money helpers for the point of sale.
 *
 * Amounts are handled as integer **cents** throughout the cart. Summing
 * floating-point prices drifts (0.1 + 0.2 !== 0.3), and a till that is a cent
 * out is worse than useless — so the only floating-point step is parsing the
 * product's stored decimal string once, on the way in.
 */

/** Parses a decimal amount ("249.00") into integer cents (24900). */
export function toCents(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Formats cents for display, locale-aware, always two decimals.
 *
 * Intentionally no currency symbol: the system has no per-tenant currency
 * setting, so printing one would be inventing information.
 */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
