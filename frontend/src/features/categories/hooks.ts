import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { CategoryInput } from "./api";
import { createCategory, deleteCategory, getCategoryTree, listCategories, updateCategory } from "./api";

const TREE_KEY = ["categories", "tree"] as const;
const LIST_KEY = ["categories"] as const;

export function useCategories() {
  return useQuery({ queryKey: LIST_KEY, queryFn: listCategories });
}

export function useCategoryTree() {
  return useQuery({ queryKey: TREE_KEY, queryFn: getCategoryTree });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "duplicate") return "A category with that name already exists.";
    if (error.code === "permission_denied") return "You don't have permission for that.";
  }
  return "Something went wrong. Please try again.";
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: TREE_KEY });
      toast({ title: "Category created" });
    },
    onError: (error) =>
      toast({ title: "Create failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useUpdateCategoryMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CategoryInput>) => updateCategory(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: TREE_KEY });
      toast({ title: "Category updated" });
    },
    onError: (error) =>
      toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: TREE_KEY });
      toast({ title: "Category deleted" });
    },
    onError: (error) =>
      toast({ title: "Delete failed", description: errorMessage(error), variant: "destructive" }),
  });
}
