import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { CategoryBrowser } from "@/components/CategoryBrowser";
import { PageLoader } from "@/components/PageLoader";
import { TableLoader } from "@/components/TableLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCategoryTree } from "@/features/categories/hooks";
import { useWarehouseStock, useWarehouseSummary } from "@/features/inventory/hooks";
import { useDeleteWarehouseMutation, useWarehouses } from "@/features/warehouses/hooks";

export function WarehouseDetailPage() {
  const { warehouseId = "" } = useParams();
  const navigate = useNavigate();
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: warehouses } = useWarehouses();
  const warehouse = warehouses?.find((w) => w.id === warehouseId);
  const deleteMutation = useDeleteWarehouseMutation();

  const { data: stock, isLoading: stockLoading } = useWarehouseStock(warehouseId || null);
  const { data: summary, isLoading: summaryLoading } = useWarehouseSummary(warehouseId || null);
  const { data: categoryTree, isLoading: treeLoading } = useCategoryTree();

  if (!warehouse) return <PageLoader />;

  const handleDelete = () => {
    deleteMutation.mutate(warehouseId, {
      onSuccess: () => navigate("/warehouses"),
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/warehouses" className="text-muted-foreground hover:text-foreground">
              <ArrowLeftIcon className="size-4" />
            </Link>
            <h1 className="text-2xl font-semibold">{warehouse.name}</h1>
            {warehouse.is_default && <Badge variant="secondary">Default</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm capitalize">
            {warehouse.warehouse_type}
            {warehouse.code ? ` · ${warehouse.code}` : ""}
          </p>
        </div>
        {!warehouse.is_default && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon className="mr-1 size-4" />
            Delete
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {summaryLoading ? "..." : (summary?.total_products ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Total Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {summaryLoading ? "..." : (summary?.total_quantity ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {summaryLoading ? "..." : (summary?.low_stock_count ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Inventory</h2>
        {(stockLoading || treeLoading) && <TableLoader rows={5} columns={4} />}
        {!stockLoading && !treeLoading && categoryTree && stock && (
          <CategoryBrowser
            tree={categoryTree}
            stock={stock}
            currentCategoryId={currentCategoryId}
            onSelectCategory={setCurrentCategoryId}
          />
        )}
      </div>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete warehouse</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{warehouse.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
