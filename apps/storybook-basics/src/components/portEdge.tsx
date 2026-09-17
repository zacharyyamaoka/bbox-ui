"use client";

// src/components/portEdge.tsx — a new component whose LOGIC is
// demos/dndkit-lab's Stage 6 "Single port edge" (claude/dndkit-lab@5898ecb,
// `SinglePortEdgeStage.tsx`), restated as props instead of stage-local
// `useState` (docs/PORT-EDGE-PLAN.md Phase 3, D2: copy the lab's logic,
// never merge the branch — that demo predates the Port/LabeledPort split
// and would fail typecheck as-is).
//
// Stock parts this file is built from (docs/PORT-EDGE-PLAN.md's own
// table): `useSortable`/`SortableContext`/`arrayMove`/
// `{horizontal,vertical}ListSortingStrategy` (@dnd-kit/sortable),
// `CSS.Transform`/`CSS.Translate` (@dnd-kit/utilities), `DndContext`/
// `useDroppable`/`useDraggable`/`closestCenter`/`PointerSensor`
// (@dnd-kit/core). The spacing math and the grouping/group-syntax model
// live in `./portEdge.layout.ts`.
//
// D6 (this file's own correction — see the final report): the plan named
// `useDndContext()` as how a PortEdge would detect an ANCESTOR DndContext
// and skip mounting its own. `@dnd-kit/core@6.3.1` doesn't actually expose
// that as public API — `useDndContext()` always returns a value (the
// module's fixed default object when unwrapped, a real one when wrapped),
// and there is no exported way to tell those two apart from outside the
// package. `PortEdgeDndScope` below is a small ad hoc marker context that
// gets the exact same OBSERVABLE behaviour Zach asked for ("PortEdge stays
// one edge; it mounts its own DndContext only when it needs to") without
// reaching into `@dnd-kit/core`'s unexported internals: a story wrapping
// several `<PortEdge>`s in one shared `<PortEdgeDndProvider>` (which sets
// both the real DndContext AND this marker) gets one drag session across
// every edge inside it; a bare `<PortEdge>` mounts its own.
//
// Pointer sensor only, same as the lab: a `KeyboardSensor` +
// `sortableKeyboardCoordinates` was tried here too, and its activation
// (Space) worked, but its arrow-key MOVE never advanced past the active
// item's own position in this environment (`sortableKeyboardCoordinates`'s
// `closestCorners` lookup kept resolving back to the dragged item) —
// tracked as a real gap in the final report rather than shipped half-working.
// Real pointer drag is unaffected and is what's verified end to end.
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LanguageSupport } from "@codemirror/language";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CodeEditor } from "./codeEditor";
import { LabeledPort } from "./labeledPort";
import type { PortState } from "./port";
import { PORT_DIAMETERS, PORT_LABEL_GAP, PORT_RING_OVERHANG_PX, inwardTextLayout, type BlockSide, type PortTextLayout } from "./port.layout";
import { formatPortLane, reconcilePortLane } from "./portLane";
import {
  CONTAINER_BORDER,
  CONTAINER_PADDING,
  DEFAULT_ALIGN_GAP,
  buildColorMap,
  computeSlots,
  distributionStyle,
  groupingSetFromText,
  interSlotGapPx,
  type Distribution,
  type Size,
  type Slot,
} from "./portEdge.layout";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** One draggable unit on an edge. `state` defaults to `"empty"` when a
 *  caller's story never bothers to set it. */
export interface PortEdgeItem {
  id: string;
  label: string;
  state?: PortState;
}

export type PortEdgeArrangeMode = "auto" | "custom";
export type PortEdgeGroupMode = "off" | "grouped" | "collapsed";

const AXIS_FOR_EDGE: Record<BlockSide, "row" | "column"> = {
  top: "row",
  bottom: "row",
  left: "column",
  right: "column",
};

const DEFAULT_SIZE: Record<"row" | "column", Size> = {
  row: { width: 420, height: 120 },
  column: { width: 160, height: 420 },
};

const DEFAULT_DISTRIBUTION: Distribution = { mode: "distribute", scheme: "space-between" };

export interface PortEdgeProps {
  /** Droppable/sortable container id — defaults to `edge`. Override when a
   *  story places two edges on the same side (rare). */
  id?: string;
  edge: BlockSide;
  /** Controlled port order. */
  items: PortEdgeItem[];
  onItemsChange?(items: PortEdgeItem[]): void;
  /** The spacing controls: evenly-spaced (`distribute`) vs packed-from-an-
   *  end (`aligned`). */
  distribution?: Distribution;
  /** Auto = flex-laid-out (distribute/aligned above); Custom = free drag
   *  along the main axis, positions in `freeOffsets`. */
  mode?: PortEdgeArrangeMode;
  freeOffsets?: Record<string, number>;
  onFreeOffsetsChange?(next: Record<string, number>): void;
  /** Edge-owned grouping text — one bracketed (or bare) comma list per
   *  line, parsed by `groupingSetFromText` (./portEdge.layout.ts). A port
   *  never carries its own group membership; the edge assigns it. */
  groups?: string;
  groupMode?: PortEdgeGroupMode;
  /**
   * The focus toggle: off = the entire LabeledPort — dot, label, secondary
   * slot, everything port-associated — is hidden, not just dimmed (B3).
   * Independent of `showCard`: this toggle alone decides whether a port
   * renders at all; `showCard` decides whether whatever DOES render sits
   * inside a bordered kanban-style card or bare on the rail.
   */
  showPorts?: boolean;
  /**
   * B3's second toggle: wraps each slot's content in a real card — a
   * bordered, rounded, padded surface (this app's own `Block` idiom, not a
   * new visual language) — rather than the bare labeled port sitting
   * directly on the rail. Independent of `showPorts`: with both off, the
   * slot renders nothing but still occupies its layout position (a fixed
   * minimum footprint, `EMPTY_SLOT_MIN_PX`), so distribution/pitch stay
   * inspectable even when nothing is visible.
   */
  showCard?: boolean;
  /** Dev-time box — off is how it sits once a real Block draws its own
   *  outline. */
  showContainer?: boolean;
  /** Dev-time guide for where the edge line actually is; a real Block IS
   *  the line. */
  showCenterLine?: boolean;
  size?: Size;
  /** Optional card content override — the port edge doesn't actually care
   *  what goes inside its card. Default renders a `LabeledPort` with the
   *  inward text layout (or, with `showPorts` off, the bare label). */
  renderItem?(item: PortEdgeItem, ctx: { textLayout: PortTextLayout }): ReactNode;
  /**
   * Label placement for every port's DEFAULT `LabeledPort` — Phase 2's
   * existing `PortTextLayout` vocabulary (`LabeledPort`'s own `textLayout`
   * prop), reused rather than a second one. Omit for the edge's own inward
   * default (`inwardTextLayout(edge)`); a column edge also accepts the two
   * "Offset" members (wire clearance). Ignored when `renderItem` is set —
   * that override owns its own layout.
   */
  textLayout?: PortTextLayout;
  /**
   * Phase 4: the multi-line lane — one `CodeEditor` line per port, each
   * pinned to that port's own dot on the rail (PORT-EDGE-PLAN-PHASE4.md).
   * Controlled, like `mode`/`groupMode`: the STORY decides when it's open
   * (D15). Column edges (`left`/`right`) only, and only in `mode="auto"`
   * with no COLLAPSED real family blocking the line<->dot bijection — see
   * `laneAvailability` for the exact predicate and its reason string.
   */
  editing?: boolean;
  onEditingChange?(next: boolean): void;
  /**
   * Follow-up feedback item 3: the lane's syntax parser, e.g. `python()`
   * from `@codemirror/lang-python` (already a dependency — `CodeEditor`
   * itself already exposes this exact prop for its own `PseudoCode` story).
   * Omit for plain text. A story-level toggle, not a PortEdge concern of
   * its own — the edge just forwards whatever `LanguageSupport` it's given
   * straight to the lane's `CodeEditor`.
   */
  laneLanguage?: LanguageSupport;
}

/* ------------------------------------------------------------------ */
/* PortEdgeDndProvider — the shared-DndContext boundary a multi-edge    */
/* story (LeftAndRight/AroundABox) wraps several <PortEdge>s in. Owns    */
/* the cross-edge onDragOver/onDragEnd the story itself provides — the   */
/* "4-around-a-box arrangement belongs to the story" rule (D6).          */
/* ------------------------------------------------------------------ */

const PortEdgeDndScope = createContext(false);

export function PortEdgeDndProvider({
  onDragOver,
  onDragEnd,
  children,
}: {
  onDragOver?(event: DragOverEvent): void;
  onDragEnd?(event: DragEndEvent): void;
  children: ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      <PortEdgeDndScope.Provider value={true}>{children}</PortEdgeDndScope.Provider>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/* Reordering — slot-level (a dragged group carries every member).      */
/* ------------------------------------------------------------------ */

/** Reorders `items` by moving `activeSlotId`'s slot next to
 *  `overSlotId`'s, preserving each item's own label/state (the lab's own
 *  `slots` only carry ids — this restores the metadata after arrayMove). */
export function reorderItemsBySlot(items: PortEdgeItem[], slots: Slot[], activeSlotId: string, overSlotId: string): PortEdgeItem[] {
  const oldIndex = slots.findIndex((s) => s.slotId === activeSlotId);
  const newIndex = slots.findIndex((s) => s.slotId === overSlotId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return items;
  const reordered = arrayMove(slots, oldIndex, newIndex);
  const byId = new Map(items.map((it) => [it.id, it] as const));
  return reordered.flatMap((s) => s.members.map((m) => byId.get(m.id)).filter((it): it is PortEdgeItem => it != null));
}

/* ------------------------------------------------------------------ */
/* EdgeLineMark — the Block's edge itself, drawn as a straight line     */
/* through the track.                                                  */
/* ------------------------------------------------------------------ */

function EdgeLineMark({ axis }: { axis: "row" | "column" }) {
  return (
    <div
      data-slot="port-edge-center-line"
      aria-hidden
      style={
        axis === "row"
          ? { position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border)", pointerEvents: "none" }
          : { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "var(--border)", pointerEvents: "none" }
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* PortEdgeSlotBox — ONE port's content, at a FIXED main-axis size       */
/* (`slotMainPx`) shared by every slot on the edge — single or grouped.  */
/* That shared, content-independent size is what makes B5's pitch match  */
/* provable rather than coincidental: see `interSlotGapPx`'s own doc.    */
/* ------------------------------------------------------------------ */

interface PortEdgeSlotBoxProps {
  item: PortEdgeItem | undefined;
  edge: BlockSide;
  showPorts: boolean;
  showCard: boolean;
  slotMainPx: number;
  renderItem?: PortEdgeProps["renderItem"];
  /** Part B: an explicit label placement wins over the edge's own inward
   *  default — the SAME `PortTextLayout` vocabulary `LabeledPort` already
   *  has (Phase 2), reused rather than invented twice. */
  textLayoutOverride?: PortTextLayout;
  /** Phase 4: the lane is open — hide this port's own single-line label
   *  (the dot stays) via `LabeledPort`'s existing `labelSlot` seam, present
   *  since Phase 2 for exactly this kind of swap
   *  (`labelSlot !== undefined` -> present-beats-absent, B4/labeledPort.tsx). */
  hideLabel?: boolean;
}

// B3: a slot must occupy its rail position even when nothing renders inside
// it (`showPorts` and `showCard` both off) — a distribution scheme spaces
// BOXES, and a zero-size box breaks the pitch it's supposed to hold.
const EMPTY_SLOT_MIN_PX = 24;
const CARD_PADDING_PX = 8;
const CARD_BORDER_PX = 1; // Tailwind's default `border` width (block.tsx's own card idiom).

function cardMainPx(): number {
  return PORT_DIAMETERS.md + 2 * CARD_PADDING_PX + 2 * CARD_BORDER_PX;
}

function PortEdgeSlotBox({ item, edge, showPorts, showCard, slotMainPx, renderItem, textLayoutOverride, hideLabel }: PortEdgeSlotBoxProps) {
  const textLayout = textLayoutOverride ?? inwardTextLayout(edge);
  // B3: `showPorts=false` hides the ENTIRE LabeledPort — dot, label,
  // secondary slot — not just the dot. A host's own `renderItem` still wins
  // outright (it doesn't have to BE a LabeledPort at all), matching the
  // existing "the port edge doesn't actually care what goes inside its
  // card" contract; `showPorts` only ever gates the DEFAULT fill.
  const port =
    item == null ? null : renderItem ? renderItem(item, { textLayout }) : showPorts ? (
      <LabeledPort edge={edge} state={item.state ?? "empty"} diameter="md" textLayout={textLayout} labelSlot={hideLabel ? null : undefined}>
        {item.label}
      </LabeledPort>
    ) : null;

  const boxStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: slotMainPx,
    height: slotMainPx,
    boxSizing: "border-box",
    flexShrink: 0,
  };

  return (
    <span data-slot="port-edge-member" style={boxStyle}>
      {showCard ? (
        // B3: "actually show a card, like a kanban card" — this app's own
        // Block idiom (block.tsx: rounded-lg border bg-card shadow-sm), not
        // a new visual language. Renders even with `port` null, so
        // `showCard` alone still reads as a real (if empty) card.
        <div data-slot="port-edge-card-surface" className="rounded-lg border border-border bg-card shadow-sm" style={{ ...boxStyle, padding: CARD_PADDING_PX }}>
          {port}
        </div>
      ) : (
        port
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Slot body — the ×N chip once collapsed (B8: unchanged); otherwise a   */
/* single PortEdgeSlotBox, or — a real "grouped" family, not collapsed — */
/* every member's own box laid out along the edge's OWN axis (B7) at the */
/* SAME pitch the rest of the edge uses (B5), with one enclosing outline */
/* around the group's circles (B6).                                     */
/* ------------------------------------------------------------------ */

interface SlotRenderProps {
  slot: Slot;
  axis: "row" | "column";
  edge: BlockSide;
  itemsById: Map<string, PortEdgeItem>;
  showPorts: boolean;
  showCard: boolean;
  collapsed: boolean;
  slotMainPx: number;
  gapPx: number;
  color?: string;
  renderItem?: PortEdgeProps["renderItem"];
  textLayoutOverride?: PortTextLayout;
  hideLabel?: boolean;
}

const GROUP_OUTLINE_PAD = 6;

/**
 * B6: measured, not computed — the group's own members are real flex
 * children (B7's axis-aware stack), so there's no closed-form box for
 * "wherever their circles actually landed" the way there is for the pitch
 * (whose formula this file derives precisely because a closed form exists
 * there). Scoped to ONE group's own DOM subtree — simpler and cheaper than
 * a track-wide sweep, and correct by construction since a group's members
 * are always each other's DOM siblings here.
 */
function useEnclosingCircleBox(containerRef: RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      setBox(null);
      return;
    }
    const dots = Array.from(el.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
    if (dots.length < 2) {
      setBox(null);
      return;
    }
    const containerRect = el.getBoundingClientRect();
    const rects = dots.map((d) => d.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)) - containerRect.left - GROUP_OUTLINE_PAD;
    const top = Math.min(...rects.map((r) => r.top)) - containerRect.top - GROUP_OUTLINE_PAD;
    const right = Math.max(...rects.map((r) => r.right)) - containerRect.left + GROUP_OUTLINE_PAD;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - containerRect.top + GROUP_OUTLINE_PAD;
    setBox({ left, top, width: right - left, height: bottom - top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

function GroupSlotBody({ slot, edge, itemsById, showPorts, showCard, axis, slotMainPx, gapPx, color, renderItem, textLayoutOverride, hideLabel }: SlotRenderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const memberIds = slot.members.map((m) => m.id).join(",");
  const box = useEnclosingCircleBox(containerRef, [memberIds, axis, showPorts, showCard, slotMainPx, gapPx]);
  return (
    <div data-slot="port-edge-group" ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: axis === "row" ? "row" : "column", gap: gapPx }}>
      {box && (
        <div
          data-slot="port-edge-group-outline"
          data-group-id={slot.slotId}
          aria-hidden
          style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, border: `2px solid ${color ?? "var(--border)"}`, borderRadius: 10, pointerEvents: "none" }}
        />
      )}
      {slot.members.map((m) => (
        <PortEdgeSlotBox
          key={m.id}
          item={itemsById.get(m.id)}
          edge={edge}
          showPorts={showPorts}
          showCard={showCard}
          slotMainPx={slotMainPx}
          renderItem={renderItem}
          textLayoutOverride={textLayoutOverride}
          hideLabel={hideLabel}
        />
      ))}
    </div>
  );
}

function SlotBody(props: SlotRenderProps) {
  const { slot, itemsById, collapsed } = props;
  const isRealGroup = slot.members.length > 1;

  // Follow-up feedback item 5: collapsed renders ONE real port — not a
  // bare pill with no dot — standing in for the whole group, its label
  // replaced with "+N more" (N = the group's full member count). Chosen
  // idiom: "+N more", the SAME wording item 6's hidden-port count uses,
  // rather than shipping two idioms (`×N` here, "+X more" there) for what
  // Zach called "the same fact". No member is named individually once
  // collapsed, so N counts the WHOLE cluster, not "besides the one shown"
  // — the dot is a visual anchor (it borrows the first member's own state,
  // so a collapsed group of all-`wired` ports still reads as wired), not a
  // stand-in for that specific port's identity.
  //
  // Reusing `PortEdgeSlotBox` verbatim — rather than a bespoke pill — is
  // what keeps B8's "fits a single card slot" guarantee true BY
  // CONSTRUCTION: it gets the exact same `slotMainPx` box every other slot
  // uses, so there is nothing new to measure.
  if (collapsed && isRealGroup) {
    const first = slot.members[0];
    const sourceItem = first ? itemsById.get(first.id) : undefined;
    const collapsedItem: PortEdgeItem = {
      id: slot.slotId,
      label: `+${slot.members.length} more`,
      state: sourceItem?.state ?? "empty",
    };
    return (
      <PortEdgeSlotBox
        item={collapsedItem}
        edge={props.edge}
        showPorts={props.showPorts}
        showCard={props.showCard}
        slotMainPx={props.slotMainPx}
        // Deliberately NOT `props.renderItem` — a host override renders
        // ONE port's real content; the collapsed summary is a fixed idiom
        // of this component's own, same as before this change.
        textLayoutOverride={props.textLayoutOverride}
        hideLabel={props.hideLabel}
      />
    );
  }

  // B5/B7: a real, NOT-collapsed group renders every member's own box,
  // along the edge's own axis, at the edge's own pitch.
  if (isRealGroup) return <GroupSlotBody {...props} />;

  const member = slot.members[0];
  const item = member ? itemsById.get(member.id) : undefined;
  return (
    <PortEdgeSlotBox
      item={item}
      edge={props.edge}
      showPorts={props.showPorts}
      showCard={props.showCard}
      slotMainPx={props.slotMainPx}
      renderItem={props.renderItem}
      textLayoutOverride={props.textLayoutOverride}
      hideLabel={props.hideLabel}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Cards — sortable (Auto mode) and free-draggable (Custom mode).       */
/* ------------------------------------------------------------------ */

/**
 * B1: `@dnd-kit/sortable`'s `useSortable` returns a `transform` that can
 * carry `scaleX`/`scaleY` — not from this card's OWN drag (that part is a
 * pure translate), but from `useDerivedTransform`'s "squeeze" animation,
 * which fires on any SIBLING card whose rendered rect changes size as the
 * live reorder shifts its index (sortable.cjs.development.js's own
 * `useDerivedTransform`/`verticalListSortingStrategy`). Our cards are NOT
 * uniform width/height — a label's natural size varies, a grouped card used
 * to be taller than a singleton one — so that scale visibly stretched or
 * shrank a card for one animation frame every time the drag passed it.
 * Zeroing scaleX/scaleY here is the same fix `demos/dndkit-lab`'s own
 * history records for the DragOverlay version of this bug (`adjustScale`,
 * see this file's own report) — always pin scale to 1, only ever translate.
 */
function neutralizeScale(transform: Parameters<typeof CSS.Transform.toString>[0]) {
  if (!transform) return transform;
  return { ...transform, scaleX: 1, scaleY: 1 };
}

function SortableSlotCard(props: SlotRenderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.slot.slotId });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(neutralizeScale(transform)),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: "grab",
    touchAction: "none",
  };
  return (
    <div ref={setNodeRef} data-slot="port-edge-card" data-dragging={isDragging || undefined} style={style} {...attributes} {...listeners}>
      <SlotBody {...props} />
    </div>
  );
}

function FreeSlotCard(props: SlotRenderProps & { axis: "row" | "column"; x: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.slot.slotId });
  const drag = CSS.Translate.toString(transform);
  const style: CSSProperties = {
    position: "absolute",
    ...(props.axis === "row"
      ? { left: props.x + CONTAINER_PADDING, top: "50%", transform: `translateY(-50%)${drag ? ` ${drag}` : ""}` }
      : { top: props.x + CONTAINER_PADDING, left: "50%", transform: `translateX(-50%)${drag ? ` ${drag}` : ""}` }),
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
    touchAction: "none",
  };
  return (
    <div ref={setNodeRef} data-slot="port-edge-card" data-dragging={isDragging || undefined} style={style} {...attributes} {...listeners}>
      <SlotBody {...props} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase 4 — the multi-line lane. Availability predicate, pitch/origin  */
/* measurement (D8), and the CodeEditor overlay itself.                */
/* ------------------------------------------------------------------ */

/**
 * Whether the multi-line lane can open, AND why not when it can't — a
 * disabled control must say why (PORT-EDGE-PLAN-PHASE4.md §5: never hide a
 * present feature; a silent no-op violates truthful rendering outright).
 * Column edges only (a CodeMirror document's lines stack vertically);
 * `mode="auto"` only (Custom's free offsets have no defined line order);
 * blocked ONLY when a `groupMode==="collapsed"` REAL family would render as
 * a ×N chip — one row standing in for N ports breaks the line<->dot
 * bijection.
 *
 * `groupMode==="grouped"` does NOT block, and this is the load-bearing
 * finding the coordinator asked this file to settle: B5/B7's fix (this
 * file's own `GroupSlotBody`) means a grouped-but-not-collapsed family
 * still renders every member's own dot, at the SAME uniform pitch the rest
 * of the edge uses (`interSlotGapPx`) — so the line<->dot bijection holds
 * there too, and PORT-EDGE-PLAN-PHASE4.md's A11 defensive gate
 * ("grouped-with-no-real-family stays enabled") generalizes cleanly to
 * "collapsed is the only thing that ever blocks it, and only when a real
 * family exists" — checked over the COMPUTED slots, never the raw flag,
 * exactly as A11 already required. Nothing further needs guarding.
 */
export function laneAvailability(
  axis: "row" | "column",
  mode: PortEdgeArrangeMode,
  groupMode: PortEdgeGroupMode,
  slots: Slot[],
): { available: boolean; reason?: string } {
  if (axis !== "column") return { available: false, reason: "a lane needs a vertical edge" };
  if (mode !== "auto") return { available: false, reason: "switch to Auto to edit as lines" };
  const blocked = groupMode === "collapsed" && slots.some((s) => s.members.length > 1);
  if (blocked) return { available: false, reason: "ungroup to edit as lines" };
  return { available: true };
}

// D8: `PORT_ROW_PITCH_PX` (packages/bbox-ui/src/port.layout.ts:50) exists
// with zero call sites anywhere — re-derived as a same-valued FALLBACK
// rather than imported, since the real pitch here is whatever this edge's
// own distribution actually produced (varies with label placement and
// distribution mode — the whole reason Part B's cross-product needs a
// MEASURED pitch, not one formula per combination).
const LANE_PITCH_FALLBACK_PX = 44;
// Follow-up feedback (item 1): the lane now keeps codeEditor.css's own
// frame — `border: 1px solid; padding: 4px 6px; border-radius: 6px` — so it
// reads as a real CodeEditor panel (Zach: "make sure to highlight the
// perimeter so that it looks like a code editor component"), instead of
// zeroing it to bare floating text. The origin math has to cancel that
// REAL inset now, plus the small residual measured live in the real
// browser: every rendered `.cm-line`'s centre sat 2px below the dot it
// should align with, uniformly, across every configuration tried — most
// likely CodeMirror's own base theme contributing a little vertical
// padding inside `.cm-line` that this app's CSS never targets. This is the
// exact defect PORT-EDGE-PLAN-PHASE4.md §3 warns SystemSketch's own lane
// shipped with (there, from a 2px accent border never subtracted) — same
// SYMPTOM, different cause; A1's own measurement is what caught it here
// instead of shipping it silent.
const LANE_FRAME_BORDER_PX = 1;
const LANE_FRAME_PADDING_TOP_PX = 4;
const LANE_CM_RESIDUAL_PX = 2;
const LANE_GAP_PX = PORT_LABEL_GAP + PORT_RING_OVERHANG_PX; // same gap a port's own label sits at.

interface LaneGeometry {
  pitch: number;
  top: number;
  dotLeft: number;
  dotRight: number;
}

/**
 * D8: measure, don't assume. `apps/storybook-basics` is an app, not the
 * core (bbox-ui's one rule is the CORE never measuring itself), so reading
 * the live dots' own rendered positions is legal here — and it's the only
 * way to stay correct across Part B's full cross-product (labels left /
 * right / offset × aligned-to-edge / evenly-spaced): the pitch is
 * label-height- and distribution-driven, not a constant.
 */
function useLaneGeometry(trackRef: RefObject<HTMLDivElement | null>, active: boolean, deps: unknown[]): LaneGeometry | null {
  const [geometry, setGeometry] = useState<LaneGeometry | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      setGeometry(null);
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const dots = Array.from(track.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
      if (dots.length === 0) {
        setGeometry(null);
        return;
      }
      const trackRect = track.getBoundingClientRect();
      const firstRect = dots[0].getBoundingClientRect();
      const secondRect = dots.length >= 2 ? dots[1].getBoundingClientRect() : null;
      const pitch = secondRect ? secondRect.top + secondRect.height / 2 - (firstRect.top + firstRect.height / 2) : LANE_PITCH_FALLBACK_PX;
      const firstCenterY = firstRect.top + firstRect.height / 2 - trackRect.top;
      const top = firstCenterY - pitch / 2 - LANE_FRAME_BORDER_PX - LANE_FRAME_PADDING_TOP_PX - LANE_CM_RESIDUAL_PX;
      setGeometry({ pitch, top, dotLeft: firstRect.left - trackRect.left, dotRight: firstRect.right - trackRect.left });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return geometry;
}

let laneIdCounter = 0;

function PortLaneOverlay({
  trackRef,
  visualOrder,
  onItemsChange,
  onClose,
  language,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  visualOrder: PortEdgeItem[];
  onItemsChange?(items: PortEdgeItem[]): void;
  onClose(): void;
  language?: LanguageSupport;
}) {
  const geometry = useLaneGeometry(trackRef, true, [visualOrder.map((p) => p.id).join(",")]);
  if (!geometry) return null;
  // Follow-up feedback (item 2): the lane ALWAYS sits to the right of the
  // rail, text left-aligned — regardless of whether the individual ports'
  // OWN labels flow left, right, or offset. Zach: "nobody types
  // comfortably into right-aligned text." PORT-EDGE-PLAN-PHASE4.md §3
  // already recorded this (citing the donor's own `inlineBlockEditing.ts`:
  // "a right-aligned editor feels reverse... parks the lane outside the
  // right edge left-aligned instead") and its own prop table already said
  // `align: "left"` on BOTH sides — this file's earlier version read that
  // as "always align left" but still let `textLayout` steer which SIDE the
  // panel opened on, which is the one thing the spec's own citation was
  // actually about. Position is no longer a function of the resting
  // labels' placement at all.
  const wrapperStyle: CSSProperties = {
    position: "absolute",
    top: geometry.top,
    left: geometry.dotRight + LANE_GAP_PX,
    zIndex: 5,
  };
  return (
    <div data-slot="port-edge-lane" style={wrapperStyle}>
      <CodeEditor
        value={formatPortLane(visualOrder)}
        onWrite={(text) => {
          const next = reconcilePortLane(visualOrder, text, (label) => ({ id: `lane-${laneIdCounter++}`, label, state: "empty" }));
          if (next !== visualOrder) onItemsChange?.(next);
        }}
        multiline
        lineHeightPx={geometry.pitch}
        align="left"
        language={language}
        autoFocus
        onEnter={onClose}
        onEscape={onClose}
        // Follow-up feedback (item 1): NO LONGER zeroes the sibling
        // `CodeEditor`'s own frame chrome — codeEditor.css's stock
        // `.bbox-code-editor` (bordered, rounded, padded, card background)
        // is exactly "a code editor component", and its existing
        // `:focus-within { border-color: var(--color-primary) }` rule is
        // what paints the focused/active perimeter for free the moment
        // `autoFocus` takes effect — no new CSS, no second visual language.
        // `--color-primary` is redefined to `--color-ring` LOCALLY, as a
        // CSS custom property on this one instance's inline style, rather
        // than editing codeEditor.css itself (that file is the sibling
        // lane's, not touched here): measured live, this app's default
        // shadcn theme gives `--color-primary` the exact same value as
        // `--color-border` (`oklch(0.922 0 0)`), so the stock rule fired
        // correctly but was invisible. `--ring`/`--color-ring`
        // (`oklch(0.708 0 0)`) is this app's OWN existing token for
        // exactly this "focused" concept — `EditableText` already uses
        // `var(--bbox-ring, currentColor)` for its own focus ring — so
        // this reuses an established token rather than inventing a colour.
        // `width` stays an override (content-hugging, not `100%` of an
        // absolutely positioned parent with no opposite edge set).
        style={{ width: "max-content", "--color-primary": "var(--color-ring)" } as CSSProperties}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PortEdgeBody — the track: droppable + sortable, no opinion about      */
/* who owns the surrounding DndContext.                                */
/* ------------------------------------------------------------------ */

function PortEdgeBody({
  id,
  edge,
  items,
  onItemsChange,
  distribution = DEFAULT_DISTRIBUTION,
  mode = "auto",
  freeOffsets = {},
  groups = "",
  groupMode = "off",
  showPorts = true,
  showCard = false,
  showContainer = true,
  showCenterLine = true,
  size,
  renderItem,
  textLayout,
  editing = false,
  onEditingChange,
  laneLanguage,
}: PortEdgeProps) {
  const containerId = id ?? edge;
  const axis = AXIS_FOR_EDGE[edge];
  const resolvedSize = size ?? DEFAULT_SIZE[axis];
  const strategy: SortingStrategy = axis === "row" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  const itemIds = items.map((i) => i.id);
  const itemsById = new Map(items.map((i) => [i.id, i] as const));
  const { set: groupingSet, unknownIds } = groupingSetFromText(groups, itemIds);
  const slots = computeSlots(itemIds, groupingSet, groupMode);
  const colorMap = buildColorMap(itemIds, groupingSet);

  const lane = laneAvailability(axis, mode, groupMode, slots);
  const laneOpen = editing && lane.available;
  // D12/A12: a mid-edit mode switch CLOSES the lane rather than leaving it
  // silently mismatched — `lineHeightPx` re-pins live while the document
  // itself freezes on focus, so an unavailable-but-still-mounted lane would
  // drift off its dots with no error. Closing is provably content-lossless
  // (the live write policy already wrote every keystroke to `items`).
  useEffect(() => {
    if (editing && !lane.available) onEditingChange?.(false);
  }, [editing, lane.available, onEditingChange]);
  const resolvedTextLayout = textLayout ?? inwardTextLayout(edge);
  // The lane's own line order: the VISUAL (dot) order, not necessarily
  // `items`' raw array order — a grouped family's members render
  // contiguously beside each other's dots (GroupSlotBody), and the lane
  // must match what's actually on screen, one line per dot top to bottom.
  const visualOrder = slots.flatMap((s) => s.members.map((m) => itemsById.get(m.id)).filter((it): it is PortEdgeItem => it != null));

  // B5/B7: every slot — single or grouped — shares this ONE fixed main-axis
  // size and this ONE inter-slot gap, computed the SAME way `interSlotGapPx`
  // assumes (see its own doc). `mode==="custom"` has no pitch guarantee to
  // begin with (free positions), so it keeps the DEFAULT_ALIGN_GAP fallback
  // rather than this edge's real distribution math.
  //
  // WHY the gap's "count" is `items.length` (every PORT), not `slots.length`
  // (every rendered DOM box): under a `distribute` scheme, grouping merges N
  // ports into 1 box, so `slots.length` SHRINKS — feeding that shrunk count
  // into the space-between/evenly/around division changes how much free
  // space each remaining gap absorbs, which would make a grouped edge's
  // pitch drift from its OWN ungrouped pitch (A5's actual requirement is
  // "equals the ungrouped pitch for the same items", not merely "uniform").
  // The total content size (`items.length * slotMainPx`) and the total
  // number of gaps a fully-ungrouped edge would have (`items.length - 1`)
  // are both invariant to how those ports happen to be visually clustered —
  // solving the self-consistency equation (internal group gap == the gap
  // flexbox computes BETWEEN the fewer top-level boxes it actually sees)
  // confirms this is the fixed point: using the PORT count here makes the
  // internal group gap and the real inter-box gap land on the exact same
  // number, by construction, not by coincidence.
  const slotMainPx = showCard ? cardMainPx() : EMPTY_SLOT_MIN_PX;
  const contentMainPx = (axis === "row" ? resolvedSize.width : resolvedSize.height) - 2 * CONTAINER_BORDER - 2 * CONTAINER_PADDING;
  const gapPx = mode === "auto" ? interSlotGapPx(distribution, contentMainPx, items.length, slotMainPx) : DEFAULT_ALIGN_GAP;

  const { setNodeRef, isOver } = useDroppable({ id: containerId });
  const trackRef = useRef<HTMLDivElement | null>(null);
  // WHY memoized (not an inline arrow in the JSX below): an inline
  // `(el) => {...}` is a NEW function every render, and React re-runs BOTH
  // halves of a changed ref callback (detach the old one with `null`, then
  // attach the new one) on every such render. React commits ref
  // attachment together with layout effects, child-fibers-before-parent —
  // so `PortLaneOverlay`'s OWN `useLayoutEffect` (a child) could observe
  // `trackRef.current` mid-detach (`null`) on the very render where the
  // lane first mounts, one commit before the parent's ref finished
  // reattaching. Measured live: `trackRef.current` read `true` during
  // `PortLaneOverlay`'s RENDER (a stale value from the previous commit)
  // and `false` inside its layout effect moments later, on the same click.
  // A stable callback identity (`useCallback`) is reused, not
  // detached/reattached, so it never races the child's own effect.
  const setTrackRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      trackRef.current = el;
    },
    [setNodeRef],
  );

  const trackStyle: CSSProperties = {
    boxSizing: "border-box",
    width: resolvedSize.width,
    height: resolvedSize.height,
    position: "relative",
    display: "flex",
    flexDirection: axis === "row" ? "row" : "column",
    alignItems: "center",
    padding: CONTAINER_PADDING,
    border: `${CONTAINER_BORDER}px ${showContainer ? "dashed var(--border)" : "solid transparent"}`,
    borderRadius: 6,
    background: isOver ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined,
    ...(mode === "custom" ? {} : distributionStyle(axis, distribution)),
  };

  return (
    <SortableContext id={containerId} items={slots.map((s) => s.slotId)} strategy={strategy}>
      <div
        ref={setTrackRef}
        data-slot="port-edge"
        data-edge={edge}
        data-unknown-groups={unknownIds.length > 0 ? unknownIds.join(",") : undefined}
        style={trackStyle}
        // D13: starting a drag CLOSES the lane rather than disabling the
        // sortable — `useSortable({disabled:true})` still spreads
        // `attributes` (role/tabIndex) and never reaches Custom mode's
        // `useDraggable` at all, so it doesn't actually stop a drag; a
        // capture-phase pointerdown on any card does, unconditionally, and
        // makes the exclusivity legible instead of emergent (see the
        // codeEditor's OWN capture listener, which this mirrors).
        onPointerDownCapture={
          laneOpen
            ? (event) => {
                if (event.target instanceof Element && event.target.closest('[data-slot="port-edge-card"]')) {
                  onEditingChange?.(false);
                }
              }
            : undefined
        }
      >
        {showCenterLine ? <EdgeLineMark axis={axis} /> : null}
        {laneOpen && <PortLaneOverlay trackRef={trackRef} visualOrder={visualOrder} onItemsChange={onItemsChange} onClose={() => onEditingChange?.(false)} language={laneLanguage} />}
        {mode === "custom"
          ? slots.map((slot) => (
              <FreeSlotCard
                key={slot.slotId}
                slot={slot}
                axis={axis}
                edge={edge}
                itemsById={itemsById}
                showPorts={showPorts}
                showCard={showCard}
                collapsed={groupMode === "collapsed"}
                slotMainPx={slotMainPx}
                gapPx={gapPx}
                color={colorMap.get(slot.slotId)}
                x={freeOffsets[slot.slotId] ?? 0}
                renderItem={renderItem}
                textLayoutOverride={resolvedTextLayout}
                hideLabel={laneOpen}
              />
            ))
          : slots.map((slot) => (
              <SortableSlotCard
                key={slot.slotId}
                slot={slot}
                axis={axis}
                edge={edge}
                itemsById={itemsById}
                showPorts={showPorts}
                showCard={showCard}
                collapsed={groupMode === "collapsed"}
                slotMainPx={slotMainPx}
                gapPx={gapPx}
                color={colorMap.get(slot.slotId)}
                renderItem={renderItem}
                textLayoutOverride={resolvedTextLayout}
                hideLabel={laneOpen}
              />
            ))}
      </div>
    </SortableContext>
  );
}

/* ------------------------------------------------------------------ */
/* PortEdge — one edge of a Block: a droppable, sortable strip of       */
/* ports. Mounts its own DndContext only when not already inside a      */
/* `PortEdgeDndProvider` (see this file's own module doc, D6).          */
/* ------------------------------------------------------------------ */

export function PortEdge(props: PortEdgeProps) {
  const inScope = useContext(PortEdgeDndScope);
  if (inScope) return <PortEdgeBody {...props} />;
  return <StandalonePortEdge {...props} />;
}

/** The standalone wrapper: owns its own `DndContext`, and its own
 *  `handleDragEnd` for the ONE thing a lone edge needs to do — reorder its
 *  own slots (Auto) or nudge a free offset (Custom). A nested `PortEdge`
 *  never runs this; the surrounding `PortEdgeDndProvider`'s own
 *  `onDragEnd` does the equivalent work across every edge it owns. */
function StandalonePortEdge(props: PortEdgeProps) {
  const { edge, items, onItemsChange, mode = "auto", freeOffsets = {}, onFreeOffsetsChange, groups = "", groupMode = "off" } = props;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const axis = AXIS_FOR_EDGE[edge];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    const slotId = String(active.id);
    if (mode === "custom") {
      const d = axis === "row" ? delta.x : delta.y;
      onFreeOffsetsChange?.({ ...freeOffsets, [slotId]: Math.max(0, (freeOffsets[slotId] ?? 0) + d) });
      return;
    }
    if (!over || over.id === active.id) return;
    const itemIds = items.map((i) => i.id);
    const { set: groupingSet } = groupingSetFromText(groups, itemIds);
    const slots = computeSlots(itemIds, groupingSet, groupMode);
    const next = reorderItemsBySlot(items, slots, slotId, String(over.id));
    onItemsChange?.(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <PortEdgeBody {...props} />
    </DndContext>
  );
}
