import {
  AlertTriangleIcon,
  ArrowRightIcon,
  DownloadIcon,
  ImageOffIcon,
  LayoutGridIcon,
  PackageIcon,
  PlusIcon,
  TableIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useCategories } from "@/features/categories/hooks";
import type { Product, ProductSort, ProductSortDir } from "@/features/products/api";
import {
  downloadImportTemplate,
  importProductsExcel,
  resolveProductImageUrl,
} from "@/features/products/api";
import { useProducts } from "@/features/products/hooks";
import { toast } from "@/lib/toast";
import { DataView, type DataColumn } from "@/components/patterns/DataView";
import { ListCard } from "@/components/patterns/ListCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const VIEW_MODE_KEY = "products-view-mode";
type ViewMode = "table" | "cards";

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 rounded-md border px-3 py-2 text-sm";

const statusVariant: Record<string, "default" | "outline" | "secondary"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export function ProductsListPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<ProductSort>("name");
  const [sortDir, setSortDir] = useState<ProductSortDir>("asc");
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "table",
  );

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const { data: categories } = useCategories();

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const filterKey = `${search}|${status}|${categoryId}|${sort}|${sortDir}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, isLoading, isError, refetch } = useProducts(page, PAGE_SIZE, {
    search,
    status,
    sort,
    sortDir,
    ...(categoryId ? { categoryId } : {}),
  });
  const products = data?.data;
  const total = data?.meta.total ?? 0;
  const pages = data?.meta.pages ?? 1;
  const isFiltered = search !== "" || status !== "" || categoryId !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExportTemplate = async () => {
    try {
      const blob = await downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "product_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const created = await importProductsExcel(file);
      toast({ title: `Imported ${created.length} products` });
      window.location.reload();
    } catch {
      toast({
        title: "Import failed",
        description: "Check your file and try again.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const categoryOptions: SearchableSelectOption[] = [
    { value: "__all__", label: "All categories" },
    ...(categories ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];

  const columns: DataColumn<Product>[] = [
    {
      key: "name",
      header: "Name",
      cell: (p) => (
        <Link to={`/products/${p.id}`} className="text-primary underline-offset-4 hover:underline">
          {p.name}
        </Link>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      cell: (p) => <span className="text-muted-foreground">{p.sku}</span>,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      className: "tabular-nums",
      cell: (p) => p.price,
    },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/transfers/new?product=${p.id}&warehouse=${p.default_warehouse_id ?? ""}`}>
            <ArrowRightIcon className="mr-1 size-3" />
            Transfer
          </Link>
        </Button>
      ),
    },
  ];

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search by name or SKU..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-xs"
      />
      <SearchableSelect
        options={categoryOptions}
        value={categoryId ?? "__all__"}
        onChange={(val) => setCategoryId(val === "__all__" ? null : val)}
        placeholder="All categories"
        className="w-48"
      />
      <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <select
        className={selectClass}
        value={sort}
        onChange={(e) => setSort(e.target.value as ProductSort)}
      >
        <option value="name">Sort by name</option>
        <option value="sku">Sort by SKU</option>
        <option value="price">Sort by price</option>
      </select>
      <select
        className={selectClass}
        value={sortDir}
        onChange={(e) => setSortDir(e.target.value as ProductSortDir)}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-fab sm:px-6 sm:pt-6 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex items-center gap-2">
          {isDesktop && (
            <div className="bg-muted flex items-center gap-0.5 rounded-md p-0.5">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2"
                aria-pressed={viewMode === "table"}
                aria-label="Table view"
                onClick={() => setViewMode("table")}
              >
                <TableIcon className="size-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2"
                aria-pressed={viewMode === "cards"}
                aria-label="Card view"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGridIcon className="size-4" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleExportTemplate()}>
            <DownloadIcon className="mr-1 size-4" />
            Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="mr-1 size-4" />
            {importing ? "Importing..." : "Import"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => void handleImportFile(e)}
          />
          {isDesktop && (
            <Button asChild>
              <Link to="/products/new">
                <PlusIcon />
                New product
              </Link>
            </Button>
          )}
        </div>
      </div>

      {filters}

      {!isLoading && isError && (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load products"
          description="Something went wrong fetching your products. Check your connection and try again."
          action={{ label: "Retry", onClick: () => void refetch() }}
        />
      )}

      {!isError &&
        (() => {
          const renderCard = (p: Product) => (
            <ListCard
              image={resolveProductImageUrl(p.image_url)}
              title={p.name}
              subtitle={p.sku}
              meta={<Badge variant={statusVariant[p.status] ?? "outline"}>{p.status}</Badge>}
              trailing={p.price}
              to={`/products/${p.id}`}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    to={`/transfers/new?product=${p.id}&warehouse=${p.default_warehouse_id ?? ""}`}
                  >
                    <ArrowRightIcon className="mr-1 size-3" />
                    Transfer
                  </Link>
                </Button>
              }
            />
          );

          const renderKanbanCard = (p: Product) => {
            const imageUrl = resolveProductImageUrl(p.image_url);
            return (
              <Link
                to={`/products/${p.id}`}
                className="bg-card hover:border-foreground/30 flex flex-col overflow-hidden rounded-md border transition-colors"
              >
                <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden">
                  {imageUrl ? (
                    <img src={imageUrl} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <ImageOffIcon className="text-muted-foreground size-8" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{p.sku}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Badge variant={statusVariant[p.status] ?? "outline"}>{p.status}</Badge>
                    <span className="text-sm font-medium tabular-nums">{p.price}</span>
                  </div>
                </div>
              </Link>
            );
          };

          const empty =
            total === 0 && !isFiltered ? (
              <EmptyState
                icon={PackageIcon}
                title="No products yet"
                description="Add your first product to start tracking inventory."
                action={{ label: "New product", onClick: () => void navigate("/products/new") }}
              />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No products match your search or filters.
              </p>
            );

          if (isDesktop && viewMode === "cards") {
            if (isLoading) {
              return (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
                  ))}
                </div>
              );
            }
            if (!products || products.length === 0) return empty;
            return (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => (
                  <div key={p.id}>{renderKanbanCard(p)}</div>
                ))}
              </div>
            );
          }

          return (
            <DataView
              rows={isLoading ? undefined : (products ?? [])}
              columns={columns}
              keyExtractor={(p) => p.id}
              renderCard={renderCard}
              empty={empty}
            />
          );
        })()}

      {products !== undefined && products.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {!isDesktop && (
        <Fab label="New product" asChild>
          <Link to="/products/new">
            <PlusIcon />
          </Link>
        </Fab>
      )}
    </div>
  );
}
