import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";

import { toast } from "@/lib/toast";
import { db, type LocalInventoryMovement, type LocalProduct } from "@/offline/db";
import { SyncConflictError, type SubmitOutcome } from "@/offline/submit";
import { ApiError } from "@/services/api/client";
import { useAuthStore } from "@/store/authStore";

import type { ProductInput } from "./api";
import { submitStockAdjustment } from "./inventoryMutations";
import { submitCreateProduct, submitDeleteProduct, submitUpdateProduct } from "./mutations";

// ---- Reads: straight from the local Dexie cache, kept fresh by syncEngine's
// pull. useLiveQuery re-runs whenever the underlying tables change (including
// a background pull), so the UI reacts automatically. undefined = first load.

export type ProductSort = "name" | "price" | "sku";
export type ProductSortDir = "asc" | "desc";

export interface ProductListParams {
  search?: string;
  status?: string;
  sort?: ProductSort;
  sortDir?: ProductSortDir;
}

function sortValue(product: LocalProduct, sort: ProductSort): string | number {
  if (sort === "price") return Number(product.price);
  return product[sort].toLowerCase();
}

export function useProducts(
  page = 1,
  pageSize = 25,
  params: ProductListParams = {},
): { items: LocalProduct[] | undefined; total: number; pages: number } {
  const tenantId = useAuthStore((state) => state.tenantId);
  const { search = "", status = "", sort = "name", sortDir = "asc" } = params;

  const filtered = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.products.where("tenantId").equals(tenantId).toArray();
    const needle = search.trim().toLowerCase();
    return all
      .filter((p) => !status || p.status === status)
      .filter(
        (p) =>
          !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const av = sortValue(a, sort);
        const bv = sortValue(b, sort);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [tenantId, search, status, sort, sortDir]);

  if (filtered === undefined) {
    return { items: undefined, total: 0, pages: 1 };
  }
  const total = filtered.length;
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  return { items, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function useProduct(productId: string): {
  product: LocalProduct | null;
  isLoading: boolean;
} {
  const rows = useLiveQuery(() => db.products.where("id").equals(productId).toArray(), [productId]);
  if (rows === undefined) return { product: null, isLoading: true };
  return { product: rows[0] ?? null, isLoading: false };
}

/** Total stock across all warehouses; pass `warehouseId` to scope to one
 * location instead. */
export function useStock(productId: string, warehouseId?: string): number | undefined {
  return useLiveQuery(async () => {
    const movements = await db.inventoryMovements.where("productId").equals(productId).toArray();
    const scoped = warehouseId ? movements.filter((m) => m.warehouseId === warehouseId) : movements;
    return scoped.reduce((sum, m) => sum + m.quantityDelta, 0);
  }, [productId, warehouseId]);
}

export function useMovements(
  productId: string,
  warehouseId?: string,
): LocalInventoryMovement[] | undefined {
  return useLiveQuery(async () => {
    const movements = await db.inventoryMovements.where("productId").equals(productId).toArray();
    const scoped = warehouseId ? movements.filter((m) => m.warehouseId === warehouseId) : movements;
    return scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [productId, warehouseId]);
}

// ---- Writes: optimistic Dexie write + queue drain (see ./mutations).

function errorMessage(error: unknown): string {
  if (error instanceof SyncConflictError) return "This item changed elsewhere. Reload and retry.";
  if (error instanceof ApiError) {
    if (error.code === "permission_denied") return "You don't have permission for that.";
    if (error.code === "conflict") return "That SKU already exists.";
  }
  return "Something went wrong. Please try again.";
}

function outcomeToast(outcome: SubmitOutcome, appliedTitle: string): void {
  if (outcome === "queued") {
    toast({ title: "Saved offline", description: "Will sync when you're back online." });
  } else {
    toast({ title: appliedTitle });
  }
}

export function useCreateProductMutation() {
  return useMutation({
    mutationFn: (input: ProductInput) => submitCreateProduct(input),
    onSuccess: (outcome) => outcomeToast(outcome, "Product created"),
    onError: (error) =>
      toast({ title: "Create failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useUpdateProductMutation(productId: string) {
  return useMutation({
    mutationFn: (vars: { input: ProductInput; baseVersion: number }) =>
      submitUpdateProduct(productId, vars.baseVersion, vars.input),
    onSuccess: (outcome) => outcomeToast(outcome, "Product updated"),
    onError: (error) =>
      toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useDeleteProductMutation() {
  return useMutation({
    mutationFn: (vars: { productId: string; baseVersion: number }) =>
      submitDeleteProduct(vars.productId, vars.baseVersion),
    onSuccess: (outcome) => outcomeToast(outcome, "Product deleted"),
    onError: (error) =>
      toast({ title: "Delete failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useAdjustStockMutation(productId: string) {
  return useMutation({
    mutationFn: (vars: { warehouseId: string; quantityDelta: number; note?: string | undefined }) =>
      submitStockAdjustment(productId, vars.warehouseId, vars.quantityDelta, vars.note),
    onSuccess: (outcome) => outcomeToast(outcome, "Stock adjusted"),
    onError: (error) =>
      toast({
        title: "Adjustment failed",
        description: errorMessage(error),
        variant: "destructive",
      }),
  });
}
