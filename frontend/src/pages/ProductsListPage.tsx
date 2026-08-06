import {
  ArrowRightIcon,
  CopyIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LayersIcon,
  ListTreeIcon,
  PackageIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useCategories } from "@/features/categories/hooks";
import type { ImportSummary, Product, ProductSort, ProductSortDir } from "@/features/products/api";
import {
  downloadImportTemplate,
  exportProductsExcel,
  importProductsExcel,
} from "@/features/products/api";
import { GroupedVariantsView } from "@/features/products/GroupedVariantsView";
import {
  useBulkDeleteProductsMutation,
  useDuplicateProductMutation,
  useGroupedVariants,
  useProducts,
  useVariantGroups,
} from "@/features/products/hooks";
import { BomEditorSheet } from "@/features/bom/BomEditorSheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { toast } from "@/lib/toast";
import { DataView, type DataColumn } from "@/components/patterns/DataView";
import { ListCard } from "@/components/patterns/ListCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

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

  // Generated variants are hidden from the main list and surfaced as families
  // below — a dozen tubes would otherwise bury everything else. Filtering to a
  // specific category shows them, which is what clicking a family does. A
  // search also shows them: hiding variants from a search would make "tube
  // liss" find nothing, since tubes only exist as variant rows.
  const showingOneCategory = categoryId !== null;
  const { data, isLoading } = useProducts(page, PAGE_SIZE, {
    search,
    status,
    sort,
    sortDir,
    includeVariants: showingOneCategory || search !== "",
    ...(categoryId ? { categoryId } : {}),
  });
  const { data: variantGroups } = useVariantGroups();
  // Filtering to a category that turns out to hold variants switches the whole
  // list to the nested colour view instead of the flat table — a category is
  // either "structural products with colours" or "ordinary products" in this
  // catalogue, never a mix, so there is no case where both need to render.
  const { data: groupedVariants } = useGroupedVariants(showingOneCategory ? categoryId : null);
  // A search is matched client-side against the grouped families (name + every
  // colour's SKU) because the grouped endpoint has no search parameter of its
  // own — "tube 19 liss" filters the nested view down to the right family.
  const filteredGroups = useMemo(() => {
    if (!groupedVariants) return groupedVariants;
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return groupedVariants;
    return groupedVariants.filter((group) => {
      const haystack =
        `${group.name} ${group.colors.map((color) => color.sku).join(" ")}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [groupedVariants, search]);
  const showGrouped = showingOneCategory && !!filteredGroups && filteredGroups.length > 0;
  const products = data?.data;
  const total = data?.meta.total ?? 0;
  const pages = data?.meta.pages ?? 1;
  const isFiltered = search !== "" || status !== "" || categoryId !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bomTarget, setBomTarget] = useState<{ id: string; name: string } | null>(null);
  const bulkDeleteMutation = useBulkDeleteProductsMutation();
  const duplicateMutation = useDuplicateProductMutation();

  // Clear the selection whenever the visible page changes. Acting on a
  // product that has scrolled out of view — especially deleting one — is the
  // kind of surprise a bulk action must not spring on you.
  const viewKey = `${filterKey}|${page}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setSelected(new Set());
  }

  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (allSelected: boolean) =>
    setSelected(allSelected ? new Set() : new Set((products ?? []).map((p) => p.id)));

  const selectedProducts = (products ?? []).filter((p) => selected.has(p.id));
  // Duplicate and recipe act on exactly one product: duplicating several at
  // once is confusing (each needs its own unique SKU) and a recipe belongs to
  // a single kit.
  const single = selectedProducts.length === 1 ? selectedProducts[0] : undefined;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTemplate = async () => {
    try {
      const blob = await downloadImportTemplate();
      downloadBlob(blob, "product_import_template.xlsx");
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExportProducts = async () => {
    setExporting(true);
    try {
      const blob = await exportProductsExcel();
      downloadBlob(blob, "products_export.xlsx");
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const describeImport = (summary: ImportSummary) => {
    const parts = [`${summary.created.length} created`, `${summary.updated.length} updated`];
    if (summary.errors.length > 0) parts.push(`${summary.errors.length} skipped`);
    return parts.join(", ");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const summary = await importProductsExcel(file);
      const hasErrors = summary.errors.length > 0;
      const firstErrors = summary.errors
        .slice(0, 3)
        .map((err) => `Row ${err.row}: ${err.message}`)
        .join(" · ");
      toast({
        title: describeImport(summary),
        variant: hasErrors ? "destructive" : "default",
        ...(hasErrors && {
          description: firstErrors + (summary.errors.length > 3 ? " · …" : ""),
          duration: 10000,
        }),
      });
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
        placeholder="Search by name, SKU or colour..."
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/products/generate">
              <WandSparklesIcon className="mr-1 size-4" />
              Generate
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleExportTemplate()}>
            <DownloadIcon className="mr-1 size-4" />
            Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            title="Export all products to Excel"
            onClick={() => void handleExportProducts()}
          >
            <FileSpreadsheetIcon className="mr-1 size-4" />
            {exporting ? "Exporting..." : "Export"}
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

      {!showingOneCategory && search === "" && variantGroups && variantGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="label-caps text-muted-foreground">Variant families</h2>
          <ul className="flex list-none flex-col gap-2">
            {variantGroups.map((group) => (
              <li key={group.category_id}>
                <button
                  type="button"
                  onClick={() => setCategoryId(group.category_id)}
                  className="hover:bg-accent focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2"
                >
                  <LayersIcon className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {group.category_name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {group.min_price === group.max_price
                      ? group.min_price
                      : `${group.min_price}–${group.max_price}`}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {group.variant_count}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Generated variants are grouped here instead of filling the list. Open a family to see
            and edit its variants.
          </p>
        </div>
      )}

      {selected.size > 0 && (
        <StickyActionBar className="md:justify-between md:rounded-md md:border md:bg-muted/40 md:p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!single || single.product_type !== "kit"}
              title={
                !single
                  ? "Select exactly one product"
                  : single.product_type !== "kit"
                    ? "Only kit products have a recipe"
                    : undefined
              }
              onClick={() => single && setBomTarget({ id: single.id, name: single.name })}
            >
              <ListTreeIcon className="mr-1 size-4" />
              Recipe
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!single || duplicateMutation.isPending}
              title={single ? undefined : "Select exactly one product"}
              onClick={() =>
                single &&
                duplicateMutation.mutate(single.id, {
                  onSuccess: () => setSelected(new Set()),
                })
              }
            >
              <CopyIcon className="mr-1 size-4" />
              Duplicate
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon className="mr-1 size-4" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </StickyActionBar>
      )}

      {showGrouped ? (
        <GroupedVariantsView groups={filteredGroups ?? []} />
      ) : (
        <DataView
          rows={isLoading ? undefined : (products ?? [])}
          columns={columns}
          keyExtractor={(p) => p.id}
          selectedIds={selected}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          renderCard={(p) => (
            <ListCard
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
          )}
          empty={
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
            )
          }
        />
      )}

      {!showGrouped && products !== undefined && products.length > 0 && (
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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} product{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              {selectedProducts
                .slice(0, 5)
                .map((p) => p.name)
                .join(", ")}
              {selectedProducts.length > 5 && ` and ${selectedProducts.length - 5} more`}.
              {" Their stock history is kept."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() =>
                bulkDeleteMutation.mutate([...selected], {
                  onSuccess: () => {
                    setSelected(new Set());
                    setConfirmDelete(false);
                  },
                  // Deliberately stays open on failure: the server refuses the
                  // whole batch when a product is used in a recipe, and the
                  // selection has to survive so you can untick it and retry.
                })
              }
            >
              {bulkDeleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bomTarget && (
        <BomEditorSheet
          kitProductId={bomTarget.id}
          kitName={bomTarget.name}
          open={bomTarget !== null}
          onOpenChange={(open) => !open && setBomTarget(null)}
        />
      )}
    </div>
  );
}
