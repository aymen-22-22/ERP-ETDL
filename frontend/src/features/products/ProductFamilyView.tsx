import { ArrowLeftIcon, PaletteIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import type { ProductFamily, ProductFamilyRow } from "@/features/products/api";
import type { VariantScheme } from "@/features/variants/api";

function colorLabel(row: ProductFamilyRow): string {
  return row.color_label || "Base";
}

interface ProductFamilyViewProps {
  family: ProductFamily;
  scheme: VariantScheme | undefined;
  onAddColor: () => void;
}

/**
 * One product as a colour family: "Support Cristal 28/19" is really several
 * Product rows (one per colour, each with its own stock). This is the card
 * view — the name, a Couleur / Dépôt / Store / Total table, and a way to add
 * another colour — so the shop reads and manages one product, not seven.
 * Each colour row still links to its own detail page for movements/editing.
 */
export function ProductFamilyView({ family, scheme, onAddColor }: ProductFamilyViewProps) {
  const warehouseColumns: { id: string; name: string }[] = [];
  for (const row of family.rows) {
    for (const entry of row.stock) {
      if (!warehouseColumns.some((column) => column.id === entry.warehouse_id)) {
        warehouseColumns.push({ id: entry.warehouse_id, name: entry.warehouse_name });
      }
    }
  }

  const columnTotals = new Map<string, number>();
  for (const row of family.rows) {
    for (const entry of row.stock) {
      columnTotals.set(
        entry.warehouse_id,
        (columnTotals.get(entry.warehouse_id) ?? 0) + entry.quantity,
      );
    }
  }

  const quantity = (row: ProductFamilyRow, warehouseId: string) =>
    row.stock.find((entry) => entry.warehouse_id === warehouseId)?.quantity ?? 0;

  const first = family.rows[0];
  const prices = family.rows.map((row) => Number(row.price));
  const uniform = first && Math.min(...prices) === Math.max(...prices);
  const priceText = !first
    ? "—"
    : uniform
      ? first.price
      : `${Math.min(...prices)}–${Math.max(...prices)}`;
  const costText = family.rows.find((row) => row.cost_price !== null)?.cost_price;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/products" className="text-muted-foreground hover:text-foreground">
              <ArrowLeftIcon className="size-4" />
            </Link>
            <h1 className="text-2xl font-semibold">{family.name}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {family.rows.length} colour{family.rows.length === 1 ? "" : "s"} · Prix: {priceText} DA
            {costText ? ` (achat: ${costText} DA)` : ""}
          </p>
        </div>
        {scheme?.color_key && (
          <Button variant="outline" onClick={onAddColor}>
            <PaletteIcon className="mr-1 size-4" />
            Add colour
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Couleur</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              {warehouseColumns.map((column) => (
                <th key={column.id} className="px-4 py-2 text-right font-medium">
                  {column.name}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {family.rows.map((row) => (
              <tr key={row.product_id} className="border-t">
                <td className="px-4 py-2 font-medium">{colorLabel(row)}</td>
                <td className="text-muted-foreground px-4 py-2 text-xs">{row.sku}</td>
                {warehouseColumns.map((column) => (
                  <td key={column.id} className="px-4 py-2 text-right tabular-nums">
                    {quantity(row, column.id)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-medium tabular-nums">
                  {row.total_quantity}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/products/${row.product_id}?view=single`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 border-t">
              <td className="px-4 py-2 font-semibold">TOTAL</td>
              <td />
              {warehouseColumns.map((column) => (
                <td key={column.id} className="px-4 py-2 text-right font-semibold tabular-nums">
                  {columnTotals.get(column.id) ?? 0}
                </td>
              ))}
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {family.total_quantity}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-sm">
        This is one product with {family.rows.length} colour row
        {family.rows.length === 1 ? "" : "s"}; each colour keeps its own stock, so counts never mix.
      </p>
    </div>
  );
}
