import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

import { useCategoryTree } from "./hooks";
import type { CategoryTreeNode } from "./api";

interface CategorySelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean | undefined;
  className?: string | undefined;
}

function flattenTree(
  nodes: CategoryTreeNode[],
  prefix = "",
): { id: string; label: string; description?: string | undefined }[] {
  const result: { id: string; label: string; description?: string | undefined }[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix} > ${node.name}` : node.name;
    result.push({ id: node.id, label: path, description: node.description ?? undefined });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, path));
    }
  }
  return result;
}

export function CategorySelector({ value, onChange, className }: CategorySelectorProps) {
  const { data: tree, isLoading } = useCategoryTree();

  const flat = flattenTree(tree ?? []);

  const options: SearchableSelectOption[] = flat.map((c) => ({
    value: c.id,
    label: c.label,
    description: c.description,
  }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={isLoading ? "Loading..." : "Select category..."}
      emptyText="No categories."
      className={className}
    />
  );
}
