import { ChevronRightIcon, ChevronDownIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { CategoryTreeNode } from "@/features/categories/api";

interface CategoryTreeProps {
  nodes: CategoryTreeNode[];
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
  depth?: number;
}

export function CategoryTree({ nodes, selectedId, onSelect, depth = 0 }: CategoryTreeProps) {
  if (nodes.length === 0) return null;

  return (
    <div className={cn(depth > 0 && "ml-4")}>
      {nodes.map((node) => (
        <CategoryNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}

function CategoryNode({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: CategoryTreeNode;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 text-sm",
          "hover:bg-accent hover:text-accent-foreground cursor-pointer",
          isSelected && "bg-accent text-accent-foreground font-medium",
        )}
        onClick={() => onSelect?.(node.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="hover:bg-accent rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {expanded && hasChildren ? (
          <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : hasChildren ? (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-4" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {expanded && hasChildren && (
        <CategoryTree nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} /> // eslint-disable-line react-hooks/rules-of-hooks
      )}
    </div>
  );
}
