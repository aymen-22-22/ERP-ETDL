import { ArrowLeftIcon, PackageOpenIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { CardGridSkeleton } from "@/components/CardGridSkeleton";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { CategoryCard } from "@/components/category/CategoryCard";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/PageLoader";
import { ProductCard } from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import {
  findCategoryNode,
  productsInCategory,
  countProductsInCategory,
} from "@/features/categories/treeUtils";
import { useCategoryTree } from "@/features/categories/hooks";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";
import { NotFoundPage } from "@/pages/NotFoundPage";

/** Leaf level of the warehouse browser. Categories with children drill one
 * level deeper; a category with no children lists its stock as compact
 * product cards. Products link straight through to their detail page. */
export function WarehouseCategoryPage() {
  const { warehouseId = "", categoryId = "" } = useParams();
  const navigate = useNavigate();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const warehouse = warehouses?.find((w) => w.id === warehouseId);
  const { data: stock, isLoading: stockLoading } = useWarehouseStock(warehouseId || null);
  const { data: categoryTree, isLoading: treeLoading } = useCategoryTree();

  if (warehousesLoading) return <PageLoader />;
  if (!warehouse) return <NotFoundPage />;

  const tree = categoryTree ?? [];
  const category = findCategoryNode(categoryId, tree);

  if (!treeLoading && !category) return <NotFoundPage />;
  if (!category) return <PageLoader />;

  const children = category.children;
  const hasChildren = children.length > 0;
  const products = stock ? productsInCategory(categoryId, tree, stock) : [];
  const totalProducts = stock ? countProductsInCategory(categoryId, tree, stock) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to categories"
          className="text-muted-foreground -ml-2 shrink-0"
          onClick={() => void navigate(`/warehouses/${warehouseId}`)}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{category.name}</h1>
          {stock !== undefined && categoryTree !== undefined && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {totalProducts?.toLocaleString() ?? "…"} products in {warehouse.name.toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {(treeLoading || stockLoading) && <CardGridSkeleton count={4} />}

      {!treeLoading && stock !== undefined && hasChildren && (
        <CategoryGrid>
          {children.map((child) => (
            <CategoryCard
              key={child.id}
              category={child}
              productCount={countProductsInCategory(child.id, tree, stock)}
              onClick={() => void navigate(`/warehouses/${warehouseId}/categories/${child.id}`)}
            />
          ))}
        </CategoryGrid>
      )}

      {!treeLoading &&
        !stockLoading &&
        stock !== undefined &&
        !hasChildren &&
        (products.length === 0 ? (
          <EmptyState
            icon={PackageOpenIcon}
            title="No products in this category"
            description="This category has no stock at this warehouse yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {products.map((item) => (
              <ProductCard key={item.product_id} item={item} />
            ))}
          </div>
        ))}
    </div>
  );
}
