import { ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { listProducts } from "@/features/products/api";
import type { Product } from "@/features/products/api";

interface ProductSearchSelectProps {
  value: string | null;
  onChange: (productId: string, productName: string, sku: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface ProductHit {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
}

export function ProductSearchSelect({
  value,
  onChange,
  placeholder = "Search by name, SKU, or barcode…",
  className,
  disabled = false,
}: ProductSearchSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const { data: productsPage } = useQuery({
    queryKey: ["products", "search", 1, 200],
    queryFn: () => listProducts(1, 200),
  });

  const allProducts: ProductHit[] = useMemo(() => {
    return (productsPage?.data ?? []).map((p: Product) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
    }));
  }, [productsPage]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allProducts.slice(0, 50);
    return allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle) ||
          (p.barcode && p.barcode.toLowerCase().includes(needle)),
      )
      .slice(0, 50);
  }, [allProducts, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const found = allProducts.find((p) => p.id === value);
    return found ? `${found.name} (${found.sku})` : null;
  }, [value, allProducts]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback(
    (product: ProductHit) => {
      onChange(product.id, product.name, product.sku);
      close();
    },
    [onChange, close],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const product = filtered[activeIndex];
      if (product) handleSelect(product);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const activeOptionId = filtered[activeIndex]
    ? `${listboxId}-option-${filtered[activeIndex].id}`
    : undefined;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "border-input bg-background flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-base shadow-xs transition-colors outline-none md:h-9 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring ring-ring/50 ring-2",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel ?? "No product selected"}
        </span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="bg-popover text-popover-foreground absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <div className="border-b p-1">
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              className="h-10 border-0 shadow-none focus-visible:ring-0 md:h-9"
            />
          </div>
          <ul id={listboxId} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="text-muted-foreground py-3 text-center text-sm">No products found.</li>
            )}
            {filtered.map((product, index) => (
              <li key={product.id}>
                <button
                  id={`${listboxId}-option-${product.id}`}
                  type="button"
                  role="option"
                  aria-selected={product.id === value}
                  onClick={() => handleSelect(product)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex min-h-11 w-full flex-col justify-center rounded-sm px-2 py-2 text-left text-sm outline-none",
                    index === activeIndex && "bg-accent text-accent-foreground",
                    product.id === value && "font-medium",
                  )}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {product.sku}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
