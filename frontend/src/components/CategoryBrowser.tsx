import { ArrowLeftIcon, ArrowRightIcon, FolderIcon, PackageIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CategoryTreeNode } from "@/features/categories/api";
import type { WarehouseStockItem } from "@/features/inventory/api";

interface CategoryBrowserProps {
  tree: CategoryTreeNode[];
  stock: WarehouseStockItem[];
  currentCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
}

function collectDescendantIds(node: CategoryTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

function countProductsInCategory(
  categoryId: string,
  tree: CategoryTreeNode[],
  stock: WarehouseStockItem[],
): number {
  const node = findNode(categoryId, tree);
  if (!node) return 0;
  const ids = [categoryId, ...collectDescendantIds(node)];
  return stock.filter((s) => s.category_id && ids.includes(s.category_id)).length;
}

function findNode(id: string, nodes: CategoryTreeNode[]): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(id, node.children);
    if (found) return found;
  }
  return null;
}

function getAncestorPath(categoryId: string, tree: CategoryTreeNode[]): CategoryTreeNode[] {
  function walk(nodes: CategoryTreeNode[]): CategoryTreeNode[] | null {
    for (const node of nodes) {
      if (node.id === categoryId) return [node];
      const childPath = walk(node.children);
      if (childPath) return [node, ...childPath];
    }
    return null;
  }
  return walk(tree) ?? [];
}

function productsInCategory(
  categoryId: string,
  tree: CategoryTreeNode[],
  stock: WarehouseStockItem[],
): WarehouseStockItem[] {
  const node = findNode(categoryId, tree);
  if (!node) return [];
  const ids = [categoryId, ...collectDescendantIds(node)];
  return stock.filter((s) => s.category_id && ids.includes(s.category_id));
}

export function CategoryBrowser({
  tree,
  stock,
  currentCategoryId,
  onSelectCategory,
}: CategoryBrowserProps) {
  const ancestors = currentCategoryId ? getAncestorPath(currentCategoryId, tree) : [];

  const currentNode = currentCategoryId ? findNode(currentCategoryId, tree) : null;
  const displayChildren = currentNode ? currentNode.children : tree;

  const visibleProducts = currentCategoryId
    ? productsInCategory(currentCategoryId, tree, stock)
    : [];

  const isLeaf = currentNode && currentNode.children.length === 0;

  // Indexing can yield undefined under noUncheckedIndexedAccess, so read the
  // entry once and fall back rather than asserting.
  const parentCategoryId = ancestors[ancestors.length - 2]?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Back button + Breadcrumb */}
      {ancestors.length > 0 && (
        <nav className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={() => onSelectCategory(parentCategoryId)}>
            <ArrowLeftIcon className="mr-1 size-3" />
            Back
          </Button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSelectCategory(null)}
          >
            All
          </button>
          {ancestors.map((a, i) => (
            <span key={a.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              {i === ancestors.length - 1 ? (
                <span className="font-medium">{a.name}</span>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onSelectCategory(a.id)}
                >
                  {a.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Subcategory cards */}
      {displayChildren.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {displayChildren.map((child) => {
            const count = countProductsInCategory(child.id, tree, stock);
            const hasChildren = child.children.length > 0;
            return (
              <button
                key={child.id}
                type="button"
                className="text-left"
                onClick={() => onSelectCategory(child.id)}
              >
                <Card className="hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-3 p-4">
                    {hasChildren ? (
                      <FolderIcon className="size-8 shrink-0 text-muted-foreground" />
                    ) : (
                      <PackageIcon className="size-8 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{child.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {count} product{count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Products table at leaf level */}
      {isLeaf && visibleProducts.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 text-right font-medium">On Hand</th>
                <th className="px-4 py-2 text-right font-medium">Available</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((item) => (
                <tr key={item.product_id} className="hover:bg-accent/50 border-t">
                  <td className="px-4 py-2">
                    <Link
                      to={`/products/${item.product_id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {item.product_name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-4 py-2">{item.sku}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{item.quantity_on_hand}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{item.available_quantity}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/transfers">
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
      )}

      {isLeaf && visibleProducts.length === 0 && (
        <p className="text-muted-foreground text-sm">No products with stock in this category.</p>
      )}
    </div>
  );
}
