import { resolveProductImageUrl, resolveProductThumbUrl } from "@/features/products/api";

interface ProductImageProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** Show the ~512px webp thumbnail first, falling back to the original. */
  thumb?: boolean;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Renders a product/category/warehouse media URL. Shows the downscaled webp
 * thumbnail (see `resolveProductThumbUrl`) in grids and cards so the browser
 * downloads kilobytes instead of the full-resolution original, then falls
 * back to the original when the thumbnail is missing (e.g. images uploaded
 * before thumbnails existed) or fails to load.
 */
export function ProductImage({
  src,
  alt = "",
  className,
  thumb = true,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
}: ProductImageProps) {
  const full = resolveProductImageUrl(src);
  if (!full) return null;
  const initial = thumb ? (resolveProductThumbUrl(full) ?? full) : full;
  return (
    <img
      src={initial}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={(event) => {
        if (event.currentTarget.src !== full) {
          event.currentTarget.onerror = null;
          event.currentTarget.src = full;
        }
      }}
    />
  );
}
