import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { ProductInput, ProductListParams } from "./api";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./api";
import { submitStockAdjustment } from "./inventoryMutations";

const QUERY_KEY = ["products"] as const;

export function useProducts(page = 1, pageSize = 25, params: ProductListParams = {}) {
  return useQuery({
    queryKey: [...QUERY_KEY, page, pageSize, params],
    queryFn: () => listProducts(page, pageSize, params),
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, productId],
    queryFn: () => getProduct(productId),
    enabled: !!productId,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "permission_denied") return "You don't have permission for that.";
    if (error.code === "conflict") return "That SKU already exists.";
  }
  return "Something went wrong. Please try again.";
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Product created" });
    },
    onError: (error) =>
      toast({ title: "Create failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useUpdateProductMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: ProductInput; baseVersion: number }) =>
      updateProduct(productId, vars.baseVersion, vars.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Product updated" });
    },
    onError: (error) =>
      toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; baseVersion: number }) =>
      deleteProduct(vars.productId, vars.baseVersion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Product deleted" });
    },
    onError: (error) =>
      toast({ title: "Delete failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useAdjustStockMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { warehouseId: string; quantityDelta: number; note?: string | undefined }) =>
      submitStockAdjustment(productId, vars.warehouseId, vars.quantityDelta, vars.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-stock", productId] });
      void queryClient.invalidateQueries({ queryKey: ["product-movements", productId] });
      toast({ title: "Stock adjusted" });
    },
    onError: (error) =>
      toast({
        title: "Adjustment failed",
        description: error instanceof ApiError ? error.message : "Something went wrong.",
        variant: "destructive",
      }),
  });
}
