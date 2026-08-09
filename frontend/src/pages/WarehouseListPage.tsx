import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, PlusIcon, SearchIcon, WarehouseIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { CardGridSkeleton } from "@/components/CardGridSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { WarehouseCard } from "@/components/warehouse/WarehouseCard";
import { WarehouseGrid } from "@/components/warehouse/WarehouseGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWarehouseSummaries } from "@/features/inventory/hooks";
import { useCreateWarehouseMutation, useWarehouses } from "@/features/warehouses/hooks";
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
  const { data: summaries } = useWarehouseSummaries();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const createMutation = useCreateWarehouseMutation();
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

  const visibleWarehouses =
    warehouses?.filter((w) => w.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  const countByWarehouse = new Map(
    (summaries ?? []).map((summary) => [summary.warehouse_id, summary.total_products]),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">Warehouses</h1>
        <Button onClick={() => setSheetOpen(true)} className="shrink-0">
          <PlusIcon />
          {!isDesktop ? "" : "New warehouse"}
        </Button>
      </div>

      {isLoading && <CardGridSkeleton />}

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

      {!isLoading && !isError && (warehouses?.length ?? 0) > 0 && (
        <>
          {warehouses!.length > 6 && (
            <div className="relative">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search warehouses"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {visibleWarehouses.length === 0 ? (
            <EmptyState
              icon={WarehouseIcon}
              title="No matching warehouses"
              description={`Nothing matched "${search}". Try a different search.`}
            />
          ) : (
            <WarehouseGrid>
              {visibleWarehouses.map((warehouse) => (
                <WarehouseCard
                  key={warehouse.id}
                  warehouse={warehouse}
                  productCount={countByWarehouse.get(warehouse.id)}
                />
              ))}
            </WarehouseGrid>
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
