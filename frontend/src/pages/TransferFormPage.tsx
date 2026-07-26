import { ArrowRightIcon, MinusIcon, PlusIcon, TruckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import { useCreateTransferMutation } from "@/features/transfers/hooks";

export function TransferFormPage() {
  const navigate = useNavigate();
  const { data: warehouses, isLoading: whLoading } = useWarehouses();
  const createMutation = useCreateTransferMutation();

  const depot = warehouses?.find((w) => w.warehouse_type === "depot" && w.is_active);
  const store = warehouses?.find((w) => w.warehouse_type === "store" && w.is_active);

  const sourceId = depot?.id ?? null;
  const destId = store?.id ?? null;

  const { data: depotStock, isLoading: stockLoading } = useWarehouseStock(sourceId);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const stockItems = useMemo(() => {
    if (!depotStock) return [];
    return depotStock.filter((item) => item.quantity_on_hand > 0);
  }, [depotStock]);

  const setQty = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, Math.min(delta === -1 ? current : current + delta, 9999));
      return { ...prev, [productId]: next };
    });
  };

  const lines = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [quantities],
  );

  const canSubmit = sourceId && destId && sourceId !== destId && lines.length > 0;

  const submit = () => {
    if (!canSubmit || !sourceId || !destId) return;
    createMutation.mutate(
      { sourceWarehouseId: sourceId, destWarehouseId: destId, note: "Daily restock", lines },
      { onSuccess: () => void navigate("/transfers") },
    );
  };

  if (whLoading || stockLoading) return <PageLoader />;

  if (!depot || !store) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TruckIcon className="mx-auto mb-4 size-10 opacity-40" />
            <p>
              You need both a <strong>Depot</strong> and a <strong>Store</strong> warehouse to use
              daily restock.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily Restock</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Transfer products from Depot to Store for today's sales.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-sm">
          {depot.name}
        </Badge>
        <ArrowRightIcon className="size-4 text-muted-foreground" />
        <Badge variant="secondary" className="text-sm">
          {store.name}
        </Badge>
      </div>

      {stockItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No products with stock in the Depot yet. Add inventory first.
          </CardContent>
        </Card>
      )}

      {stockItems.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Products in Depot ({stockItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <span>Product</span>
                  <span className="text-center">In Stock</span>
                  <span className="text-center">Transfer</span>
                </div>
                {stockItems.map((item) => {
                  const qty = quantities[item.product_id] ?? 0;
                  return (
                    <div
                      key={item.product_id}
                      className="grid grid-cols-[1fr_80px_100px] items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.product_name}</p>
                        <p className="text-muted-foreground text-xs">{item.sku}</p>
                      </div>
                      <p className="text-center tabular-nums">{item.quantity_on_hand}</p>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(item.product_id, -1)}
                          disabled={qty === 0}
                        >
                          <MinusIcon className="size-3" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity_on_hand}
                          value={qty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setQuantities((prev) => ({
                              ...prev,
                              [item.product_id]: Number.isFinite(v) ? Math.max(0, v) : 0,
                            }));
                          }}
                          className="h-7 w-14 px-1 text-center text-xs tabular-nums"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(item.product_id, 1)}
                          disabled={qty >= item.quantity_on_hand}
                        >
                          <PlusIcon className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {lines.length} product{lines.length !== 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void navigate("/transfers")}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit || createMutation.isPending}>
                {createMutation.isPending ? "Transferring..." : "Transfer to Store"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
