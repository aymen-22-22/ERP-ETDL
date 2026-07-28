import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";

import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { CategorySelector } from "@/features/categories/CategorySelector";
import {
  useCreateProductMutation,
  useProduct,
  useUpdateProductMutation,
} from "@/features/products/hooks";
import { useWarehouses } from "@/features/warehouses/hooks";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional(),
  description: z.string().optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price")
    .refine((value) => Number(value) > 0, "Price must be greater than zero"),
  costPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid cost price")
    .optional()
    .or(z.literal("")),
  status: z.enum(["draft", "active", "archived"]),
  categoryId: z.string().optional().or(z.literal("")),
  brandId: z.string().optional().or(z.literal("")),
  unitId: z.string().optional().or(z.literal("")),
  defaultWarehouseId: z.string().optional().or(z.literal("")),
  initialStock: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d+$/.test(v), "Must be a whole number"),
});

type ProductFormValues = z.infer<typeof productSchema>;

export function ProductFormPage() {
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const navigate = useNavigate();

  const { product, isLoading } = useProduct(productId ?? "");
  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation(productId ?? "");

  const { data: warehouses } = useWarehouses();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { status: "active" },
  });

  const watchedCategoryId = watch("categoryId");
  const watchedWarehouseId = watch("defaultWarehouseId");

  useEffect(() => {
    if (isEdit && product) {
      reset({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? undefined,
        description: product.description ?? undefined,
        price: product.price,
        costPrice: product.costPrice ?? undefined,
        status: (product.status as "draft" | "active" | "archived") ?? "active",
        categoryId: product.categoryId ?? undefined,
        brandId: product.brandId ?? undefined,
        unitId: product.unitId ?? undefined,
        defaultWarehouseId: product.defaultWarehouseId ?? undefined,
      });
    }
  }, [isEdit, product, reset]);

  if (isEdit && isLoading) return <PageLoader />;

  const onSubmit = handleSubmit((values) => {
    const goBack = { onSuccess: () => void navigate("/products") };
    if (isEdit && product) {
      updateMutation.mutate({ input: values, baseVersion: product.version }, goBack);
    } else {
      createMutation.mutate(values, goBack);
    }
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const warehouseOptions: SearchableSelectOption[] = (warehouses ?? [])
    .filter((w) => w.is_active)
    .map((w) => ({
      value: w.id,
      label: w.name,
      description: `${w.warehouse_type}${w.is_default ? " (default)" : ""}`,
    }));

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Edit product" : "New product"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register("sku")} />
              {errors.sku && <p className="text-destructive text-sm">{errors.sku.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" {...register("barcode")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price">Price</Label>
                <Input id="price" inputMode="decimal" {...register("price")} />
                {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="costPrice">Cost Price</Label>
                <Input id="costPrice" inputMode="decimal" {...register("costPrice")} />
                {errors.costPrice && (
                  <p className="text-destructive text-sm">{errors.costPrice.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
                {...register("status")}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategorySelector
                value={watchedCategoryId || null}
                onChange={(val) => setValue("categoryId", val ?? "", { shouldValidate: true })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Default Warehouse</Label>
              <SearchableSelect
                options={warehouseOptions}
                value={watchedWarehouseId || null}
                onChange={(val) =>
                  setValue("defaultWarehouseId", val ?? "", { shouldValidate: true })
                }
                placeholder="Select warehouse..."
                emptyText="No active warehouses."
              />
            </div>

            {!isEdit && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="initialStock">Initial Stock (optional)</Label>
                <Input
                  id="initialStock"
                  inputMode="numeric"
                  placeholder="0"
                  {...register("initialStock")}
                />
                <p className="text-muted-foreground text-xs">
                  Added to the selected warehouse on creation.
                </p>
                {errors.initialStock && (
                  <p className="text-destructive text-sm">{errors.initialStock.message}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Brand (optional)</Label>
              <Input id="brandId" placeholder="Brand UUID" {...register("brandId")} />
              {errors.brandId && (
                <p className="text-destructive text-sm">{errors.brandId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Unit (optional)</Label>
              <Input id="unitId" placeholder="Unit UUID" {...register("unitId")} />
              {errors.unitId && <p className="text-destructive text-sm">{errors.unitId.message}</p>}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigate("/products")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
