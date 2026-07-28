import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlusIcon, LayersIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { CategoryTree } from "@/components/CategoryTree";
import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCategories,
  useCategoryTree,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "@/features/categories/hooks";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export function CategoriesPage() {
  const { data: categories, isLoading: listLoading } = useCategories();
  const { data: tree, isLoading: treeLoading } = useCategoryTree();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation(selectedId ?? "");
  const deleteMutation = useDeleteCategoryMutation();

  const selectedCategory = categories?.find((c) => c.id === selectedId);

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreate,
    formState: { errors: createErrors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    setValue: setEditValue,
    formState: { errors: editErrors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  const onCreateSubmit = handleSubmitCreate((values) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        setCreateOpen(false);
        resetCreate();
      },
    });
  });

  const onEditSubmit = handleSubmitEdit((values) => {
    if (!selectedId) return;
    updateMutation.mutate(values, {
      onSuccess: () => {
        setEditOpen(false);
        resetEdit();
      },
    });
  });

  const handleDelete = () => {
    if (!selectedId) return;
    deleteMutation.mutate(selectedId, {
      onSuccess: () => {
        setDeleteOpen(false);
        setSelectedId(null);
      },
    });
  };

  const isLoading = listLoading || treeLoading;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <FolderPlusIcon />
          New category
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md border p-4 lg:col-span-1">
          <h2 className="mb-2 text-sm font-medium">Category tree</h2>
          {isLoading && <TableLoader rows={4} columns={1} />}
          {!isLoading && tree && tree.length === 0 && (
            <p className="text-muted-foreground text-sm">No categories yet.</p>
          )}
          {!isLoading && tree && tree.length > 0 && (
            <CategoryTree nodes={tree} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedCategory && (
            <div className="rounded-md border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{selectedCategory.name}</h3>
                  {selectedCategory.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {selectedCategory.description}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-2 text-xs">
                    Created {new Date(selectedCategory.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditValue("name", selectedCategory.name);
                      setEditValue("description", selectedCategory.description ?? "");
                      setEditOpen(true);
                    }}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          {!selectedCategory && !isLoading && (
            <EmptyState
              icon={LayersIcon}
              title="Select a category"
              description="Choose a category from the tree to view its details."
            />
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create category</DialogTitle>
            <DialogDescription>Add a new product category.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void onCreateSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-name">Name</Label>
              <Input id="create-name" {...registerCreate("name")} placeholder="e.g. Lustres" />
              {createErrors.name && (
                <p className="text-destructive text-sm">{createErrors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-desc">Description (optional)</Label>
              <Input id="create-desc" {...registerCreate("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update category details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void onEditSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" {...registerEdit("name")} />
              {editErrors.name && (
                <p className="text-destructive text-sm">{editErrors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-desc">Description (optional)</Label>
              <Input id="edit-desc" {...registerEdit("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCategory?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
