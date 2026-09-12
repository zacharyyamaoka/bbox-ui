/**
 * packages/panel/src/portDnd.tsx
 *
 * dnd-kit owns every Port drag (Zach, 2026-09-12): this is where. A Block's
 * four `PortEdge` lanes and its Port members are drawn by `bench.tsx`'s
 * `renderBlock`/`renderLane` — this file is what makes those SAME elements
 * a real dnd-kit droppable (`PortLane`) and draggable (`DraggablePort`),
 * plus the per-Block `PortDndProvider` that owns the `DndContext`, the
 * pointer sensor, the drop math, and the `DragOverlay` ghost.
 *
 * WHY this lives in `@bbox-ui/panel` and not in `apps/docs`: `@dnd-kit/core`
 * is a real dependency here already (`members/List.tsx`'s own drag-to-
 * reorder), and `apps/docs/package.json` does not declare it — adding it
 * there needs a lockfile change and an install this task is not allowed to
 * run. `apps/docs/src/components/create/port-dnd.tsx` re-exports this
 * module's public surface rather than reimplementing it, matching this
 * package's whole reason for existing (bench.tsx's own header: "the same
 * panel now renders in the Vite demo and on the bbox-ui.com create page").
 *
 * WHY the drop math reads the live DOM instead of a parallel geometry
 * model: `bench.tsx` already tags the lane (`data-slot="port-lane"
 * data-edge`) and each port's positioning span (`data-port-id`) for other
 * reasons; those are the one ground truth for "where is this, on screen,
 * right now" in both auto's flex-evened layout and custom's `t`-positioned
 * one, so a drop is resolved from `getBoundingClientRect()` against those
 * elements rather than a second copy of the spacing math kept in sync by
 * hand.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { ALL_EDGES, type Arrangement, type PortEdgeId } from "@bbox-ui/core";

/** `useDroppable`'s id for one of a Block's four lanes — parseable back to
 *  its edge by checking membership against `ALL_EDGES` (see
 *  `PortDndProvider`'s `onDragEnd`), never by slicing the string, so a
 *  `blockId` that itself contains `:` still round-trips correctly. */
export function portLaneId(blockId: string, edge: PortEdgeId): string {
  return `${blockId}:${edge}`;
}

/**
 * How zoomed the host that mounted `PortDndProvider` currently is. The
 * plain DOM render (this task's scope) is never scaled, so it provides `1`
 * (see `viewport/dom-preview.tsx`); a future React Flow or tldraw host
 * would provide its live canvas zoom instead, and every `PortDndProvider`
 * nested under it (one per Block) reads the same value.
 */
export const HostZoomContext = createContext(1);

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * One of a Block's four edges, made droppable. The div is exactly what
 * `renderLane` drew before this change (`data-slot="port-lane"
 * data-edge`) — `data-over` is new, and drives the highlight below via a
 * Tailwind `data-[over=true]:` selector rather than a conditional inline
 * style, matching how `data-selected`/`data-dragging` are styled elsewhere
 * in this file.
 */
export function PortLane({
  blockId,
  edge,
  style,
  children,
}: {
  blockId: string;
  edge: PortEdgeId;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: portLaneId(blockId, edge) });
  return (
    <div
      ref={setNodeRef}
      data-slot="port-lane"
      data-edge={edge}
      data-over={isOver || undefined}
      className="rounded-sm transition-colors data-[over=true]:bg-[color:var(--bbox-accent)]/20 data-[over=true]:outline data-[over=true]:outline-1 data-[over=true]:outline-[color:var(--bbox-accent)]"
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * One Port member, made draggable. This REPLACES the plain
 * `data-slot="member-instance"` span `renderInstance`'s own `wrap()` would
 * otherwise use for a Port — same attributes, same selection outline
 * classes, plus dnd-kit's ref/listeners and the `nodrag` class React Flow's
 * node-drag veto reads (harmless on the DOM render and on tldraw).
 *
 * (a) The combined `onPointerDown` calls dnd-kit's own listener FIRST (so
 * the press is still seen for drag-distance tracking) and then stops
 * propagation, so neither the host (a React Flow node, a tldraw shape) nor
 * any ANCESTOR member-instance wrapper (a Block nested inside a Stack
 * member, say) reacts to the same press. Selection still fires on this
 * same pointerdown regardless — exactly the existing member-instance
 * behavior for every other component — so a plain click that never
 * crosses the 4px activation distance still selects; dnd-kit simply never
 * promotes it to a drag, per the sensor's own `activationConstraint`.
 */
export function DraggablePort({
  portId,
  selected,
  disabled,
  onSelect,
  children,
}: {
  portId: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: portId, disabled });
  return (
    <span
      ref={setNodeRef}
      data-slot="member-instance"
      data-instance-id={portId}
      data-instance-type="Port"
      data-selected={selected}
      data-dragging={isDragging || undefined}
      // WHY `inline-flex`, not render-instance.tsx's own `contents` (every
      // other member-instance wrapper): `useDraggable`'s `setNodeRef` needs
      // THIS element's own `getBoundingClientRect()` for its drag math —
      // `display: contents` generates no box at all, so it measured as a
      // zero-width rect pinned at (0,0), and every drop resolved against
      // that instead of the real dot (found live: every drag "landed" on
      // whichever lane happened to sit closest to the viewport's own
      // origin, never where the pointer actually was). Same outline tokens
      // as the plain wrapper otherwise. `nodrag` is React Flow's veto class
      // (see this file's own header); it does nothing on the DOM render or
      // on tldraw.
      className="nodrag inline-flex [&>*:first-child]:outline-offset-2 data-[selected=true]:[&>*:first-child]:outline data-[selected=true]:[&>*:first-child]:outline-2 data-[selected=true]:[&>*:first-child]:outline-[color:var(--bbox-accent)] data-[dragging=true]:opacity-30"
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        listeners?.onPointerDown?.(e);
        e.stopPropagation();
        onSelect(portId, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}

export interface PortDndProviderProps {
  blockId: string;
  arrangement: Arrangement;
  onMovePort: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  children: ReactNode;
}

/**
 * One `DndContext` for exactly one Block (Zach's ruling: "nested contexts
 * across Blocks are fine") — mounted by `renderInstance` around a single
 * Block's own rendered output, so a Port drag can only ever collide with
 * THIS Block's four `PortLane`s (a sibling Block's lanes live in a
 * different, unrelated `DndContext`).
 *
 * `children` is wrapped in a `display: contents` div only so this provider
 * has a DOM anchor to query `[data-slot="port-lane"]` /
 * `[data-port-id]` from at drop time — it adds no box, so it never
 * disturbs the Block's own layout inside whatever host mounted it.
 */
export function PortDndProvider({ blockId, arrangement, onMovePort, children }: PortDndProviderProps) {
  const zoom = useContext(HostZoomContext);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHtml, setActiveHtml] = useState<string | null>(null);
  // The inherited typography the clone would otherwise lose: `outerHTML`
  // carries the Port's own classes and inline styles, but font-size and
  // line-height reach it from the lane it sits in (the Block's size rung),
  // and under `document.body` the clone inherits the page's instead —
  // measured 2026-09-12: the live node 18px tall, its clone 24px, so the
  // ghost's dot rode 3px (× zoom) below the pointer. Snapshotting the
  // computed values onto the overlay's own div gives the clone the same
  // context it was copied from.
  const [activeStyle, setActiveStyle] = useState<CSSProperties | undefined>(undefined);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Mounted only after hydration, so `document.body` exists (this provider
  // is used from `DomPreview`, which — unlike the React Flow/tldraw
  // canvases — is NOT ssr:false, so a server render must never touch
  // `document`). Flips true well before any real drag can start.
  const [canPortal, setCanPortal] = useState(false);
  useEffect(() => setCanPortal(true), []);

  // WHY this scales rather than divides: `DragOverlay` is portaled to
  // `document.body` (below), so dnd-kit's own pointer-delta translate is
  // ALREADY correct 1:1 real screen pixels regardless of any host zoom —
  // dividing it here (an earlier version of this file did, before the
  // portal existed) would make the ghost lag the pointer at 1/zoom speed.
  // What zoom DOES still get wrong: the clone is `el.outerHTML` — a
  // snapshot of the Port's own unscaled CSS box — rendered outside every
  // scaled ancestor, so at a React Flow/tldraw zoom other than 1 it would
  // paint at its native size while the real Port the user is looking at
  // paints `zoom`× bigger (or smaller). Scaling the overlay by the host's
  // live zoom keeps the ghost the same apparent size as the dot it was
  // grabbed from. The plain DOM render's `HostZoomContext` is always 1, so
  // this is a no-op there.
  const zoomModifier: Modifier = useMemo(() => {
    if (zoom === 1) return ({ transform }) => transform;
    return ({ transform }) => ({ ...transform, scaleX: zoom, scaleY: zoom });
  }, [zoom]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    // A snapshot of the dot's own rendered markup, not a re-render of the
    // Port component from props: `PortDndProvider` never sees a Port's
    // props (only `renderInstance`/`bench.tsx` do), so cloning what is
    // already on screen is the only way to draw a faithful "copy of the
    // dot" in the DragOverlay.
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-port-id="${CSS.escape(id)}"]`);
    setActiveHtml(el ? el.outerHTML : null);
    if (el) {
      const cs = getComputedStyle(el);
      setActiveStyle({ fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontFamily: cs.fontFamily, color: cs.color });
    } else {
      setActiveStyle(undefined);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setActiveHtml(null);
    setActiveStyle(undefined);
    const { active, over, delta } = event;
    if (!over) return;
    const portId = String(active.id);
    const overId = String(over.id);
    const edge = ALL_EDGES.find((e) => portLaneId(blockId, e) === overId);
    if (!edge) return; // dropped somewhere that isn't one of THIS Block's own lanes

    const laneEl = containerRef.current?.querySelector<HTMLElement>(`[data-slot="port-lane"][data-edge="${edge}"]`);
    if (!laneEl) return;
    const laneRect = laneEl.getBoundingClientRect();
    const horizontal = edge === "top" || edge === "bottom";

    // PointerSensor's activator is the original pointerdown; adding the
    // drag's accumulated `delta` gives the real, current pointer position
    // — the one ground truth both branches below place the port against.
    const activator = event.activatorEvent as PointerEvent;
    const pointerX = activator.clientX + delta.x;
    const pointerY = activator.clientY + delta.y;
    const pointerCoord = horizontal ? pointerX : pointerY;

    if (arrangement.mode === "auto") {
      // The lab's sortByVisualPosition idea: count how many of the lane's
      // OTHER ports currently paint their center before the pointer along
      // the lane's own axis — that count is the insertion index `movePort`
      // wants.
      const portEls = Array.from(laneEl.querySelectorAll<HTMLElement>("[data-port-id]"));
      let index = 0;
      for (const el of portEls) {
        if (el.getAttribute("data-port-id") === portId) continue;
        const rect = el.getBoundingClientRect();
        const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        if (center < pointerCoord) index++;
      }
      onMovePort(blockId, portId, edge, { index });
    } else {
      const laneStart = horizontal ? laneRect.left : laneRect.top;
      const laneLength = horizontal ? laneRect.width : laneRect.height;
      const t = laneLength > 0 ? clampUnit((pointerCoord - laneStart) / laneLength) : 0.5;
      onMovePort(blockId, portId, edge, { t });
    }
  }

  return (
    // `pointerWithin`, not the default `closestCenter`: a lane's rect is
    // often a long thin band (the top/bottom lanes span nearly the whole
    // Block), so its geometric CENTER can sit far from a pointer that is
    // still solidly inside it — closestCenter picked a compact side lane
    // over the wide one the pointer was actually over. `pointerWithin`
    // asks the one question that matches "which lane is the cursor on":
    // is the real pointer coordinate inside this droppable's rect.
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={containerRef} style={{ display: "contents" }}>
        {children}
      </div>
      {/* `createPortal` to `document.body`, not a plain child of `DndContext`:
       * `DragOverlay` renders `position: fixed` (dnd-kit's own CSS), which the
       * spec makes relative to the VIEWPORT — UNLESS an ancestor has its own
       * `transform`, in which case THAT ancestor becomes the containing block
       * instead. Every React Flow node (and every tldraw shape) carries
       * exactly such a transform (`translate(x,y)`, and tldraw adds its own
       * scale) — so an unportaled overlay nested inside a Block's node
       * measured its `top`/`left` as real screen pixels, then had the node's
       * OWN (untransformed-layout) origin substituted underneath them, and
       * the whole thing then got redrawn through the node's transform a
       * second time. On the DOM render, which has no transformed ancestors
       * at all, this was invisible; on React Flow at zoom ≈1.46 the ghost
       * measured ~380px from the pointer instead of a few px — the portal
       * is what makes "the dot tracks the pointer" true on a canvas host
       * instead of only on the DOM one. */}
      {canPortal
        ? createPortal(
            // `adjustScale`: without it, dnd-kit's own `PositionedOverlay`
            // unconditionally forces `scaleX/scaleY` back to 1 (its own
            // `core.esm.js`: `adjustScale ? transform : {...transform,
            // scaleX: 1, scaleY: 1}`) — so `zoomModifier`'s scale is inert
            // unless this is set. It ALSO makes dnd-kit set the wrapper's
            // `transformOrigin` to the grab point — measured against the
            // wrapper's box, which is the LIVE node's already-zoomed rect —
            // while the clone inside is the node's native, unzoomed markup
            // sitting at that box's top-left. Scaling native content about
            // a point taken from a `zoom`× bigger box drags it off the
            // pointer by (zoom − 1) × the grab offset (measured 2026-09-12 on
            // tldraw at zoom 2.5: the ghost sat ~56px left / ~34px up of
            // the cursor; at zoom 1 nothing shows). `transformOrigin: 0 0`
            // pins the clone's top-left to the live rect's top-left, so
            // scaling it by `zoom` lays it exactly over the dot it was
            // grabbed from, and the translate then tracks the pointer 1:1.
            // dnd-kit spreads `style` last, so this wins over its own.
            <DragOverlay adjustScale modifiers={[zoomModifier]} style={{ transformOrigin: "0 0" }}>
              {activeId && activeHtml ? (
                // `flex`, not a plain block: the clone is an inline-flex span, and
                // a block parent gives it a text line box to sit on the baseline
                // of — 3px taller than the span, so the ghost's dot rode 3px (×
                // zoom) below the pointer. A flex parent has no line box.
                <div className="pointer-events-none flex" style={activeStyle} dangerouslySetInnerHTML={{ __html: activeHtml }} />
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
