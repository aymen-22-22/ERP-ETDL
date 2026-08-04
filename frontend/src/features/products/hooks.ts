import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { AddVariantInput, ProductInput, ProductListParams } from "./api";
import {
  addProductVariant,
  bulkDeleteProducts,
  createProduct,
  deleteProduct,
  duplicateProduct,
  getProduct,
  getProductFamily,
  listGroupedVariants,
  listProducts,
  listVariantGroups,
  updateProduct,
} from "./api";
import { submitStockAdjustment } from "./inventoryMutations";

const QUERY_KEY = ["products"] as const;

export function useProducts(page = 1, pageSize = 25, params: ProductListParams = {}) {
  return useQuery({
    queryKey: [...QUERY_KEY, page, pageSize, params],
    queryFn: () => listProducts(page, pageSize, params),
  });
}

export function useVariantGroups() {
  return useQuery({
    queryKey: ["variant-groups"],
    queryFn: listVariantGroups,
  });
}

export function useGroupedVariants(categoryId: string | null) {
  return useQuery({
    queryKey: ["grouped-variants", categoryId],
    queryFn: () => listGroupedVariants(categoryId!),
    enabled: !!categoryId,
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, productId],
    queryFn: () => getProduct(productId),
    enabled: !!productId,
  });
}

export function useProductFamily(productId: string) {
  return useQuery({
    queryKey: ["product-family", productId],
    queryFn: () => getProductFamily(productId),
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

export function useBulkDeleteProductsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productIds: string[]) => bulkDeleteProducts(productIds),
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: `${count} product${count === 1 ? "" : "s"} deleted` });
    },
    onError: (error) =>
      toast({
        title: "Delete failed",
        // The backend refuses the whole batch when a product is a component of
        // a kit and says which — that message is far more useful than a
        // generic failure, so it is surfaced verbatim.
        description:
          error instanceof ApiError && error.code === "product_in_use_by_kit"
            ? (error.detail ?? errorMessage(error))
            : errorMessage(error),
        variant: "destructive",
      }),
  });
}

export function useDuplicateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => duplicateProduct(productId),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Product duplicated", description: product.name });
    },
    onError: (error) =>
      toast({
        title: "Duplicate failed",
        description: errorMessage(error),
        variant: "destructive",
      }),
  });
}

export function useAddProductVariantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; input: AddVariantInput }) =>
      addProductVariant(vars.productId, vars.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["variant-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["grouped-variants"] });
      toast({ title: "Variant added" });
    },
    onError: (error) =>
      toast({
        title: "Could not add variant",
        description: errorMessage(error),
        variant: "destructive",
      }),
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
