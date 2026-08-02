import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";

import { PageLoader } from "@/components/PageLoader";
import { MarginSummary } from "@/components/patterns/MarginSummary";
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
  // Optional: the server derives one from the category when left blank.
  sku: z.string().optional(),
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
  // "variant" is absent on purpose: variants are produced by the generator
  // from a category's naming scheme, never typed in by hand.
  productType: z.enum(["simple", "kit"]),
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

  const { data: product, isLoading } = useProduct(productId ?? "");
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
    defaultValues: { status: "active", productType: "simple" },
  });

  const watchedCategoryId = watch("categoryId");
  const watchedWarehouseId = watch("defaultWarehouseId");
  const watchedPrice = watch("price");
  const watchedCostPrice = watch("costPrice");

  // Opening stock is create-only and a dynamic per-warehouse grid, which
  // react-hook-form handles awkwardly; plain state is clearer here.
  type StockFields = { quantity: string; minQuantity: string };
  const [openingStock, setOpeningStock] = useState<Record<string, StockFields>>({});

  const setStockField = (warehouseId: string, field: "quantity" | "minQuantity", value: string) =>
    setOpeningStock((current: Record<string, StockFields>) => ({
      ...current,
      [warehouseId]: {
        quantity: current[warehouseId]?.quantity ?? "",
        minQuantity: current[warehouseId]?.minQuantity ?? "",
        [field]: value,
      },
    }));

  useEffect(() => {
    if (isEdit && product) {
      reset({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? undefined,
        description: product.description ?? undefined,
        price: product.price,
        costPrice: product.cost_price ?? undefined,
        status: (product.status as "draft" | "active" | "archived") ?? "active",
        categoryId: product.category_id ?? undefined,
        brandId: product.brand_id ?? undefined,
        unitId: product.unit_id ?? undefined,
        defaultWarehouseId: product.default_warehouse_id ?? undefined,
        // Sent back on edit only to keep the form value in sync; the update
        // endpoint has no product_type field and ignores it.
        productType: product.product_type === "kit" ? "kit" : "simple",
      });
    }
  }, [isEdit, product, reset]);

  if (isEdit && isLoading) return <PageLoader />;

  const onSubmit = handleSubmit((values) => {
    const goBack = { onSuccess: () => void navigate("/products") };
    if (isEdit && product) {
      updateMutation.mutate({ input: values, baseVersion: product.version }, goBack);
      return;
    }
    // Only warehouses actually filled in are sent; a blank row means "start at
    // zero", which needs no movement and no threshold.
    const entries = Object.entries<StockFields>(openingStock).flatMap(([warehouseId, fields]) => {
      const quantity = parseInt(fields.quantity, 10);
      const minQuantity = parseInt(fields.minQuantity, 10);
      const hasQuantity = Number.isFinite(quantity) && quantity > 0;
      const hasThreshold = Number.isFinite(minQuantity);
      if (!hasQuantity && !hasThreshold) return [];
      return [
        {
          warehouseId,
          quantity: hasQuantity ? quantity : 0,
          minQuantity: hasThreshold ? minQuantity : null,
        },
      ];
    });
    createMutation.mutate({ ...values, openingStock: entries }, goBack);
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
              <Input id="sku" placeholder="Generated automatically" {...register("sku")} />
              <p className="text-muted-foreground text-xs">
                Leave blank and one is generated from the category (Porte Chaussure &rarr; PC-001).
              </p>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="costPrice">Purchase price</Label>
                <Input id="costPrice" inputMode="decimal" {...register("costPrice")} />
                {errors.costPrice && (
                  <p className="text-destructive text-sm">{errors.costPrice.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price">Selling price</Label>
                <Input id="price" inputMode="decimal" {...register("price")} />
                {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
              </div>
            </div>

            <MarginSummary
              costPrice={watchedCostPrice}
              sellingPrice={watchedPrice}
              costLabel="Purchase price"
            />

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
              <div className="flex flex-col gap-2">
                <Label>Opening stock</Label>
                <p className="text-muted-foreground text-xs">
                  Counted in when the product is created. Leave a warehouse blank to start it at
                  zero. The alert threshold warns you when stock drops below it.
                </p>
                <div className="flex flex-col gap-2">
                  {(warehouses ?? [])
                    .filter((w) => w.is_active)
                    .map((warehouse) => (
                      <div
                        key={warehouse.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {warehouse.name}
                          {warehouse.is_default && (
                            <span className="text-muted-foreground"> (default)</span>
                          )}
                        </span>
                        <Input
                          inputMode="numeric"
                          placeholder="Qty"
                          aria-label={`Opening stock in ${warehouse.name}`}
                          className="h-9 w-20 text-right tabular-nums"
                          value={openingStock[warehouse.id]?.quantity ?? ""}
                          onChange={(e) => setStockField(warehouse.id, "quantity", e.target.value)}
                        />
                        <Input
                          inputMode="numeric"
                          placeholder="Alert"
                          aria-label={`Low stock alert threshold in ${warehouse.name}`}
                          className="h-9 w-20 text-right tabular-nums"
                          value={openingStock[warehouse.id]?.minQuantity ?? ""}
                          onChange={(e) =>
                            setStockField(warehouse.id, "minQuantity", e.target.value)
                          }
                        />
                      </div>
                    ))}
                </div>
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
