import { ArrowRightIcon, PackageIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { TableLoader } from "@/components/TableLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useCategories } from "@/features/categories/hooks";
import type { ProductSort, ProductSortDir } from "@/features/products/hooks";
import { useProducts } from "@/features/products/hooks";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 rounded-md border px-3 py-2 text-sm";

export function ProductsListPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<ProductSort>("name");
  const [sortDir, setSortDir] = useState<ProductSortDir>("asc");
  const navigate = useNavigate();

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

  const { items: products, total, pages } = useProducts(page, PAGE_SIZE, {
    search,
    status,
    sort,
    sortDir,
  });
  const isFiltered = search !== "" || status !== "" || categoryId !== null;

  const isLoading = products === undefined;

  const categoryOptions: SearchableSelectOption[] = [
    { value: "__all__", label: "All categories" },
    ...((categories ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    }))),
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild>
          <Link to="/products/new">
            <PlusIcon />
            New product
          </Link>
        </Button>
      </div>

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
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
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

      {isLoading && <TableLoader rows={5} columns={3} />}

      {!isLoading && total === 0 && !isFiltered && (
        <EmptyState
          icon={PackageIcon}
          title="No products yet"
          description="Add your first product to start tracking inventory."
          action={{ label: "New product", onClick: () => void navigate("/products/new") }}
        />
      )}

      {!isLoading && total === 0 && isFiltered && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No products match your search or filters.
        </p>
      )}

      {!isLoading && total > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(products ?? []).map((product) => (
                  <tr key={product.id} className="hover:bg-accent/50 border-t">
                    <td className="px-4 py-2">
                      <Link
                        to={`/products/${product.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-4 py-2">{product.sku}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{product.price}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to={`/transfers/new?product=${product.id}&warehouse=${product.defaultWarehouseId ?? ""}`}
                        >
                          <ArrowRightIcon className="mr-1 size-3" />
                          Transfer
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
        </>
      )}
    </div>
  );
}
