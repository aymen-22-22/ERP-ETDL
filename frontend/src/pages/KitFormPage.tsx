import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelector } from "@/features/categories/CategorySelector";
import { BomEditorSheet } from "@/features/bom/BomEditorSheet";
import { useCreateProductMutation } from "@/features/products/hooks";

const kitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price")
    .refine((value) => Number(value) > 0, "Price must be greater than zero"),
  description: z.string().optional(),
  categoryId: z.string().optional().or(z.literal("")),
});

type KitFormValues = z.infer<typeof kitSchema>;

/**
 * Creating a kit is two steps that belong together: the product itself, then
 * its recipe.
 *
 * They cannot be one request — a recipe line points at a product id, so the
 * kit has to exist before it can have components. Rather than sending you back
 * to the list to find what you just made, saving here opens the recipe editor
 * straight away on the new kit.
 */
export function KitFormPage() {
  const navigate = useNavigate();
  const createMutation = useCreateProductMutation();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KitFormValues>({ resolver: zodResolver(kitSchema) });

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(
      {
        ...values,
        categoryId: categoryId ?? undefined,
        productType: "kit",
        // A kit holds no stock of its own, so no opening count and no default
        // warehouse — its components carry the stock.
        openingStock: [],
      },
      { onSuccess: (product) => setCreated({ id: product.id, name: product.name }) },
    );
  });

  return (
    <PageShell size="form">
      <PageHeader
        title="New kit"
        description="Assembled from components; holds no stock itself."
        back="/products/new"
      />

      <Card>
        <CardHeader>
          <CardTitle>Kit details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <CategorySelector value={categoryId} onChange={setCategoryId} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" placeholder="Triangle Fix 4600 DA" {...register("name")} />
            {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" placeholder="Generated automatically" {...register("sku")} />
            <p className="text-muted-foreground text-xs">
              Leave blank and one is generated from the category (Triangle Fix &rarr; TF-001).
            </p>
            {errors.sku && <p className="text-destructive text-sm">{errors.sku.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Selling price</Label>
            <Input id="price" inputMode="decimal" placeholder="4600" {...register("price")} />
            {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
            <p className="text-muted-foreground text-xs">
              The cost is worked out from the recipe, so the margin appears once you add components.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" {...register("description")} />
          </div>

          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              No stock fields: a kit is never counted directly. Selling one deducts its components
              from the selling warehouse.
            </span>
          </p>

          <div className="flex gap-2">
            <Button
              onClick={() => void onSubmit()}
              disabled={createMutation.isPending}
              className="flex-1"
            >
              {createMutation.isPending ? "Creating…" : "Create and add recipe"}
            </Button>
            <Button variant="outline" onClick={() => void navigate("/products")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      {created && (
        <BomEditorSheet
          kitProductId={created.id}
          kitName={created.name}
          open
          onOpenChange={(open) => {
            if (open) return;
            // The kit exists either way at this point; closing the recipe
            // editor just means "I'll fill it in later".
            setCreated(null);
            void navigate("/products");
          }}
        />
      )}
    </PageShell>
  );
}
