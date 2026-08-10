import { zodResolver } from "@hookform/resolvers/zod";
import { ImageOffIcon, InfoIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import { uploadProductImage } from "@/features/products/api";
import { useCreateProductMutation } from "@/features/products/hooks";
import { toast } from "@/lib/toast";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price")
    .refine((value) => Number(value) > 0, "Price must be greater than zero"),
  description: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

/**
 * Creating a configurable product is two steps that belong together: the
 * product row, then its definition (options, per-length prices, recipe).
 *
 * Saving here creates the product and drops the admin straight into the
 * definition editor, exactly like a kit leads into its recipe editor.
 */
export function NewConfigurableProductPage() {
  const navigate = useNavigate();
  const createMutation = useCreateProductMutation();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // The product has no id until creation succeeds, so the photo is held here
  // and uploaded right after — then the admin lands on the definition editor.
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(null);
    setPreviewUrl(null);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues>({ resolver: zodResolver(productSchema) });

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(
      {
        ...values,
        categoryId: categoryId ?? undefined,
        productType: "configurable",
        // No stock of its own — components carry the stock, like a kit.
        openingStock: [],
      },
      {
        onSuccess: (product) => {
          if (photo) {
            void uploadProductImage(product.id, photo).catch(() => {
              toast({
                title: "Product created, but the photo didn't upload",
                description: "You can add it later from the product's screen.",
                variant: "destructive",
              });
            });
          }
          void navigate(`/configurable/${product.id}`);
        },
      },
    );
  });

  return (
    <PageShell size="form">
      <PageHeader
        title="New configurable product"
        description="Sold by options — support, motif, length and colour."
        back="/configurable"
      />

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <CategorySelector value={categoryId} onChange={setCategoryId} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <ImageOffIcon className="text-muted-foreground size-6" />
                )}
              </div>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <UploadIcon />
                {photo ? "Change photo" : "Add photo"}
              </Button>
              {photo && (
                <Button type="button" variant="ghost" onClick={clearPhoto}>
                  Remove
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  choosePhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Shown on the sales screen once the product is saved.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" placeholder="Triangle Double 28/19" {...register("name")} />
            {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" placeholder="Generated automatically" {...register("sku")} />
            {errors.sku && <p className="text-destructive text-sm">{errors.sku.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Base price</Label>
            <Input id="price" inputMode="decimal" placeholder="4600" {...register("price")} />
            {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
            <p className="text-muted-foreground text-xs">
              The till charges the per-length price you define next; this is the default shown in
              the product list.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" {...register("description")} />
          </div>

          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              No stock fields: a configurable product is never counted directly. Selling one deducts
              its resolved components from the selling warehouse.
            </span>
          </p>

          <div className="flex gap-2">
            <Button
              onClick={() => void onSubmit()}
              disabled={createMutation.isPending}
              className="flex-1"
            >
              {createMutation.isPending ? "Creating…" : "Create and define options"}
            </Button>
            <Button variant="outline" onClick={() => void navigate("/configurable")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
