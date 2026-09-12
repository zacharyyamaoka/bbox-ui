"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import type { ItemDropTarget, Key, Selection } from "react-aria-components";
import { Button, DropIndicator, Tree, TreeItem, TreeItemContent, useDragAndDrop } from "react-aria-components";
import type { InstanceNode } from "@bbox-ui/panel";
import { cn } from "@/lib/utils";
import type { NavigatorProps, NavigatorVariant } from "./contract";

/**
 * V2 · React Aria `<Tree>` — the accessibility-first part, with file-manager
 * selection built in: `selectionMode="multiple"` + `selectionBehavior="replace"`
 * already give plain-click-replaces / ctrl-toggle / shift-range, so unlike the
 * shadcn variant there is no shared reducer here either. Drag and drop is the
 * same part's `useDragAndDrop`, wired to re-parent through `onMove` and to
 * refuse a bad drop via `getDropOperation`/`shouldAcceptItemDrop`.
 */

/** Every id, every id with children (for the initial fold state), and each
 *  id's parent + ordered sibling list — enough to resolve any drop target
 *  back into (parentId, index) without re-walking the tree per drag. */
function indexTree(roots: InstanceNode[]) {
  const allIds: string[] = [];
  const withChildren: string[] = [];
  const parentOf = new Map<string, string | null>();
  const byId = new Map<string, InstanceNode>();
  const visit = (nodes: InstanceNode[], parent: string | null) => {
    for (const n of nodes) {
      allIds.push(n.id);
      parentOf.set(n.id, parent);
      byId.set(n.id, n);
      if (n.children.length > 0) withChildren.push(n.id);
      visit(n.children, n.id);
    }
  };
  visit(roots, null);
  const childrenOf = (parentId: string | null): string[] =>
    parentId === null ? roots.map((r) => r.id) : (byId.get(parentId)?.children.map((c) => c.id) ?? []);
  return { allIds, withChildren, parentOf, childrenOf };
}

function AriaTreeNavigator(p: NavigatorProps) {
  const { allIds, withChildren, parentOf, childrenOf } = useMemo(() => indexTree(p.roots), [p.roots]);
  // Computed once on mount, then controlled locally — folds must survive a
  // re-render when instances change, not reset to "everything open" on
  // every keystroke.
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(() => new Set(withChildren));
  // A node that GAINS children later (a Stack that just got its first
  // member, a Block that arrived with its slots) opens the first time it
  // is seen with children; a node the user folded stays folded because it
  // is already known.
  const known = useRef<Set<string>>(new Set(withChildren));
  useEffect(() => {
    const fresh = withChildren.filter((id) => !known.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) known.current.add(id);
    setExpandedKeys((prev) => new Set([...prev, ...fresh]));
  }, [withChildren]);
  // getItems (drag start) is the only callback that sees the actual dragged
  // keys; getDropOperation/shouldAcceptItemDrop only see MIME-ish `types`,
  // so the keys are stashed here for those to read back.
  const draggedKeys = useRef<Set<Key>>(new Set());
  const lastSelection = useRef<Selection | null>(null);
  const selectionFor = (ids: string[]): Selection => {
    const last = lastSelection.current;
    if (last && last !== "all" && last.size === ids.length && ids.every((id) => last.has(id))) return last;
    return new Set<Key>(ids);
  };

  const resolveDrop = (target: ItemDropTarget): { parentId: string | null; index: number } => {
    const key = String(target.key);
    if (target.dropPosition === "on") return { parentId: key, index: childrenOf(key).length };
    const parentId = parentOf.get(key) ?? null;
    const at = childrenOf(parentId).indexOf(key);
    return { parentId, index: target.dropPosition === "after" ? at + 1 : at };
  };

  const canAcceptDrop = (target: ItemDropTarget) => {
    const { parentId } = resolveDrop(target);
    return Array.from(draggedKeys.current).every((k) => p.canDrop?.(String(k), parentId) ?? true);
  };

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => {
      draggedKeys.current = keys;
      return Array.from(keys).map((k) => ({ "text/plain": String(k) }));
    },
    onMove: (e) => {
      const { parentId, index } = resolveDrop(e.target);
      Array.from(e.keys).forEach((k, i) => p.onMove?.(String(k), parentId, index + i));
    },
    shouldAcceptItemDrop: (target) => canAcceptDrop(target),
    getDropOperation: (target) => (target.type === "item" && !canAcceptDrop(target) ? "cancel" : "move"),
    renderDropIndicator: (target) => <DropIndicator target={target} className="h-0.5 bg-sidebar-ring data-[drop-target]:opacity-100" />,
  });

  const renderNode = (node: InstanceNode, depth: number) => {
    const selected = p.selectedIds.includes(node.id);
    return (
      <TreeItem
        key={node.id}
        id={node.id}
        textValue={node.title}
        data-instance-id={node.id}
        data-instance-type={node.type}
        data-depth={depth}
        data-selected={selected}
        className="outline-none"
      >
        <TreeItemContent>
          {({ isExpanded, hasChildItems, level, isSelected }) => (
            <div
              data-slot="nav-row"
              data-instance-id={node.id}
              data-instance-type={node.type}
              data-depth={depth}
              data-selected={isSelected}
              data-focused={undefined}
              className={cn(
                "flex h-7 w-full cursor-default select-none items-center gap-1.5 pr-2 text-xs",
                isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              style={{ paddingLeft: (level - 1) * 14 + 6 }}
              title={`${node.type} · ${node.id}`}
            >
              {hasChildItems ? (
                <Button
                  slot="chevron"
                  data-slot="nav-disclosure"
                  aria-expanded={isExpanded}
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
                </Button>
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
                {p.glyph(node.type)}
              </span>
              <span data-slot="nav-title" className={cn("min-w-0 flex-1 truncate text-xs", node.untitled && "text-muted-foreground")}>
                {node.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.type}</span>
              {/* React Aria's rule, not ours: a draggable item must carry a
                  Button slot="drag" so keyboard and screen-reader users can
                  start the drag. It warned in the console until this
                  existed — the stock part enforcing its own accessibility. */}
              {p.onMove && (
                <Button slot="drag" data-slot="nav-drag" aria-label={`Drag ${node.title}`} className="ml-1 shrink-0 cursor-grab text-[10px] text-muted-foreground/60 hover:text-foreground">
                  ⋮⋮
                </Button>
              )}
            </div>
          )}
        </TreeItemContent>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </TreeItem>
    );
  };

  return (
    <Tree
      aria-label="Instances"
      data-slot="instance-navigator"
      data-navigator="aria"
      selectionMode="multiple"
      selectionBehavior="replace"
      // WHY the Selection object is handed back rather than a fresh Set:
      // React Aria keeps the shift-click ANCHOR on the Selection it emits
      // (`anchorKey`, `currentKey`). A controlled `new Set(ids)` has no
      // anchor, so `extendSelection` ranged from the clicked key to itself
      // and shift-click degraded to add-one. The journey caught it: 3 of 9.
      selectedKeys={selectionFor(p.selectedIds)}
      onSelectionChange={(keys: Selection) => {
        lastSelection.current = keys;
        p.onSelectionChange(keys === "all" ? allIds : Array.from(keys).map(String));
      }}
      expandedKeys={expandedKeys}
      onExpandedChange={setExpandedKeys}
      dragAndDropHooks={p.onMove ? dragAndDropHooks : undefined}
      className="flex flex-col gap-0.5 outline-none"
    >
      {p.roots.map((r) => renderNode(r, 0))}
    </Tree>
  );
}

export const ARIA_TREE: NavigatorVariant = {
  id: "aria",
  label: "React Aria Tree",
  blurb: "The accessibility-first part: file-manager click/ctrl/shift selection and arrow-key fold-or-move come from selectionBehavior=\"replace\" alone, with drag re-parenting from the same part's useDragAndDrop.",
  stockPart: "Tree / TreeItem / TreeItemContent + useDragAndDrop from react-aria-components",
  Navigator: AriaTreeNavigator,
};
