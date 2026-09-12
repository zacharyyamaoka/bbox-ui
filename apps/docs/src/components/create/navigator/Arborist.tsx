"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Tree } from "react-arborist";
import type { MoveHandler, NodeRendererProps, TreeApi } from "react-arborist";
import type { InstanceNode } from "@bbox-ui/panel";
import { cn } from "@/lib/utils";
import type { NavigatorProps, NavigatorVariant } from "./contract";

const ROW_HEIGHT = 28;

function countRows(nodes: InstanceNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countRows(n.children), 0);
}

/**
 * V· react-arborist — the VS Code explorer, stock.
 *
 * `<Tree>` ships the whole contract for free: virtualised rows, shift-range
 * and ctrl/meta-toggle multi-selection, arrow-key navigation with Left/Right
 * fold, and drag-and-drop re-parenting with a `disableDrop` refusal hook.
 * The one thing it does NOT expose as a controlled prop is a selected-id
 * *set* — `selection` only takes one id — so selection stays the part's own
 * internal state and is pushed back into sync with `p.selectedIds` via the
 * imperative `TreeApi.setSelection`, guarded against echoing our own change
 * back at ourselves.
 */
function ArboristNavigator(p: NavigatorProps) {
  const treeRef = useRef<TreeApi<InstanceNode> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(() => Math.max(120, countRows(p.roots) * ROW_HEIGHT + 8));

  // Arborist needs a numeric height (it virtualises). Size it to its
  // CONTENT — every visible row — and let the sidebar column scroll.
  //
  // WHY not the container's height: the sidebar group gives the tree no
  // height of its own (it is a flow child), so "available" measured 120px
  // and arborist virtualised the Block's seven slot fills out of the DOM.
  // A journey then read four rows where there were thirteen. The tree is
  // small; letting the column scroll costs nothing, virtualising here
  // costs the rows.
  const measureRef = useRef<() => void>(() => {});
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rows = treeRef.current?.visibleNodes.length ?? countRows(p.roots);
      setHeight(Math.max(ROW_HEIGHT + 8, rows * ROW_HEIGHT + 8));
    };
    measureRef.current = measure;
    measure();
    // Folding changes the visible row count without changing `roots`, so
    // re-measure on the next frame after any tree interaction as well.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const id = window.setInterval(measure, 250);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [p.roots]);

  // Push our controlled selection into the part whenever it drifts —
  // guarded so a selection WE just reported back via onSelect doesn't
  // bounce straight back in as a redundant setSelection call.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const current = tree.selectedIds;
    const next = p.selectedIds;
    const same = current.size === next.length && next.every((id) => current.has(id));
    if (same) return;
    const last = next[next.length - 1] ?? null;
    tree.setSelection({ ids: next, anchor: last, mostRecent: last });
  }, [p.selectedIds]);

  const handleMove: MoveHandler<InstanceNode> = ({ dragIds, parentId, index }) => {
    dragIds.forEach((id, i) => p.onMove?.(id, parentId, index + i));
  };

  function Node({ node, style, dragHandle }: NodeRendererProps<InstanceNode>) {
    const hasKids = node.data.children.length > 0;
    return (
      <div
        ref={dragHandle}
        style={style}
        data-slot="nav-row"
        data-instance-id={node.data.id}
        data-instance-type={node.data.type}
        data-depth={node.level}
        data-selected={node.isSelected}
        data-focused={node.isFocused}
        aria-selected={node.isSelected}
        // No onClick here: arborist's default row renderer already routes
        // the click to node.handleClick. Calling it a second time turned a
        // ctrl-click into select-then-deselect — the journey caught it.
        className={cn(
          "flex h-7 cursor-default select-none items-center gap-1.5 pr-2",
          node.isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
        title={`${node.data.type} · ${node.data.id}`}
      >
        {hasKids ? (
          <span
            role="button"
            data-slot="nav-disclosure"
            aria-expanded={node.isOpen}
            onClick={(e) => {
              e.stopPropagation();
              node.toggle();
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border"
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform", node.isOpen && "rotate-90")} />
          </span>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
          {p.glyph(node.data.type)}
        </span>
        <span data-slot="nav-title" className={cn("min-w-0 flex-1 truncate text-xs", node.data.untitled && "text-muted-foreground")}>
          {node.data.title}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.data.type}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} data-slot="instance-navigator" data-navigator="arborist" className="min-h-[120px] flex-1">
      <Tree<InstanceNode>
        ref={treeRef}
        data={p.roots}
        idAccessor="id"
        // WHY: arborist calls a node internal whenever `children` is an
        // array, even an empty one, and a leaf whenever it is null. Both
        // matter: a leaf (a Port) must not take a drop and Space must
        // select it; an EMPTY Stack must still be a folder — a drop target
        // that folds — or nothing can ever be dragged into it. So the tree
        // says which is which through `container`, not through emptiness —
        // and a Block, which holds fixed slot fills but takes no drops, is
        // internal because it has children to show.
        childrenAccessor={(n: InstanceNode) => (n.container || n.children.length > 0 ? n.children : null)}
        openByDefault
        disableMultiSelection={false}
        disableDrag={!p.onMove}
        disableDrop={({ parentNode, dragNodes }) =>
          dragNodes.some((n) => !(p.canDrop?.(n.id, parentNode.isRoot ? null : parentNode.id) ?? true))
        }
        onMove={handleMove}
        // A fold or unfold changes the visible row count at once; measure
        // on the next tick so the virtualiser paints every row before
        // anyone (a person, a journey) looks.
        onToggle={() => setTimeout(() => measureRef.current(), 0)}
        onSelect={(nodes) => p.onSelectionChange(nodes.map((n) => n.id))}
        rowHeight={ROW_HEIGHT}
        indent={14}
        width="100%"
        height={height}
        aria-label="Instance navigator"
      >
        {Node}
      </Tree>
    </div>
  );
}

export const ARBORIST: NavigatorVariant = {
  id: "arborist",
  label: "react-arborist",
  blurb: "The VS Code explorer for free: react-arborist's own shift/ctrl multi-selection, arrow-key navigation, and drag re-parenting, driven by the shared instance tree.",
  stockPart: "Tree from react-arborist",
  Navigator: ArboristNavigator,
};
