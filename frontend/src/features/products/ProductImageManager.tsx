import { StarIcon, TrashIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { resolveProductImageUrl } from "./api";
import {
  useDeleteProductImageMutation,
  useProductImages,
  useSetPrimaryProductImageMutation,
  useUploadProductImageMutation,
} from "./hooks";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Upload/manage a product's photos. Only usable once a product has an id
 * (i.e. after the first save), since images are stored against `product_id`.
 */
export function ProductImageManager({ productId }: { productId: string }) {
  const { data: images, isLoading } = useProductImages(productId);
  const uploadMutation = useUploadProductImageMutation(productId);
  const deleteMutation = useDeleteProductImageMutation(productId);
  const primaryMutation = useSetPrimaryProductImageMutation(productId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Unsupported file type", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image exceeds the 5 MB limit", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-accent" : "border-input",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <UploadIcon className="text-muted-foreground size-6" />
        <p className="text-muted-foreground text-sm">
          Drag an image here, or{" "}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {!isLoading && images && images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-md border"
            >
              <img
                src={resolveProductImageUrl(image.url) ?? undefined}
                alt=""
                className="size-full object-cover"
              />
              {image.is_primary && (
                <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">
                  Primary
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!image.is_primary && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-6"
                    title="Set as primary"
                    onClick={() => primaryMutation.mutate(image.id)}
                  >
                    <StarIcon className="size-3" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="size-6"
                  title="Delete"
                  onClick={() => deleteMutation.mutate(image.id)}
                >
                  <TrashIcon className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
