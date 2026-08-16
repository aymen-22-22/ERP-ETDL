import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { CategoryInput } from "./api";
import {
  createCategory,
  deleteCategory,
  deleteCategoryImage,
  getCategoryTree,
  listCategories,
  updateCategory,
  uploadCategoryImage,
} from "./api";

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
    if (error.detail) return error.detail;
    if (error.code === "duplicate") return "A category with that name already exists.";
    if (error.code === "permission_denied") return "You don't have permission for that.";
    if (error.code === "invalid_file_type")
      return "Only JPEG, PNG, WEBP, or GIF images are allowed.";
    if (error.code === "file_too_large") return "The image exceeds the 5 MB limit.";
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

export function useUploadCategoryImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, file }: { categoryId: string; file: File }) =>
      uploadCategoryImage(categoryId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: TREE_KEY });
      toast({ title: "Photo updated" });
    },
    onError: (error) =>
      toast({ title: "Upload failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useDeleteCategoryImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategoryImage(categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: TREE_KEY });
      toast({ title: "Photo removed" });
    },
    onError: (error) =>
      toast({ title: "Remove failed", description: errorMessage(error), variant: "destructive" }),
  });
}
