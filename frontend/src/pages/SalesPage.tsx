import { CheckCircle2Icon, ShoppingCartIcon, StoreIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryTree } from "@/features/categories/hooks";
import { CartPanel } from "@/features/sales/CartPanel";
import { computeTotals, useCartStore } from "@/features/sales/cartStore";
import { collectCategoryIds, useSaleWarehouses, useSellableProducts } from "@/features/sales/hooks";
import { ProductTile } from "@/features/sales/ProductTile";
import { submitSale } from "@/features/sales/submitSale";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Point of sale.
 *
 * Scoped to a single Store warehouse: the grid only shows what that store
 * actually holds, because you can't sell stock that lives in a depot. Stock
 * comes from the server; prices come from the local product cache.
 */
export function SalesPage() {
  const stores = useSaleWarehouses();
  const { storeId, lines, setStore, addItem, setQuantity, removeLine, clear } = useCartStore();

  // Fall back to the first sellable store until one is chosen.
  const activeStoreId = storeId ?? stores[0]?.id ?? null;
  const { products, isLoading } = useSellableProducts(activeStoreId);
  const { data: categoryTree } = useCategoryTree();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<string | null>(null);

  const inCartByProduct = useMemo(
    () => new Map(lines.map((l) => [l.productId, l.quantity])),
    [lines],
  );
  const availableByProduct = useMemo(
    () => new Map((products ?? []).map((p) => [p.productId, p.available])),
    [products],
  );

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
    addItem({
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      unitPriceCents: product.unitPriceCents,
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
    if (target && target.available > (inCartByProduct.get(target.productId) ?? 0)) {
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
        setLastSale(result.saleReference.slice(0, 8));
        clear();
        setCartOpen(false);
        toast({
          title: "Sale completed",
          description: `Stock updated for ${lineCount} product${lineCount === 1 ? "" : "s"}.`,
        });
      })
      .catch(() =>
        toast({
          title: "Sale failed",
          description: "Please check the sale and try again.",
          variant: "destructive",
        }),
      )
      .finally(() => setSubmitting(false));
  };

  if (stores.length === 0) {
    return (
      <PageShell size="wide">
        <PageHeader title="New sale" />
        <EmptyState
          icon={StoreIcon}
          title="No store to sell from"
          description="Sales run against a Store warehouse that allows sales. Create one, or enable sales on an existing store."
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
        description="Tap a product to add it to the sale."
        actions={
          <NativeSelect
            aria-label="Store"
            value={activeStoreId ?? ""}
            onChange={(e) => setStore(e.target.value)}
            className="w-48"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />

          {categoryTree && categoryTree.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
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

          {isLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-md" />
              ))}
            </div>
          )}

          {!isLoading && visible?.length === 0 && (
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

          {!isLoading && visible && visible.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
          <Button className="h-12 w-full justify-between" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCartIcon />
              {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
            </span>
            <span className="tabular-nums">{formatMoney(totals.totalCents)}</span>
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
