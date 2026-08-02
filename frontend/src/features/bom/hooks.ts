import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { BomUnit } from "./api";
import { getBom, getBomBuildable, getBomCost, listSellableKits, replaceBom } from "./api";

const BOM_KEY = "bom" as const;
const BOM_COST_KEY = "bom-cost" as const;
const BOM_BUILDABLE_KEY = "bom-buildable" as const;

export function useBom(kitProductId: string, enabled = true) {
  return useQuery({
    queryKey: [BOM_KEY, kitProductId],
    queryFn: () => getBom(kitProductId),
    enabled: enabled && !!kitProductId,
  });
}

export function useBomCost(kitProductId: string, enabled = true) {
  return useQuery({
    queryKey: [BOM_COST_KEY, kitProductId],
    queryFn: () => getBomCost(kitProductId),
    enabled: enabled && !!kitProductId,
  });
}

export function useBomBuildable(kitProductId: string, warehouseId: string | null) {
  return useQuery({
    queryKey: [BOM_BUILDABLE_KEY, kitProductId, warehouseId],
    queryFn: () => getBomBuildable(kitProductId, warehouseId!),
    enabled: !!kitProductId && !!warehouseId,
  });
}

export function useSellableKits(warehouseId: string | null) {
  return useQuery({
    queryKey: ["sellable-kits", warehouseId],
    queryFn: () => listSellableKits(warehouseId!),
    enabled: !!warehouseId,
  });
}

export function useReplaceBomMutation(kitProductId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lines: { component_product_id: string; quantity: number; unit: BomUnit }[]) =>
      replaceBom(kitProductId, lines),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BOM_KEY, kitProductId] });
      void queryClient.invalidateQueries({ queryKey: [BOM_COST_KEY, kitProductId] });
      void queryClient.invalidateQueries({ queryKey: [BOM_BUILDABLE_KEY, kitProductId] });
      toast({ title: "Recipe saved" });
    },
    onError: (error) =>
      toast({
        title: "Could not save recipe",
        // The backend's refusals here are specific and actionable ("a kit
        // cannot contain another kit"), so show its wording rather than a
        // generic message.
        description:
          error instanceof ApiError
            ? (error.detail ?? "Please check the recipe and try again.")
            : "Please check the recipe and try again.",
        variant: "destructive",
      }),
  });
}
