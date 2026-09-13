/**
 * packages/panel/src/portEdges/contract.tsx
 *
 * The ONE interface every "port edge" implementation satisfies, so five
 * structurally different drag architectures are drop-in interchangeable
 * behind a switcher and can be judged against each other on the same
 * fixture (Zach, 2026-09-12: "before we integrate this into the block,
 * let's please get the 'port edge' component working ... make 5 proposals").
 *
 * Two halves, because a Block's four lanes are NOT siblings in its DOM
 * (top/bottom sit beside the header/footer bars, left/right inside the body
 * wrapper, so each hugs the outline it straddles — see bench.tsx's
 * renderBlock):
 *
 *   Provider — owns the drag machinery (DndContext, sensors, collision,
 *              ghost) and publishes the model on a context.
 *   Lane     — draws ONE edge, reading that context.
 *
 * WHY not a single <PortEdges> that renders all four itself: it would have
 * to own the outline's layout too, and the Block's left/right lanes must
 * span exactly header-bottom..footer-top, which only the Block knows. The
 * split keeps the component host-agnostic — the standalone bench mounts
 * Provider + four Lanes around a dashed rectangle, the Block mounts the
 * same Provider and the same four Lanes in its own four places.
 *
 * WHAT IS NOT NEGOTIABLE HERE: the data model. Every variant drives
 * `@bbox-ui/core`'s portPlacement.ts (Arrangement / Placement / movePort /
 * refresh / groupSlots / drawnEdge) unchanged and adds no field of its own.
 * The variants differ in the component and the drag implementation only.
 */
import { createContext, useContext, useMemo } from "react";
import type React from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { DragOverlay } from "@dnd-kit/core";
import {
  cascadeInto,
  drawnEdge,
  groupSlots,
  inwardTextLayout,
  type Arrangement,
  type PortEdgeId,
  type Placements,
} from "@bbox-ui/core";

/* ------------------------------------------------------------------ */
/* The model every variant reads                                        */
/* ------------------------------------------------------------------ */

export interface PortEdgesModel {
  /** The Block (or bench instance) whose ports these are. Scopes every
   *  droppable id, so two Blocks on one canvas never collide. */
  ownerId: string;
  arrangement: Arrangement;
  placements: Placements;
  /** Ports that are never draggable (the function port). */
  locked: Set<string>;
  /**
   * Already-rendered, BARE Port nodes by id — no drag wrapper of its own.
   *
   * WHY bare (changed 2026-09-12): render-instance.tsx used to hand these
   * over already wrapped in a draggable, which made the node un-renderable
   * a second time (two draggables, one id). A bare node can be rendered
   * again inside a DragOverlay, and that is what makes a faithful ghost
   * possible WITHOUT cloning `outerHTML` — the technique that produced the
   * stretched ghosts Zach screenshotted. The lab does exactly this
   * (`<DragOverlay><CardPreview .../></DragOverlay>`), never a clone.
   */
  members: Record<string, ReactNode>;
  /**
   * Moves a whole SLOT. `portIds` is every port the gesture carries — one
   * for an ordinary port, all of them for a group, in the order they must
   * land. The host applies them as one state write so a group arrives
   * contiguous.
   *
   * WHY the list and not one id (Zach's lab, stage 4): "groups move together
   * like a rigid body". A collapsed group draws ONE card, and dropping that
   * card has to carry the members that are not drawn — if only the head
   * moved, expanding the set afterwards would scatter them back across the
   * edge they were dragged off.
   */
  onMovePort: (portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  /** How much the HOST scales this subtree (React Flow viewport zoom,
   *  tldraw camera zoom, 1 on the plain DOM render). Page-space geometry
   *  is client geometry divided by this. */
  zoom: number;
}

export interface PortEdgesImpl {
  id: string;
  label: string;
  /** One sentence: what this architecture bets on. */
  thesis: string;
  /** Which dnd-kit exports it leans on — the "stock part" line. */
  stock: string;
  Provider: ComponentType<{ model: PortEdgesModel; children: ReactNode }>;
  Lane: ComponentType<{ edge: PortEdgeId; style?: CSSProperties }>;
}

const ModelContext = createContext<PortEdgesModel | null>(null);

export function PortEdgesModelProvider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>;
}

export function usePortEdgesModel(): PortEdgesModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error("a PortEdges Lane was rendered outside its Provider");
  return model;
}

/* ------------------------------------------------------------------ */
/* Shared geometry — the same for every variant, so a difference in      */
/* behaviour is a difference in ARCHITECTURE, never in arithmetic.       */
/* ------------------------------------------------------------------ */

/** A band wide/tall enough to hold the largest Port dot plus its hit halo.
 *  A lane is a layout fact about the Block, not a Port constant. */
export const LANE_BAND_PX = 26;

export function isHorizontal(edge: PortEdgeId): boolean {
  return edge === "top" || edge === "bottom";
}

export interface LaneSlot {
  /** The slot's identity: a port id when ungrouped, the group id when a
   *  collapsed set clustered it. */
  group: string;
  /** Every port in the slot, first = the one that draws. */
  portIds: string[];
  /** 0..1 along the lane. Only authoritative in custom mode. */
  t: number;
  /** The port that actually paints the card. */
  headId: string;
  /** The grouping set's own group id when this card's port belongs to a
   *  real (>1 member) group — set whether or not the set is COLLAPSED, so an
   *  expanded set can still be seen on the canvas (lab stage 4's "Grouped"
   *  mode, where members stay separate cards but read as one family). */
  groupKey?: string;
  /** Every port in that family, in the set's own `groupOrder`, or just the
   *  head when there is no family. THE thing a drop carries. */
  familyIds: string[];
  /** How many ports the grouping set puts in that family, collapsed or not. */
  familySize: number;
}

/**
 * The slots one lane draws, straight from the model's own `groupSlots`
 * (portPlacement.ts) — filtered to ports that are drawable here (not
 * locked, and actually rendered). Every variant calls THIS, so "what is on
 * this edge, in what order, at what t" can never diverge between variants.
 */
export function laneSlots(model: PortEdgesModel, edge: PortEdgeId): LaneSlot[] {
  const drawable = new Set(
    Object.keys(model.placements).filter((id) => !model.locked.has(id) && model.members[id] !== undefined),
  );
  const grouping = model.arrangement.grouping;
  const familyOf = (id: string) => grouping?.assignments[id]?.group;
  const familySizes = new Map<string, number>();
  if (grouping) {
    for (const id of Object.keys(model.placements)) {
      const key = familyOf(id);
      if (key) familySizes.set(key, (familySizes.get(key) ?? 0) + 1);
    }
  }
  return groupSlots(model.placements, model.arrangement, edge)
    .map((slot) => ({ ...slot, portIds: slot.portIds.filter((id) => drawable.has(id)) }))
    .filter((slot) => slot.portIds.length > 0)
    .map((slot) => {
      const headId = slot.portIds[0]!;
      const key = familyOf(headId);
      const familySize = key ? (familySizes.get(key) ?? 1) : 1;
      // WHY the family and not the drawn slot's members: a grouping set means
      // "these ports move together" whether or not it is COLLAPSED (the lab's
      // stage 4 — "reorganize side by side, move together like a rigid body,
      // and can collapse" — is three claims, and only the third is about
      // folding into one card). An expanded set draws n separate cards that
      // still travel as one.
      const familyIds =
        familySize > 1 && key
          ? Object.keys(model.placements)
              .filter((id) => familyOf(id) === key && drawable.has(id))
              .sort(
                (a, b) =>
                  (grouping?.assignments[a]?.groupOrder ?? 0) - (grouping?.assignments[b]?.groupOrder ?? 0),
              )
          : slot.portIds;
      return { ...slot, headId, groupKey: familySize > 1 ? key : undefined, familySize, familyIds };
    });
}

/** Which edge a port DRAWS on right now (its stored edge, or the nearest
 *  live one clockwise when that edge is toggled off). */
export function laneOf(model: PortEdgesModel, portId: string): PortEdgeId | null {
  const placement = model.placements[portId];
  return placement ? drawnEdge(placement, model.arrangement) : null;
}

/** `useDroppable`'s id for one lane. Parsed back by membership test, never
 *  by slicing, so an ownerId containing ":" still round-trips. */
export function laneDroppableId(ownerId: string, edge: PortEdgeId): string {
  return `${ownerId}:lane:${edge}`;
}

/** `useDroppable`'s id for one insertion slot inside a lane (V3). */
export function gapDroppableId(ownerId: string, edge: PortEdgeId, index: number): string {
  return `${ownerId}:gap:${edge}:${index}`;
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The live client rect of one lane's track (the element every variant tags
 *  `data-slot="port-edge"` inside `data-slot="port-lane"`). */
export function laneTrackRect(ownerId: string, edge: PortEdgeId): DOMRect | null {
  const lane = document.querySelector<HTMLElement>(
    `[data-slot="port-lane"][data-owner="${CSS.escape(ownerId)}"][data-edge="${edge}"]`,
  );
  if (!lane) return null;
  const track = lane.querySelector<HTMLElement>('[data-slot="port-edge"]') ?? lane;
  return track.getBoundingClientRect();
}

/** Pointer position -> 0..1 along `edge`'s lane. Client coordinates in,
 *  because a rect read from the DOM is already in client space at whatever
 *  the host's zoom is — the two cancel, which is why this needs no `zoom`
 *  argument even inside a scaled React Flow node or tldraw shape. */
export function pointerToT(ownerId: string, edge: PortEdgeId, clientX: number, clientY: number): number {
  const rect = laneTrackRect(ownerId, edge);
  if (!rect) return 0.5;
  const horizontal = isHorizontal(edge);
  const start = horizontal ? rect.left : rect.top;
  const length = horizontal ? rect.width : rect.height;
  if (length <= 0) return 0.5;
  return clampUnit(((horizontal ? clientX : clientY) - start) / length);
}

/**
 * How many of `edge`'s OTHER painted cards sit before the pointer along the
 * lane's own axis — the insertion index `movePort` wants in auto mode.
 * Reads what actually painted, never a second copy of the spacing math.
 */
export function pointerToIndex(
  ownerId: string,
  edge: PortEdgeId,
  movingPortId: string,
  clientX: number,
  clientY: number,
): number {
  const lane = document.querySelector<HTMLElement>(
    `[data-slot="port-lane"][data-owner="${CSS.escape(ownerId)}"][data-edge="${edge}"]`,
  );
  if (!lane) return 0;
  const horizontal = isHorizontal(edge);
  const coord = horizontal ? clientX : clientY;
  let index = 0;
  for (const el of Array.from(lane.querySelectorAll<HTMLElement>("[data-port-id]"))) {
    if (el.getAttribute("data-port-id") === movingPortId) continue;
    const rect = el.getBoundingClientRect();
    const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if (center < coord) index++;
  }
  return index;
}

/**
 * The nearest of the arrangement's LIVE edges to a client point, measured
 * against each lane's own track rect in page space — the fallback every
 * variant uses when dnd-kit's own collision has no answer (the pointer is
 * between two lanes, or outside every one).
 */
export function nearestLiveEdge(model: PortEdgesModel, clientX: number, clientY: number): PortEdgeId | null {
  let best: { edge: PortEdgeId; d: number } | null = null;
  for (const edge of model.arrangement.edges) {
    const rect = laneTrackRect(model.ownerId, edge);
    if (!rect) continue;
    const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
    const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
    const d = Math.hypot(dx, dy);
    if (!best || d < best.d) best = { edge, d };
  }
  return best?.edge ?? null;
}

/**
 * Commit one slot's move. Every variant calls THIS rather than
 * `model.onMovePort` directly, so "a group moves as a rigid body" is one
 * behaviour with one implementation and cannot differ between variants —
 * the variants differ in how the TARGET was decided, never in what a drop
 * means.
 */
export function moveSlot(
  model: PortEdgesModel,
  slot: LaneSlot,
  edge: PortEdgeId,
  target: { index: number } | { t: number },
): void {
  model.onMovePort(slot.familyIds.length > 0 ? slot.familyIds : slot.portIds, edge, target);
}

/** The slot a draggable id names, wherever it currently lives. Sortable and
 *  draggable ids are SLOT ids (a group id once a set is collapsed), and
 *  `moveSlot` needs the whole slot, not just its head. */
export function findSlot(model: PortEdgesModel, slotId: string): { slot: LaneSlot; edge: PortEdgeId } | null {
  for (const edge of model.arrangement.edges) {
    const slot = laneSlots(model, edge).find((s) => s.group === slotId);
    if (slot) return { slot, edge };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Shared chrome — identical DOM across variants                        */
/* ------------------------------------------------------------------ */

/**
 * The lane's own box. Every variant renders THIS, so the journey's
 * selectors, the screenshots and the spacing assertions are variant-blind:
 * a difference between two captures is a difference in behaviour, never in
 * markup.
 *
 * `justifyContent` is how auto mode spaces its cards — the arrangement's
 * own `spacing` scheme mapped onto the three CSS keywords `evenT`'s closed
 * forms were derived from (portPlacement.ts's own header). Custom mode
 * distributes nothing; its cards are absolutely positioned at `t`.
 */
const SPACING_JUSTIFY: Record<string, string> = {
  between: "space-between",
  evenly: "space-evenly",
  around: "space-around",
};

export function LaneBox({
  edge,
  style,
  isOver,
  laneRef,
  trackStyle,
  children,
  ...rest
}: {
  edge: PortEdgeId;
  style?: CSSProperties;
  isOver?: boolean;
  laneRef?: (el: HTMLElement | null) => void;
  /** Overrides on the inner track — V5 turns flex OFF entirely and places
   *  every card by arithmetic instead. */
  trackStyle?: CSSProperties;
  children?: ReactNode;
} & Record<string, unknown>) {
  const model = usePortEdgesModel();
  const horizontal = isHorizontal(edge);
  const custom = model.arrangement.mode === "custom";
  return (
    <div
      ref={laneRef}
      data-slot="port-lane"
      data-owner={model.ownerId}
      data-edge={edge}
      data-over={isOver || undefined}
      className="rounded-sm transition-colors data-[over=true]:bg-[color:var(--bbox-accent)]/20 data-[over=true]:outline data-[over=true]:outline-1 data-[over=true]:outline-[color:var(--bbox-accent)]"
      style={{ display: "flex", padding: 2, ...style }}
      {...(rest as Record<string, never>)}
    >
      <div
        data-slot="port-edge"
        data-edge={edge}
        data-layout={custom ? "custom" : model.arrangement.spacing}
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: horizontal ? "row" : "column",
          justifyContent: custom ? "flex-start" : (SPACING_JUSTIFY[model.arrangement.spacing] ?? "space-evenly"),
          alignItems: "center",
          ...trackStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One slot's card. THE draggable node in every variant (the element whose
 * rect dnd-kit measures and the ghost is sized from), and the element every
 * journey assertion reads — `data-port-id` is the head port, `data-group-size`
 * how many ports a collapsed set folded into it.
 *
 * `nodrag` is React Flow's own node-drag veto class; it does nothing on the
 * DOM render or inside a tldraw shape, and is what stops a port drag from
 * also dragging the node underneath it.
 */
export function PortCard({
  slot,
  edge,
  dragging,
  cardRef,
  style,
  handleProps,
  children,
}: {
  slot: LaneSlot;
  edge: PortEdgeId;
  dragging?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  handleProps?: Record<string, unknown>;
  children?: ReactNode;
}) {
  const model = usePortEdgesModel();
  const custom = model.arrangement.mode === "custom";
  const horizontal = isHorizontal(edge);
  // WHY the press is taken in the CAPTURE phase instead of riding along with
  // the rest of the listeners: the node this card wraps is
  // render-instance.tsx's own member-instance span, whose `onPointerDown`
  // calls `stopPropagation()` so that pressing a member selects THAT member
  // and not its parent. That span is a CHILD of this one, so in the bubble
  // phase it stops the event before dnd-kit's own listener ever sees it and
  // no drag ever activates (found live 2026-09-12: the port highlighted and
  // then sat there). Capture runs ancestor-first, so the sensor sees the
  // press and selection still happens on the same gesture — which is the
  // behaviour Zach already has for every other member type.
  const { onPointerDown: beginDrag, ...restHandle } = (handleProps ?? {}) as {
    onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  } & Record<string, unknown>;
  const positioned: CSSProperties = custom
    ? {
        position: "absolute",
        ...(horizontal
          ? { left: `${slot.t * 100}%`, transform: "translateX(-50%)" }
          : { top: `${slot.t * 100}%`, transform: "translateY(-50%)" }),
      }
    : {};
  return (
    <span
      ref={cardRef}
      data-slot="port-group"
      data-port-id={slot.headId}
      data-group={slot.portIds.length > 1 ? slot.group : undefined}
      data-group-size={slot.portIds.length}
      data-group-key={slot.groupKey}
      data-family-size={slot.familySize}
      data-dragging={dragging || undefined}
      // WHY inline-flex and not `display: contents`: dnd-kit measures THIS
      // element's own getBoundingClientRect() for its drag math, and
      // `contents` generates no box at all — it measured as a zero rect at
      // (0,0), and every drop resolved against the viewport origin instead
      // of the pointer.
      className="nodrag inline-flex rounded-sm data-[dragging=true]:opacity-30 data-[group-key]:outline-dashed data-[group-key]:outline-1 data-[group-key]:outline-offset-2 data-[group-key]:outline-[color:var(--bbox-accent)]"
      style={{ touchAction: "none", ...positioned, ...style }}
      {...(restHandle as Record<string, never>)}
      onPointerDownCapture={(event) => beginDrag?.(event)}
    >
      {/* The lane tells the Port which way its label faces — PortEdge's own
        * `cascadeInto`, reused rather than re-derived, so a port dragged from
        * the top edge to the left edge flips its label from below-the-dot to
        * beside-it, and does NOT keep the seeded `edge` prop it arrived with.
        * The cascade looks THROUGH host elements (the member-instance span
        * that wraps every member) and stamps the first component underneath,
        * which is the Port. A Port that sets its own textLayout still wins. */}
      {children ?? cascadeInto(model.members[slot.headId], inwardTextLayout(edge))}
    </span>
  );
}

/**
 * The ghost, for the three variants that use one.
 *
 * THE STRETCH GATE LIVES HERE, and it is structural, not a tuning:
 *
 *  1. `adjustScale` is NEVER passed. dnd-kit's DndContext unconditionally
 *     bakes `scaleX = over.rect.width / activeNodeRect.width`,
 *     `scaleY = over.rect.height / activeNodeRect.height` into the transform
 *     every draggable reads (core.esm.js:2997 -> `adjustScale`, :515). The
 *     `adjustScale` PROP is not "let my modifier's scale through" — it is
 *     only the flag that stops PositionedOverlay resetting those to 1
 *     (:3657). Passing it is what stretched the ghost to the whole lane it
 *     was over: measured live 2026-09-12 at zoom 1, over the 364x26 top lane
 *     a 33x24 ghost painted 364x26 (scaleX 10.9217), over the 26x52 left lane
 *     it painted 26x52 (scaleY 2.16667) — the exact ratios, to six decimals.
 *     Without the prop dnd-kit forces scale 1 and the wrapper is exactly the
 *     live node's rect, so no lane can ever resize the ghost again.
 *  2. Host zoom is applied by US, on an inner div, not by dnd-kit. The
 *     clone is unscaled markup rendered at document.body, outside every
 *     scaled ancestor; the wrapper's width/height are the live (already
 *     zoomed) rect. `scale(zoom)` from `0 0` lays the ghost exactly over the
 *     dot it was grabbed from at any camera zoom.
 *  3. The content is a REAL re-render of the Port node, never
 *     `dangerouslySetInnerHTML` of `outerHTML`. A clone loses its inherited
 *     typography and has to have it snapshotted back on; a re-render cannot
 *     drift from the thing it is a ghost of.
 *
 * Portaled to document.body because DragOverlay is `position: fixed`, which
 * the spec makes relative to the nearest TRANSFORMED ancestor rather than
 * the viewport — and every React Flow node and tldraw shape carries exactly
 * such a transform.
 */
export function PortGhost({ portId }: { portId: string | null }) {
  const model = usePortEdgesModel();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The live card's own box, measured the moment the drag starts.
  //
  // WHY the ghost is given an explicit box instead of letting its content
  // size itself: a lane is a 26px band, and a card inside it is SQUEEZED by
  // that band's cross axis. The same Port re-rendered at document.body has
  // nothing squeezing it, so it lays out at its natural width — measured live
  // 2026-09-12 inside a tldraw shape at zoom 2.5: the live card 75x45 client
  // px, the free-standing ghost 187.5x60. Pinning the ghost to the rect it
  // was grabbed from is what makes "the ghost is the same size as the dot"
  // true by construction rather than by luck, on every host.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!portId) {
      setBox(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-port-id="${CSS.escape(portId)}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Client px / zoom = the CSS px the ghost must be laid out in before we
    // scale it back up by the same zoom.
    setBox({ width: rect.width / model.zoom, height: rect.height / model.zoom });
  }, [portId, model.zoom]);

  const node = portId ? model.members[portId] : null;
  const body = useMemo(
    () => (
      // WHY `dropAnimation={null}`: the default animates the ghost back to
      // the source rect after the model already moved the port, so a
      // screenshot taken right after release catches a phantom in flight.
      // The drop is the truth; nothing should fly.
      <DragOverlay dropAnimation={null} style={{ overflow: "visible" }}>
        {node && box ? (
          <div
            data-slot="port-ghost"
            className="pointer-events-none flex items-center"
            style={{
              width: box.width,
              height: box.height,
              // The live card does not WRAP inside its 26px band — its label
              // overflows it. An explicitly-sized ghost would wrap instead,
              // which is a different picture of the same port.
              whiteSpace: "nowrap",
              transform: model.zoom === 1 ? undefined : `scale(${model.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {node}
          </div>
        ) : null}
      </DragOverlay>
    ),
    [node, box, model.zoom],
  );
  if (!mounted) return null;
  return createPortal(body, document.body);
}
