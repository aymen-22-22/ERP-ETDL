import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";
import { useWarehouseStore } from "@/store/warehouseStore";

import type { Warehouse, WarehouseInput } from "./api";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  setDefaultWarehouse,
  updateWarehouse,
} from "./api";

const QUERY_KEY = ["warehouses"] as const;

export function useWarehouses() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: listWarehouses });
}

/** Returns the currently selected warehouse id, defaulting to the tenant's
 * default warehouse the first time the list loads (so stock-adjustment
 * forms and the location switcher always have a sensible starting value). */
export function useSelectedWarehouseId(): string | null {
  const { data: warehouses } = useWarehouses();
  const selectedWarehouseId = useWarehouseStore((s) => s.selectedWarehouseId);
  const setSelectedWarehouseId = useWarehouseStore((s) => s.setSelectedWarehouseId);

  useEffect(() => {
    if (selectedWarehouseId || !warehouses?.length) return;
    const fallback = warehouses.find((w) => w.is_default) ?? warehouses[0];
    if (fallback) setSelectedWarehouseId(fallback.id);
  }, [selectedWarehouseId, warehouses, setSelectedWarehouseId]);

  return selectedWarehouseId;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "warehouse_inactive") return "That warehouse is not active.";
    if (error.code === "permission_denied") return "You don't have permission for that.";
    if (error.code === "duplicate") return "A warehouse with that name already exists.";
  }
  return "Something went wrong. Please try again.";
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WarehouseInput) => createWarehouse(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Warehouse created" });
    },
    onError: (error) =>
      toast({ title: "Create failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useUpdateWarehouseMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WarehouseInput) => updateWarehouse(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Warehouse updated" });
    },
    onError: (error) =>
      toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useDeleteWarehouseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Warehouse deleted" });
    },
    onError: (error) =>
      toast({ title: "Delete failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useSetDefaultWarehouseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefaultWarehouse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Default warehouse updated" });
    },
    onError: (error) =>
      toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export type { Warehouse, WarehouseInput };
