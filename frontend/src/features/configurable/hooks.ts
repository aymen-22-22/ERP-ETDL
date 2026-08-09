import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteConfigurableDefinition,
  getConfigurableDefinition,
  listConfigurableProducts,
  resolveConfigurable,
  saveConfigurableDefinition,
  type ConfigurableDefinition,
  type ConfigurableDefinitionInput,
  type ConfigurableListItem,
  type ConfigurableResolution,
} from "./api";

export function useConfigurableProducts(): {
  data: ConfigurableListItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  return useQuery({
    queryKey: ["configurable", "list"],
    queryFn: () => listConfigurableProducts(),
  });
}

export function useConfigurableDefinition(
  productId: string | null,
  enabled: boolean,
): {
  data: ConfigurableDefinition | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  return useQuery({
    queryKey: ["configurable", "definition", productId],
    queryFn: () => getConfigurableDefinition(productId!),
    enabled: enabled && productId !== null,
  });
}

/**
 * Live resolution of a (partially or fully) chosen configuration. Query is
 * keyed on the whole configuration object, so every choice the cashier makes
 * re-resolves price, components and buildability — the wizard just sets state
 * and this follows.
 */
export function useResolveConfiguration(
  productId: string | null,
  configuration: Record<string, string>,
  warehouseId: string | null | undefined,
  enabled: boolean,
): {
  data: ConfigurableResolution | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  return useQuery({
    queryKey: ["configurable", "resolve", productId, configuration, warehouseId],
    queryFn: () => resolveConfigurable(productId!, configuration, warehouseId),
    enabled: enabled && productId !== null,
  });
}

export function useSaveConfigurableDefinition(productId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigurableDefinitionInput) =>
      saveConfigurableDefinition(productId!, input),
    onSuccess: () => {
      // A saved definition changes what the till offers and the admin list
      // shows, not just the definition itself.
      void queryClient.invalidateQueries({ queryKey: ["configurable"] });
    },
  });
}

export function useDeleteConfigurableDefinition(productId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteConfigurableDefinition(productId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["configurable"] });
    },
  });
}
