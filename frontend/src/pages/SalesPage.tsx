import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  LayoutGridIcon,
  PackageOpenIcon,
  ShoppingCartIcon,
  StoreIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { CategoryCard } from "@/components/category/CategoryCard";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryTree } from "@/features/categories/hooks";
import { findCategoryNode, collectDescendantIds } from "@/features/categories/treeUtils";
import { ConfigurableWizard } from "@/features/configurable/ConfigurableWizard";
import { CartPanel } from "@/features/sales/CartPanel";
import { computeTotals, useCartStore, type CartLineDraft } from "@/features/sales/cartStore";
import {
  collectCategoryIds,
  useSaleWarehouses,
  useSellableProducts,
  type SellableProduct,
} from "@/features/sales/hooks";
import { ProductTile } from "@/features/sales/ProductTile";
import { VariantPicker } from "@/features/sales/VariantPicker";
import { submitSale } from "@/features/sales/submitSale";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";
import { cn } from "@/lib/utils";

/**
 * Point of sale.
 *
 * Scoped to a single Store warehouse: the grid only shows what that store
 * actually holds, because you can't sell stock that lives in a depot. Stock
 * comes from the server; prices come from the local product cache.
 */
export function SalesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stores = useSaleWarehouses();
  const { storeId, lines, setStore, addItem, setQuantity, setUnitPrice, removeLine, clear } =
    useCartStore();

  // Fall back to the first sellable store until one is chosen.
  const activeStoreId = storeId ?? stores[0]?.id ?? null;
  const { products, isLoading } = useSellableProducts(activeStoreId);
  const { data: categoryTree } = useCategoryTree();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<string | null>(null);
  // The tile being configured, or null when no wizard is open.
  const [configuring, setConfiguring] = useState<{
    productId: string;
    name: string;
    sku: string;
  } | null>(null);
  // The variant group being picked, or null when no picker is open.
  const [pickingVariant, setPickingVariant] = useState<SellableProduct | null>(null);

  // Category drill-down view
  const [salesView, setSalesView] = useState<"flat" | "category">("flat");
  const [categoryPath, setCategoryPath] = useState<string[]>([]);

  const inCartByProduct = useMemo(
    () => new Map(lines.map((l) => [l.productId, l.quantity])),
    [lines],
  );
  const availableByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products ?? []) {
      map.set(p.productId, p.available);
      // Variant group tiles hide individual variants — their product IDs
      // won't appear in the top-level array, so the stepper would fall back
      // to line.quantity and disable "+".  Flatten them here.
      if (p.isVariantGroup) {
        for (const v of p.variantProducts ?? []) {
          map.set(v.productId, v.available);
        }
      }
    }
    return map;
  }, [products]);

  // Selecting a parent category includes everything beneath it.
  const activeCategoryIds = useMemo(() => {
    if (!categoryId || !categoryTree) return null;
    const stack = [...categoryTree];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node.id === categoryId) return new Set(collectCategoryIds(node));
      stack.push(...node.children);
    }
    return new Set([categoryId]);
  }, [categoryId, categoryTree]);

  // --- Category view derived values ---
  const currentCategoryNode = useMemo(() => {
    if (categoryPath.length === 0) return null;
    return findCategoryNode(categoryPath[categoryPath.length - 1] ?? null, categoryTree ?? []);
  }, [categoryPath, categoryTree]);

  const childCategories = currentCategoryNode?.children ?? categoryTree ?? [];

  const categoryViewProducts = useMemo(() => {
    if (salesView !== "category") return undefined;
    if (!products) return undefined;
    const needle = search.trim().toLowerCase();
    let filtered = products;
    if (categoryPath.length > 0 && currentCategoryNode) {
      const ids = new Set(collectDescendantIds(currentCategoryNode));
      filtered = products.filter((p) => p.categoryId && ids.has(p.categoryId));
    }
    if (needle) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle) ||
          (p.barcode?.toLowerCase().includes(needle) ?? false),
      );
    }
    return filtered;
  }, [salesView, products, categoryPath, currentCategoryNode, search]);

  const countInCategory = useCallback(
    (categoryId: string) => {
      if (!products || !categoryTree) return 0;
      const node = findCategoryNode(categoryId, categoryTree);
      if (!node) return 0;
      const ids = new Set(collectDescendantIds(node));
      const seen = new Set<string>();
      return products.filter((p) => {
        if (!p.categoryId || !ids.has(p.categoryId)) return false;
        if (p.isVariantGroup) {
          if (seen.has(p.name)) return false;
          seen.add(p.name);
        }
        return true;
      }).length;
    },
    [products, categoryTree],
  );

  const navigateIntoCategory = useCallback((id: string) => {
    setCategoryPath((prev) => [...prev, id]);
  }, []);

  const navigateToRoot = useCallback(() => {
    setCategoryPath([]);
  }, []);

  const visible = useMemo(() => {
    if (!products) return undefined;
    const needle = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategoryIds && (!p.categoryId || !activeCategoryIds.has(p.categoryId)))
        return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.barcode?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [products, search, activeCategoryIds]);

  const totals = computeTotals(lines);

  const add = (productId: string) => {
    const product = products?.find((p) => p.productId === productId);
    if (!product) return;
    // A variant group opens the picker to choose a specific colour/SKU.
    if (product.isVariantGroup) {
      setPickingVariant(product);
      return;
    }
    // A configurable product has no single price to ring — route through the
    // wizard, which resolves price and components for the chosen options.
    if (product.isConfigurable) {
      setConfiguring({ productId: product.productId, name: product.name, sku: product.sku });
      return;
    }
    addItem({
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      unitPriceCents: product.unitPriceCents,
    });
  };

  const addConfigured = (draft: CartLineDraft) => addItem(draft);

  const addVariant = (variant: SellableProduct) => {
    addItem({
      productId: variant.productId,
      name: variant.name,
      sku: variant.sku,
      unitPriceCents: variant.unitPriceCents,
    });
  };

  /** A barcode scanner types the code then sends Enter — treat an exact
   *  barcode/SKU match as "add this now" so scanning never needs a tap. */
  const onSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || !visible) return;
    event.preventDefault();
    const needle = search.trim().toLowerCase();
    if (!needle) return;
    const exact = visible.find(
      (p) => p.barcode?.toLowerCase() === needle || p.sku.toLowerCase() === needle,
    );
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (!target) return;
    if (target.isConfigurable) {
      add(target.productId);
      setSearch("");
      return;
    }
    if (target.available > (inCartByProduct.get(target.productId) ?? 0)) {
      add(target.productId);
      setSearch("");
    }
  };

  const complete = () => {
    if (!activeStoreId || lines.length === 0) return;
    const lineCount = lines.length;
    setSubmitting(true);
    void submitSale(activeStoreId, lines)
      .then((result) => {
        setLastSale(result.reference_id.slice(0, 8));
        clear();
        setCartOpen(false);
        // The shelf just changed. Without this the tiles keep offering the
        // pre-sale quantities, and for kits the buildable count is derived
        // from components that have just been consumed.
        void queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
        void queryClient.invalidateQueries({ queryKey: ["sellable-kits"] });
        toast({
          title: "Sale completed",
          // Movements can exceed lines: one kit becomes several components.
          description:
            result.movements_created > lineCount
              ? `${lineCount} line${lineCount === 1 ? "" : "s"} · ${result.movements_created} stock movements (kits deduct their components).`
              : `Stock updated for ${lineCount} product${lineCount === 1 ? "" : "s"}.`,
        });
      })
      .catch((error: unknown) =>
        toast({
          title: "Sale failed",
          // The server names exactly what is short ("Bouchon Argent 19mm
          // (need 4, have 3)"), which is the difference between a cashier who
          // can act and one who cannot.
          description:
            error instanceof ApiError
              ? (error.detail ?? "Please check the sale and try again.")
              : "Please check the sale and try again.",
          variant: "destructive",
        }),
      )
      .finally(() => setSubmitting(false));
  };

  if (stores.length === 0) {
    return (
      <PageShell size="wide">
        <PageHeader title="New sale" back="/" />
        <EmptyState
          icon={StoreIcon}
          title="No store to sell from"
          description="Sales run against a Store warehouse that allows sales. Create one, or enable sales on an existing store."
          action={{ label: "Go to warehouses", onClick: () => void navigate("/warehouses") }}
        />
      </PageShell>
    );
  }

  const cart = (
    <CartPanel
      lines={lines}
      subtotalCents={totals.subtotalCents}
      totalCents={totals.totalCents}
      onSetQuantity={setQuantity}
      onSetUnitPrice={setUnitPrice}
      onRemove={removeLine}
      onComplete={complete}
      onClear={clear}
      isSubmitting={isSubmitting}
      availableByProduct={availableByProduct}
    />
  );

  return (
    <PageShell size="wide" className="pb-32 lg:pb-6">
      <PageHeader
        title="New sale"
        back="/"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="px-2.5 sm:px-3"
              onClick={() => void navigate("/sales/history")}
            >
              <HistoryIcon />
              <span className="hidden sm:inline">History</span>
            </Button>
            <NativeSelect
              aria-label="Store"
              value={activeStoreId ?? ""}
              onChange={(e) => setStore(e.target.value)}
              className="w-36 sm:w-44"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        actionsOnMobile
      />

      {lastSale && (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <CheckCircle2Icon className="size-4 shrink-0" />
          <span>
            Sale <span className="font-medium tabular-nums">{lastSale}</span> recorded.
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLastSale(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Input
            placeholder="Search or scan name, SKU, barcode…"
            className="h-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />

          {/* View toggle */}
          <div className="bg-muted flex items-center gap-0.5 rounded-md p-0.5">
            <Button
              variant={salesView === "flat" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setSalesView("flat");
                setCategoryPath([]);
              }}
            >
              <LayoutGridIcon className="mr-1 size-4" /> All
            </Button>
            <Button
              variant={salesView === "category" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setSalesView("category");
                setCategoryPath([]);
              }}
            >
              <FolderIcon className="mr-1 size-4" /> Categories
            </Button>
          </div>

          {/* Category filter chips — flat view only */}
          {salesView === "flat" && categoryTree && categoryTree.length > 0 && (
            <div className="flex w-full gap-2 overflow-x-auto pb-1">
              <CategoryChip
                label="All"
                active={categoryId === null}
                onClick={() => setCategoryId(null)}
              />
              {categoryTree.map((node) => (
                <CategoryChip
                  key={node.id}
                  label={node.name}
                  active={categoryId === node.id}
                  onClick={() => setCategoryId(node.id)}
                />
              ))}
            </div>
          )}

          {/* Loading skeleton — both views */}
          {isLoading && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          )}

          {/* Flat view */}
          {salesView === "flat" && !isLoading && visible?.length === 0 && (
            <EmptyState
              icon={ShoppingCartIcon}
              title="Nothing to sell here"
              description={
                search || categoryId
                  ? "No products match your search in this store."
                  : "This store has no stock yet. Transfer stock in to start selling."
              }
            />
          )}

          {salesView === "flat" && !isLoading && visible && visible.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
              {visible.map((product) => (
                <ProductTile
                  key={product.productId}
                  product={product}
                  inCart={inCartByProduct.get(product.productId) ?? 0}
                  onAdd={() => add(product.productId)}
                />
              ))}
            </div>
          )}

          {/* Category view */}
          {salesView === "category" && !isLoading && (
            <>
              {/* Breadcrumb */}
              {categoryPath.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={navigateToRoot}>
                    <HomeIcon className="mr-1 size-3.5" /> All
                  </Button>
                  {categoryPath.map((catId) => {
                    const node = findCategoryNode(catId, categoryTree ?? []);
                    return node ? (
                      <span key={catId} className="flex items-center gap-1">
                        <ChevronRightIcon className="size-3" />
                        <span>{node.name}</span>
                      </span>
                    ) : null;
                  })}
                </div>
              )}

              {/* Subcategory cards */}
              {childCategories.length > 0 && (
                <CategoryGrid>
                  {childCategories.map((child) => (
                    <CategoryCard
                      key={child.id}
                      category={child}
                      productCount={countInCategory(child.id)}
                      imageUrl={child.image_url ?? null}
                      onClick={() => navigateIntoCategory(child.id)}
                    />
                  ))}
                </CategoryGrid>
              )}

              {/* Products at this level */}
              {categoryViewProducts && categoryViewProducts.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
                  {categoryViewProducts.map((product) => (
                    <ProductTile
                      key={product.productId}
                      product={product}
                      inCart={inCartByProduct.get(product.productId) ?? 0}
                      onAdd={() => add(product.productId)}
                    />
                  ))}
                </div>
              )}

              {/* Empty state for current level */}
              {childCategories.length === 0 && (!categoryViewProducts || categoryViewProducts.length === 0) && (
                <EmptyState
                  icon={PackageOpenIcon}
                  title="No products here"
                  description="This category has no products yet."
                />
              )}
            </>
          )}
        </div>

        {/* Desktop: cart as a sticky rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-md border p-4">
            <h2 className="label-caps text-muted-foreground mb-3">Current sale</h2>
            {cart}
          </div>
        </aside>
      </div>

      {/* Mobile: summary bar that opens the cart */}
      {lines.length > 0 && (
        <div className="bottom-nav-offset bg-background/95 fixed inset-x-0 z-20 border-t p-3 backdrop-blur lg:hidden">
          <Button className="h-12 w-full justify-between gap-2" onClick={() => setCartOpen(true)}>
            <span className="flex min-w-0 items-center gap-2">
              <ShoppingCartIcon className="shrink-0" />
              {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
            </span>
            <span className="truncate tabular-nums">{formatMoney(totals.totalCents)}</span>
          </Button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Current sale</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{cart}</div>
        </SheetContent>
      </Sheet>

      <ConfigurableWizard
        product={configuring}
        storeId={activeStoreId}
        onOpenChange={(open) => {
          if (!open) setConfiguring(null);
        }}
        onAdd={addConfigured}
      />

      {pickingVariant && (
        <VariantPicker
          product={pickingVariant}
          open
          onOpenChange={(open) => {
            if (!open) setPickingVariant(null);
          }}
          onAdd={addVariant}
        />
      )}
    </PageShell>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        active ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
