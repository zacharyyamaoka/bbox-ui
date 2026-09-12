"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { useTree } from "@headless-tree/react";
import { dragAndDropFeature, hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core";
import type { DragTarget, FeatureImplementation, ItemInstance } from "@headless-tree/core";
import type { InstanceNode } from "@bbox-ui/panel";
import { cn } from "@/lib/utils";
import type { NavigatorProps, NavigatorVariant } from "./contract";

const ROOT_ID = "__root__";

/**
 * V3 · @headless-tree/react — the only variant whose stock part owns
 * SELECTION itself: `item.getProps()` already wires click / ctrl-click /
 * shift-click ranging and Left/Right fold-or-move, so there is no shared
 * reducer here at all. Drag and drop, when the page supplies `onMove`, is
 * the same part's `dragAndDropFeature` rather than a second library.
 */
function HeadlessTreeNavigator(p: NavigatorProps) {
  // Every folder starts open, and a node that gains children later opens
  // the first time it is seen with them; a fold the user made stays
  // folded because that id is already known.
  const folderIds = (nodes: InstanceNode[]): string[] => nodes.flatMap((n) => (n.children.length > 0 ? [n.id, ...folderIds(n.children)] : []));
  const [expandedItems, setExpandedItems] = useState<string[]>(() => folderIds(p.roots));
  const knownFolders = useRef<Set<string>>(new Set(folderIds(p.roots)));
  useEffect(() => {
    const fresh = folderIds(p.roots).filter((id) => !knownFolders.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) knownFolders.current.add(id);
    setExpandedItems((prev) => Array.from(new Set([...prev, ...fresh])));
  }, [p.roots]);

  // dataLoader reads this map by closure; rebuilt every render so it never
  // serves stale children, then `rebuildTree()` tells headless-tree its
  // cached structure is invalid whenever the roots themselves change.
  const byId = useMemo(() => {
    const map = new Map<string, InstanceNode>();
    const visit = (nodes: InstanceNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        visit(n.children);
      }
    };
    visit(p.roots);
    map.set(ROOT_ID, { id: ROOT_ID, type: "root", title: "", untitled: true, badge: null, container: true, children: p.roots });
    return map;
  }, [p.roots]);

  const features: FeatureImplementation[] = useMemo(() => {
    const base = [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature];
    return p.onMove ? [...base, dragAndDropFeature] : base;
  }, [p.onMove]);

  const targetParentId = (target: DragTarget<InstanceNode>) => (target.item.getId() === ROOT_ID ? null : target.item.getId());

  const tree = useTree<InstanceNode>({
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().title,
    isItemFolder: (item) => item.getItemData().children.length > 0,
    dataLoader: {
      getItem: (id) => byId.get(id)!,
      getChildren: (id) => (byId.get(id)?.children ?? []).map((c) => c.id),
    },
    indent: 14,
    state: { selectedItems: p.selectedIds, expandedItems },
    setSelectedItems: (updater) => {
      const next = typeof updater === "function" ? (updater as (old: string[]) => string[])(p.selectedIds) : updater;
      p.onSelectionChange(next);
    },
    setExpandedItems,
    canDrop: (items, target) => items.every((i) => p.canDrop?.(i.getId(), targetParentId(target)) ?? false),
    onDrop: (items, target) => {
      const base = "childIndex" in target ? target.childIndex : target.item.getItemData().children.length;
      items.forEach((item, k) => p.onMove?.(item.getId(), targetParentId(target), base + k));
    },
    features,
  });

  useEffect(() => {
    tree.rebuildTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.roots]);

  return (
    <div {...tree.getContainerProps("Instances")} data-slot="instance-navigator" data-navigator="headless" className="relative flex flex-col gap-0.5">
      {p.onMove && tree.getDragLineData() && <div style={tree.getDragLineStyle()} className="pointer-events-none absolute z-10 h-0.5 bg-sidebar-ring" />}
      {tree.getItems().map((item: ItemInstance<InstanceNode>) => {
        const data = item.getItemData();
        const selected = item.isSelected();
        const expanded = item.isExpanded();
        const hasKids = item.isFolder();
        const level = item.getItemMeta().level;
        return (
          <button
            key={item.getId()}
            {...item.getProps()}
            data-slot="nav-row"
            data-instance-id={data.id}
            data-instance-type={data.type}
            data-depth={level}
            data-selected={selected}
            aria-selected={selected}
            style={{ paddingLeft: level * 14 + 6 }}
            className={cn(
              "flex h-7 w-full cursor-default select-none items-center gap-1.5 rounded-sm pr-2 text-left text-xs",
              selected && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            title={`${data.type} · ${data.id}`}
          >
            {hasKids ? (
              <span
                role="button"
                data-slot="nav-disclosure"
                aria-expanded={expanded}
                onClick={(e) => {
                  e.stopPropagation();
                  expanded ? item.collapse() : item.expand();
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border"
              >
                <ChevronRightIcon className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
              </span>
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
              {p.glyph(data.type)}
            </span>
            <span data-slot="nav-title" className={cn("min-w-0 flex-1 truncate text-xs", data.untitled && "text-muted-foreground")}>
              {data.title}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/70">{data.type}</span>
          </button>
        );
      })}
    </div>
  );
}

export const HEADLESS_TREE: NavigatorVariant = {
  id: "headless",
  label: "headless-tree",
  blurb: "The one part that owns selection itself — click / ctrl / shift ranging and arrow-key fold-or-move come for free from item.getProps(), with no shared reducer at all.",
  stockPart: "useTree from @headless-tree/react with selectionFeature, hotkeysCoreFeature, dragAndDropFeature, syncDataLoaderFeature",
  Navigator: HeadlessTreeNavigator,
};
