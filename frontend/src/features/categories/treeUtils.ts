import type { WarehouseStockItem } from "@/features/inventory/api";

import type { CategoryTreeNode } from "./api";

export function findCategoryNode(
  id: string | null,
  nodes: CategoryTreeNode[],
): CategoryTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCategoryNode(id, node.children);
    if (found) return found;
  }
  return null;
}

/** Every descendant id below (and including) `node`, depth-first. */
export function collectDescendantIds(node: CategoryTreeNode): string[] {
  const ids: string[] = [node.id];
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

/** Number of stock rows whose category lies under `categoryId`, counting
 * subcategories, so parent cards show meaningful totals in the warehouse
 * browser. */
export function countProductsInCategory(
  categoryId: string,
  tree: CategoryTreeNode[],
  stock: WarehouseStockItem[],
): number {
  const node = findCategoryNode(categoryId, tree);
  if (!node) return 0;
  const ids = new Set(collectDescendantIds(node));
  return stock.filter((s) => s.category_id !== null && ids.has(s.category_id)).length;
}

/** Stock rows belonging to `categoryId` including its subcategories. */
export function productsInCategory(
  categoryId: string,
  tree: CategoryTreeNode[],
  stock: WarehouseStockItem[],
): WarehouseStockItem[] {
  const node = findCategoryNode(categoryId, tree);
  if (!node) return [];
  const ids = new Set(collectDescendantIds(node));
  return stock.filter((s) => s.category_id !== null && ids.has(s.category_id));
}
