import { ArrowLeftIcon, PackageIcon, PackageOpenIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { CardGridSkeleton } from "@/components/CardGridSkeleton";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { CategoryCard } from "@/components/category/CategoryCard";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/PageLoader";
import { ProductCard } from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  findCategoryNode,
  productsInCategory,
  countProductsInCategory,
} from "@/features/categories/treeUtils";
import { useCategoryTree } from "@/features/categories/hooks";
import { useWarehouseStock } from "@/features/inventory/hooks";
import { useVariantScheme } from "@/features/variants/hooks";
import { resolveProductImageUrl } from "@/features/products/api";
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
  const { data: scheme } = useVariantScheme(categoryId || null);

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

  const tree = useMemo(() => categoryTree ?? [], [categoryTree]);
  const category = findCategoryNode(categoryId, tree);
  const children = category?.children ?? [];
  const hasChildren = children.length > 0;
  const products = useMemo(
    () => (stock ? productsInCategory(categoryId, tree, stock) : []),
    [stock, categoryId, tree],
  );
  const totalProducts = useMemo(
    () => (stock ? countProductsInCategory(categoryId, tree, stock) : undefined),
    [stock, categoryId, tree],
  );

  // Determine variant category id: if the current category has a scheme, use
  // it; otherwise look for the first variant product's category_id.
  const variantCategoryId = useMemo(() => {
    if (scheme) return categoryId;
    const firstVariant = products.find((p) => p.product_type === "variant");
    return firstVariant?.category_id ?? null;
  }, [scheme, products, categoryId]);

  const { data: detectedScheme } = useVariantScheme(
    variantCategoryId && !scheme ? variantCategoryId : null,
  );
  const activeScheme = scheme ?? detectedScheme;

  // Filter products by search + axis filters
  const filteredProducts = useMemo(() => {
    let result = products;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.product_name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
    }
    for (const [axis, values] of Object.entries(activeFilters)) {
      if (values.length === 0) continue;
      result = result.filter((p) => {
        const val = p.attributes?.[axis];
        return val !== undefined && values.includes(val);
      });
    }
    return result;
  }, [products, search, activeFilters]);

  interface ProductGroup {
    representative: (typeof filteredProducts)[number];
    variantCount: number;
    totalQuantity: number;
  }

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, ProductGroup>();
    const singles: ProductGroup[] = [];
    for (const item of filteredProducts) {
      if (item.product_type === "variant") {
        const existing = groups.get(item.product_name);
        if (existing) {
          existing.representative = item;
          existing.variantCount++;
          existing.totalQuantity += item.quantity_on_hand;
        } else {
          groups.set(item.product_name, {
            representative: item,
            variantCount: 1,
            totalQuantity: item.quantity_on_hand,
          });
        }
      } else {
        singles.push({
          representative: item,
          variantCount: 0,
          totalQuantity: item.quantity_on_hand,
        });
      }
    }
    return [...singles, ...groups.values()];
  }, [filteredProducts]);

  const filterAxes = useMemo(() => {
    if (!activeScheme) return [];
    return activeScheme.attribute_keys
      .filter((key) => key !== activeScheme.color_key)
      .map((key) => ({
        key,
        values: activeScheme.allowed_values[key] ?? [],
      }));
  }, [activeScheme]);

  const toggleFilter = (axis: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[axis] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [axis]: next };
    });
  };

  if (warehousesLoading) return <PageLoader />;
  if (!warehouse) return <NotFoundPage />;
  if (!treeLoading && !category) return <NotFoundPage />;
  if (!category) return <PageLoader />;

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
              imageUrl={child.image_url ?? null}
              onClick={() => void navigate(`/warehouses/${warehouseId}/categories/${child.id}`)}
            />
          ))}
        </CategoryGrid>
      )}

      {!treeLoading && !stockLoading && stock !== undefined && !hasChildren && (
        <>
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />

          {filterAxes.length > 0 && (
            <div className="flex flex-col gap-2">
              {filterAxes.map((axis) => (
                <div key={axis.key} className="flex flex-wrap gap-1.5">
                  <span className="text-muted-foreground mr-1 self-center text-xs font-medium">
                    {axis.key}:
                  </span>
                  {axis.values.map((value) => {
                    const active = (activeFilters[axis.key] ?? []).includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleFilter(axis.key, value)}
                        className={cn(
                          "h-7 shrink-0 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors",
                          "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                          active
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "hover:bg-accent",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={PackageOpenIcon}
              title="No products in this category"
              description="This category has no stock at this warehouse yet."
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
              {groupedProducts.map((group) => (
                <ProductCard
                  key={group.representative.product_id}
                  href={`/products/${group.representative.product_id}`}
                  name={group.representative.product_name}
                  sku={group.representative.sku}
                  imageUrl={resolveProductImageUrl(group.representative.image_url)}
                  stockQty={group.totalQuantity}
                  {...(group.variantCount > 1 ? { variantCount: group.variantCount } : {})}
                  fallbackIcon={<PackageIcon className="text-muted-foreground size-6" />}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
