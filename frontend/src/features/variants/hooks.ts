import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { VariantGenerateItemInput } from "./api";
import { generateVariants, getVariantScheme, previewVariants } from "./api";

export function useVariantScheme(categoryId: string | null) {
  return useQuery({
    queryKey: ["variant-scheme", categoryId],
    queryFn: () => getVariantScheme(categoryId!),
    enabled: !!categoryId,
    // A category without a scheme returns 404, which is a normal answer here
    // ("this category isn't generated"), not a transient failure to retry.
    retry: false,
  });
}

export function useVariantPreview(
  categoryId: string | null,
  selectedValues: Record<string, string[]>,
) {
  const hasSelection = Object.values(selectedValues).some((values) => values.length > 0);
  return useQuery({
    queryKey: ["variant-preview", categoryId, selectedValues],
    queryFn: () => previewVariants(categoryId!, selectedValues),
    enabled: !!categoryId && hasSelection,
  });
}

export function useGenerateVariantsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      categoryId: string;
      items: VariantGenerateItemInput[];
      defaultWarehouseId: string | null;
    }) => generateVariants(vars.categoryId, vars.items, vars.defaultWarehouseId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["variant-preview"] });
      const skipped = result.skipped_skus.length;
      toast({
        title: `${result.created_count} product${result.created_count === 1 ? "" : "s"} created`,
        ...(skipped > 0 ? { description: `${skipped} already existed and were skipped.` } : {}),
      });
    },
    onError: (error) =>
      toast({
        title: "Could not generate",
        description:
          error instanceof ApiError
            ? (error.detail ?? "Please check the values and try again.")
            : "Please check the values and try again.",
        variant: "destructive",
      }),
  });
}
