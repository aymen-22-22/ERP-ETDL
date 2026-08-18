import { FolderOpenIcon, StoreIcon, TruckIcon, Undo2Icon, WarehouseIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { CardGridSkeleton } from "@/components/CardGridSkeleton";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { CategoryCard } from "@/components/category/CategoryCard";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/PageLoader";
import { ProductImage } from "@/components/ProductImage";
import { WarehouseHeader } from "@/components/warehouse/WarehouseHeader";
import { WarehouseStats } from "@/components/warehouse/WarehouseStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { countProductsInCategory } from "@/features/categories/treeUtils";
import { useCategoryTree } from "@/features/categories/hooks";
import { useWarehouseStock, useWarehouseSummary } from "@/features/inventory/hooks";
import { resolveProductImageUrl } from "@/features/products/api";
import type { WarehouseType } from "@/features/warehouses/api";
import {
  useDeleteWarehouseImageMutation,
  useDeleteWarehouseMutation,
  useSetDefaultWarehouseMutation,
  useUploadWarehouseImageMutation,
  useWarehouses,
} from "@/features/warehouses/hooks";
import { NotFoundPage } from "@/pages/NotFoundPage";

const TYPE_ICONS: Record<WarehouseType, LucideIcon> = {
  depot: WarehouseIcon,
  store: StoreIcon,
  transit: TruckIcon,
  return: Undo2Icon,
};

export function WarehouseDetailPage() {
  const { warehouseId = "" } = useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const warehouse = warehouses?.find((w) => w.id === warehouseId);
  const deleteMutation = useDeleteWarehouseMutation();
  const setDefaultMutation = useSetDefaultWarehouseMutation();
  const uploadImageMutation = useUploadWarehouseImageMutation();
  const deleteImageMutation = useDeleteWarehouseImageMutation();

  const { data: stock } = useWarehouseStock(warehouseId || null);
  const { data: summary, isLoading: summaryLoading } = useWarehouseSummary(warehouseId || null);
  const { data: categoryTree, isLoading: treeLoading } = useCategoryTree();

  const [categorySearch, setCategorySearch] = useState("");

  if (warehousesLoading) return <PageLoader />;
  if (!warehouse) return <NotFoundPage />;

  const handleDelete = () => {
    deleteMutation.mutate(warehouseId, {
      onSuccess: () => {
        void navigate("/warehouses");
      },
    });
  };

  const rootCategories = categoryTree ?? [];
  const imageUrl = resolveProductImageUrl(warehouse.image_url);
  const TypeIcon = TYPE_ICONS[warehouse.warehouse_type];

  const filteredCategories = categorySearch.trim()
    ? rootCategories.filter((c) =>
        c.name.toLowerCase().includes(categorySearch.trim().toLowerCase()),
      )
    : rootCategories;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <WarehouseHeader
        warehouse={warehouse}
        onSetDefault={
          warehouse.is_default ? undefined : () => setDefaultMutation.mutate(warehouseId)
        }
        onDelete={() => setDeleteOpen(true)}
        onUploadPhoto={(file) => uploadImageMutation.mutate({ warehouseId, file })}
        onRemovePhoto={() => deleteImageMutation.mutate(warehouseId)}
      />

      <div className="bg-primary/5 relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border">
        {imageUrl ? (
          <ProductImage
            src={imageUrl}
            alt={warehouse.name}
            className="size-full object-cover"
            fetchPriority="high"
          />
        ) : (
          <TypeIcon className="text-primary/30 size-12" />
        )}
      </div>

      <WarehouseStats summary={summaryLoading ? undefined : summary} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Categories</h2>
          {!treeLoading && stock !== undefined && categoryTree !== undefined && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {rootCategories.length} {rootCategories.length === 1 ? "category" : "categories"}
            </span>
          )}
        </div>

        {treeLoading && <CardGridSkeleton count={4} />}

        {!treeLoading &&
          stock !== undefined &&
          categoryTree !== undefined &&
          (rootCategories.length === 0 ? (
            <EmptyState
              icon={FolderOpenIcon}
              title="No categories yet"
              description="Add categories under Catalog to start organizing stock here."
            />
          ) : (
            <>
              <Input
                placeholder="Search categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="w-full"
              />
              <CategoryGrid>
                {filteredCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    productCount={countProductsInCategory(category.id, categoryTree, stock)}
                    imageUrl={category.image_url ?? null}
                    onClick={() =>
                      void navigate(`/warehouses/${warehouseId}/categories/${category.id}`)
                    }
                  />
                ))}
              </CategoryGrid>
              {filteredCategories.length === 0 && categorySearch.trim() && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No categories match "{categorySearch.trim()}".
                </p>
              )}
            </>
          ))}
      </section>

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
