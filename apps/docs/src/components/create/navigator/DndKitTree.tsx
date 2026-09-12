"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRightIcon } from "lucide-react";
import type { InstanceNode } from "@bbox-ui/panel";
import { clickSelect, stepRow, visibleRows } from "@bbox-ui/panel";
import { cn } from "@/lib/utils";
import type { NavigatorProps, NavigatorVariant } from "./contract";

const INDENTATION_WIDTH = 14;

/** One visible row, flattened depth-first (folded subtrees skipped), with
 *  the parent it currently sits under — the shape the official dnd-kit
 *  "Sortable Tree" example flattens a tree into before projecting a drop. */
interface FlattenedNode {
  node: InstanceNode;
  parentId: string | null;
  depth: number;
}

function flatten(roots: InstanceNode[], folded: ReadonlySet<string>): FlattenedNode[] {
  const out: FlattenedNode[] = [];
  const walk = (node: InstanceNode, parentId: string | null, depth: number) => {
    out.push({ node, parentId, depth });
    if (!folded.has(node.id)) node.children.forEach((c) => walk(c, node.id, depth + 1));
  };
  roots.forEach((r) => walk(r, null, 0));
  return out;
}

/** The dnd-kit example's `getProjection`: depth is read off the pointer's
 *  horizontal offset, clamped between what the previous row allows (one
 *  deeper than it) and what the next row requires (no shallower than it),
 *  then the nearest earlier row at `depth - 1` is the projected parent. */
function projectDrop(items: FlattenedNode[], activeIndex: number, overIndex: number, offsetX: number) {
  const activeItem = items[activeIndex]!;
  // WHY arrayMove and not a hand-rolled splice: the official example reads
  // the previous and next rows from the list AS IT WILL BE, with the
  // dragged row already at overIndex. Rebuilding that by removing the
  // active row first put the previous row one slot early on every
  // downward drag, so a Pill dragged past the last Stack projected under
  // the Block above it — the journey's refused-flash showed it.
  const newItems = arrayMove(items, activeIndex, overIndex);
  const targetIndex = overIndex;
  const previousItem = newItems[targetIndex - 1];
  const nextItem = newItems[targetIndex + 1];

  const dragDepth = Math.round(offsetX / INDENTATION_WIDTH);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth));

  let parentId: string | null = null;
  if (depth > 0) {
    // Walk back from the row just above the drop point to the nearest one
    // shallow enough to be the parent at this depth.
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (newItems[i]!.node.id === activeItem.node.id) continue;
      if (newItems[i]!.depth === depth - 1) {
        parentId = newItems[i]!.node.id;
        break;
      }
      if (newItems[i]!.depth < depth - 1) break;
    }
  }
  return { depth, parentId };
}

/**
 * V5 · dnd-kit sortable tree — this repo's already-first-class drag library.
 *
 * dnd-kit backs both SystemSketch and bbox-ui's own Members stack (a THIRD
 * canvas owner, per `block-members-proposal`), so this variant is the
 * official "Sortable Tree" example (clauderic/dnd-kit, stories/3 - Examples/
 * Tree) written against `instanceTree`: the visible rows are flattened
 * depth-first, one `DndContext` + `SortableContext` carries them, and the
 * horizontal pointer offset during a drag projects a depth/parent the same
 * way the example does. Selection and arrow keys are the same shared
 * reducer every other variant uses — dnd-kit has no opinion on either.
 */
function DndKitTreeNavigator(p: NavigatorProps) {
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [overId, setOverId] = useState<string | null>(null);
  const [refusedId, setRefusedId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const refuseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = useMemo(() => visibleRows(p.roots, folded), [p.roots, folded]);
  const flattened = useMemo(() => flatten(p.roots, folded), [p.roots, folded]);
  const ids = useMemo(() => flattened.map((f) => f.node.id), [flattened]);
  const byId = useMemo(() => new Map(flattened.map((f) => [f.node.id, f])), [flattened]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const select = useCallback(
    (id: string, mods: { shift?: boolean; toggle?: boolean }) => {
      const next = clickSelect(visible, { selected: p.selectedIds, anchor }, id, mods);
      setAnchor(next.anchor);
      p.onSelectionChange(next.selected);
    },
    [visible, p.selectedIds, anchor, p.onSelectionChange],
  );

  useEffect(() => {
    if (focusedId) rows.current.get(focusedId)?.focus();
  }, [focusedId]);

  useEffect(() => () => {
    if (refuseTimer.current) clearTimeout(refuseTimer.current);
  }, []);

  const toggleFold = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: React.KeyboardEvent, node: InstanceNode) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const to = stepRow(visible, node.id, e.key === "ArrowDown" ? 1 : -1);
      if (!to) return;
      setFocusedId(to);
      select(to, { shift: e.shiftKey });
    } else if (e.key === "ArrowRight" && node.children.length > 0 && folded.has(node.id)) {
      e.preventDefault();
      toggleFold(node.id);
    } else if (e.key === "ArrowLeft" && node.children.length > 0 && !folded.has(node.id)) {
      e.preventDefault();
      toggleFold(node.id);
    }
  };

  const projection = useMemo(() => {
    if (!activeId || !overId) return null;
    const activeIndex = ids.indexOf(activeId);
    const overIndex = ids.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0) return null;
    return projectDrop(flattened, activeIndex, overIndex, offsetX);
  }, [activeId, overId, offsetX, ids, flattened]);

  const flashRefused = (id: string) => {
    setRefusedId(id);
    if (refuseTimer.current) clearTimeout(refuseTimer.current);
    refuseTimer.current = setTimeout(() => setRefusedId(null), 600);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setOffsetX(0);
  };

  const onDragMove = (e: DragMoveEvent) => {
    setOffsetX(e.delta.x);
    if (e.over) setOverId(String(e.over.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const finalActiveId = activeId;
    const finalProjection = projection;
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
    if (!finalActiveId || !finalProjection || !e.over) return;

    const { parentId } = finalProjection;
    if (!p.onMove) return;
    if (p.canDrop && !p.canDrop(finalActiveId, parentId)) {
      flashRefused(finalActiveId);
      return;
    }

    // Index within the destination parent's children, after the dragged
    // item is removed from wherever it currently sits.
    const siblings = flattened.filter((f) => f.parentId === parentId && f.node.id !== finalActiveId).map((f) => f.node.id);
    const overIndex = ids.indexOf(String(e.over.id));
    const overEntry = byId.get(String(e.over.id));
    let index = siblings.length;
    if (overEntry && overEntry.parentId === parentId) {
      index = siblings.indexOf(overEntry.node.id);
      if (index < 0) index = siblings.length;
    } else if (overIndex >= 0) {
      index = siblings.length;
    }
    p.onMove(finalActiveId, parentId, index);
  };

  const activeEntry = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={p.onMove ? sensors : undefined}
      collisionDetection={closestCenter}
      onDragStart={p.onMove ? onDragStart : undefined}
      onDragMove={p.onMove ? onDragMove : undefined}
      onDragEnd={p.onMove ? onDragEnd : undefined}
      onDragCancel={p.onMove ? () => { setActiveId(null); setOverId(null); setOffsetX(0); } : undefined}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div data-slot="instance-navigator" data-navigator="dndkit" role="tree" aria-multiselectable className="flex flex-col gap-0.5">
          {flattened.map(({ node, depth }) => (
            <Row
              key={node.id}
              node={node}
              depth={depth}
              draggable={Boolean(p.onMove)}
              selected={p.selectedIds.includes(node.id)}
              open={node.children.length > 0 && !folded.has(node.id)}
              focused={focusedId === node.id || (!focusedId && depth === 0 && node.id === visible[0])}
              refused={refusedId === node.id}
              projectedParent={projection?.parentId === node.id}
              dragging={activeId === node.id}
              glyph={p.glyph(node.type)}
              rowRef={(el) => {
                if (el) rows.current.set(node.id, el);
                else rows.current.delete(node.id);
              }}
              onSelect={(mods) => {
                setFocusedId(node.id);
                select(node.id, mods);
              }}
              onKeyDown={(e) => onKeyDown(e, node)}
              onToggleFold={() => toggleFold(node.id)}
              dragOffsetLeft={activeId === node.id ? offsetX : 0}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeEntry ? (
          <div className="flex h-7 items-center gap-1.5 rounded-md bg-popover pr-2 shadow-md" style={{ paddingLeft: 6 + activeEntry.depth * INDENTATION_WIDTH }}>
            <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
              {p.glyph(activeEntry.node.type)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{activeEntry.node.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RowProps {
  node: InstanceNode;
  depth: number;
  draggable: boolean;
  selected: boolean;
  open: boolean;
  focused: boolean;
  refused: boolean;
  projectedParent: boolean;
  dragging: boolean;
  glyph: string;
  dragOffsetLeft: number;
  rowRef: (el: HTMLDivElement | null) => void;
  onSelect: (mods: { shift?: boolean; toggle?: boolean }) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onToggleFold: () => void;
}

function Row(rp: RowProps) {
  const sortable = useSortable({ id: rp.node.id, disabled: !rp.draggable });
  const { attributes, listeners, setNodeRef, transform, transition } = sortable;
  const hasKids = rp.node.children.length > 0;

  const style: React.CSSProperties = {
    transform: rp.draggable ? CSS.Transform.toString(transform) : undefined,
    transition: rp.draggable ? transition : undefined,
    paddingLeft: 6 + rp.depth * INDENTATION_WIDTH + (rp.dragging ? rp.dragOffsetLeft : 0),
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rp.rowRef(el);
      }}
      style={style}
      {...(rp.draggable ? attributes : {})}
      {...(rp.draggable ? listeners : {})}
      data-slot="nav-row"
      data-instance-id={rp.node.id}
      data-instance-type={rp.node.type}
      data-depth={rp.depth}
      data-selected={rp.selected}
      data-drop-refused={rp.refused || undefined}
      aria-selected={rp.selected}
      tabIndex={rp.focused ? 0 : -1}
      role="treeitem"
      onClick={(e) => rp.onSelect({ shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey })}
      onKeyDown={rp.onKeyDown}
      className={cn(
        "flex h-7 cursor-default select-none items-center gap-1.5 rounded-md pr-2",
        rp.selected && "bg-sidebar-accent text-sidebar-accent-foreground",
        rp.dragging && "opacity-40",
        rp.projectedParent && "border-l-2 border-primary",
        rp.refused && "outline outline-1 outline-destructive",
      )}
      title={`${rp.node.type} · ${rp.node.id}`}
    >
      {hasKids ? (
        <span
          role="button"
          data-slot="nav-disclosure"
          aria-expanded={rp.open}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            rp.onToggleFold();
          }}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border"
        >
          <ChevronRightIcon className={cn("size-3.5 transition-transform", rp.open && "rotate-90")} />
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
        {rp.glyph}
      </span>
      <span data-slot="nav-title" className={cn("min-w-0 flex-1 truncate text-xs", rp.node.untitled && "text-muted-foreground")}>
        {rp.node.title}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/70">{rp.node.type}</span>
    </div>
  );
}

export const DNDKIT_TREE: NavigatorVariant = {
  id: "dndkit",
  label: "dnd-kit sortable tree",
  blurb: "The official dnd-kit Sortable Tree example over our tree: a flattened SortableContext projects depth and parent from the drag's horizontal offset, and a refused drop flashes visibly instead of silently snapping back.",
  stockPart: "DndContext + SortableContext + useSortable from @dnd-kit/sortable (the official Sortable Tree example)",
  Navigator: DndKitTreeNavigator,
};
