import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, PlusIcon, StarIcon, WarehouseIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useCreateWarehouseMutation,
  useSetDefaultWarehouseMutation,
  useWarehouses,
} from "@/features/warehouses/hooks";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  warehouseType: z.enum(["depot", "store", "transit", "return"]),
  isActive: z.boolean(),
  allowSales: z.boolean(),
  allowPurchases: z.boolean(),
  allowTransfers: z.boolean(),
  allowNegativeStock: z.boolean(),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm";

export function WarehouseListPage() {
  const { data: warehouses, isLoading, isError, refetch } = useWarehouses();
  const [sheetOpen, setSheetOpen] = useState(false);
  const createMutation = useCreateWarehouseMutation();
  const setDefaultMutation = useSetDefaultWarehouseMutation();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      warehouseType: "depot",
      isActive: true,
      allowSales: true,
      allowPurchases: true,
      allowTransfers: true,
      allowNegativeStock: false,
    },
  });

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        setSheetOpen(false);
        reset();
      },
    });
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Warehouses</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <PlusIcon />
          {!isDesktop ? "" : "New warehouse"}
        </Button>
      </div>

      {isLoading && <TableLoader rows={4} columns={4} />}

      {!isLoading && isError && (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load warehouses"
          description="Something went wrong fetching your warehouses. Check your connection and try again."
          action={{ label: "Retry", onClick: () => void refetch() }}
        />
      )}

      {!isLoading && !isError && warehouses?.length === 0 && (
        <EmptyState
          icon={WarehouseIcon}
          title="No warehouses yet"
          description="Add a location to start tracking stock there."
          action={{ label: "New warehouse", onClick: () => setSheetOpen(true) }}
        />
      )}

      {!isLoading && warehouses !== undefined && warehouses.length > 0 && (
        <>
          {/* Desktop table */}
          {isDesktop && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Flags</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => (
                    <tr key={w.id} className="hover:bg-accent/50 border-t">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/warehouses/${w.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {w.name}
                          </Link>
                          {w.is_default && (
                            <Badge variant="secondary">
                              <StarIcon className="mr-1 size-3" />
                              Default
                            </Badge>
                          )}
                        </div>
                        {w.code && <span className="text-muted-foreground text-xs">{w.code}</span>}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 capitalize">
                        {w.warehouse_type}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={w.is_active ? "default" : "outline"}>
                          {w.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-2 text-xs">
                        {[
                          w.allow_sales && "Sales",
                          w.allow_purchases && "Purchases",
                          w.allow_transfers && "Transfers",
                          w.allow_negative_stock && "Negative stock",
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!w.is_default && w.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultMutation.mutate(w.id)}
                          >
                            Set default
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile cards */}
          {!isDesktop && (
            <div className="flex flex-col gap-3">
              {warehouses.map((w) => (
                <Link key={w.id} to={`/warehouses/${w.id}`}>
                  <Card className="hover:border-primary/50 transition-colors">
                    <CardContent className="flex items-start justify-between p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{w.name}</span>
                          {w.is_default && (
                            <Badge variant="secondary" className="text-xs">
                              <StarIcon className="mr-0.5 size-2.5" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs capitalize">
                          {w.warehouse_type}
                          {w.code ? ` · ${w.code}` : ""}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {w.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {!w.is_default && w.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={(e) => {
                            e.preventDefault();
                            setDefaultMutation.mutate(w.id);
                          }}
                        >
                          Set default
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New warehouse</SheetTitle>
          </SheetHeader>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="Optional" {...register("code")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouseType">Type</Label>
              <select id="warehouseType" className={selectClass} {...register("warehouseType")}>
                <option value="depot">Depot</option>
                <option value="store">Store</option>
                <option value="transit">Transit</option>
                <option value="return">Return</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("isActive")} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("allowSales")} />
                Allow sales
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("allowPurchases")} />
                Allow purchases
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("allowTransfers")} />
                Allow transfers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("allowNegativeStock")} />
                Allow negative stock
              </label>
            </div>

            <SheetFooter className="px-0">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving…" : "Create warehouse"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
