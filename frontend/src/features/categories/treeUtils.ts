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

/** Number of distinct product families under `categoryId`, counting
 * subcategories.  Variant products sharing the same name count as one
 * family so the warehouse browser's header doesn't overstate the count. */
export function countProductsInCategory(
  categoryId: string,
  tree: CategoryTreeNode[],
  stock: WarehouseStockItem[],
): number {
  const node = findCategoryNode(categoryId, tree);
  if (!node) return 0;
  const ids = new Set(collectDescendantIds(node));
  const matching = stock.filter((s) => s.category_id !== null && ids.has(s.category_id));
  const seen = new Set<string>();
  let count = 0;
  for (const s of matching) {
    const key = s.product_type === "variant" ? s.product_name : s.product_id;
    if (seen.has(key)) continue;
    seen.add(key);
    count++;
  }
  return count;
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
