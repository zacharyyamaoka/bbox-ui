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
import type { Diagnostic } from "./highlighter";
import { LabeledPort } from "./labeledPort";
import { SketchOutline } from "../skin/sketchOutline";
import type { PortState } from "./port";
import { PORT_LABEL_GAP, PORT_RING_OVERHANG_PX, inwardTextLayout, type BlockSide, type PortTextLayout } from "./port.layout";
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
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's PortEdge row):
   * "nothing on the rail itself" — forwarded straight to the `LabeledPort`
   * the default render draws for this item; the PORT is the subject, the
   * rail is furniture. A host's own `renderItem` override is responsible
   * for forwarding this itself if it wants the mark.
   */
  diagnostics?: Diagnostic[];
  /** Forwarded straight to the `LabeledPort` the default render draws for
   *  this item — same "nothing on the rail itself, the PORT is the
   *  subject" rule `diagnostics` follows, one row up. See
   *  `PortDotPaintInput.availability`'s own doc
   *  (docs/INVALID-STATES-PLAN.md D5, ruling 5). */
  availability?: "available" | "unavailable";
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
   * renders at all; `showCard` decides whether a translucent inspector-style
   * outline is drawn OVER whatever does render.
   */
  showPorts?: boolean;
  /**
   * WHY overlay, not container (2026-09-17,
   * docs/FEEDBACK-2026-09-17b-PLAN.md, Lane B — "this should apply to both
   * the block and also the port edges"): the card is a VIEW of a port that
   * is always there — Zach's own framing — so it must never resize the slot
   * it describes. On = a translucent red, Chrome-inspector-style outline
   * paints OVER the slot at its EXISTING fixed footprint (`EMPTY_SLOT_MIN_PX`,
   * unconditional now — see that constant), rather than the old "bordered,
   * rounded, padded surface" that grew the slot to make room for itself.
   * Independent of `showPorts`: with both off, the slot renders nothing but
   * still occupies its layout position, so distribution/pitch stay
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
   * D-A7 (docs/BLOCK-PORT-EDGES-PLAN.md §4b·S1): what a COLLAPSED real
   * family draws, when the host needs something other than this component's
   * own `+N more` chip. The case that asked for it is VIEW-collapse: a
   * Block's simple face draws ONE label-less dot standing for the whole
   * wall (donor `layoutBlock.ts:1301-1330`, `label: null` at `:1305`), and a
   * `+N more` chip there would be a different idiom entirely.
   *
   * WHY a second seam rather than finally letting `renderItem` through in
   * `SlotBody`'s collapsed branch: that refusal is still right, and for the
   * stated reason — `renderItem` renders ONE port's real content, and a
   * collapsed slot is not one port. This seam adds the missing case (draw
   * the WHOLE family yourself, handed every member) without renegotiating
   * what `renderItem` means. Omit it and the collapsed idiom is
   * byte-identical to before, which is why no landed story changed.
   */
  renderCollapsed?(members: PortEdgeItem[], ctx: { textLayout: PortTextLayout }): ReactNode;
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
   * F-1 (docs/FEEDBACK-2026-09-17c-PLAN.md, superseding Phase 4's original
   * shape): ARMS click-to-edit on every port on this edge — it no longer
   * shows anything by itself. Zach: "I like the toggle but the actual ports
   * should basically look identical. The only difference is when you click
   * the port to edit it. either only a single line will appear, or the full
   * multi line will appear." With `editing` true, every port's own label
   * becomes clickable; with it false (or unset), ports render exactly as
   * they would with no `editing` prop at all — that identity is F1a's own
   * acceptance test, true regardless of `editMode` below (arming alone still
   * paints nothing). A click opens ONE OF TWO editors, per `editMode`: this
   * port's own single-line `CodeEditor` in place (`editMode: "single"`,
   * F1h), or the rail-wide multi-line lane (`editMode: "multi"`, F1g) — the
   * SAME `PortLaneOverlay` this prop used to open automatically, now opened
   * BY a port click instead of by arming. Never both: single mode never
   * mounts the lane, multi mode never opens a port's own inline editor.
   */
  editing?: boolean;
  onEditingChange?(next: boolean): void;
  /**
   * F-1's third state, from the same sentence: "either only a single line
   * will appear, or the full multi line will appear." Per-edge (like
   * `mode`/`groupMode` — `PortEdge` already takes per-edge config, so this
   * follows the existing shape rather than inventing a global one).
   * `"single"` is the default: a port click opens just that port's own
   * label, which is the common case (rename one port) and what F1a/F1c/F1d
   * already prove. `"multi"` opens the rail-wide lane instead — the same
   * `PortLaneOverlay`/`reconcilePortLane` (`./portLane.ts`) machinery
   * Phase 4 built, letting a pasted multi-line block add/remove/reorder
   * ports in one edit; unchanged, just re-triggered. Falls back to `"single"`
   * behaviour when the lane genuinely cannot open here (`laneAvailability`
   * refuses — collapsed real family, row edge, custom mode) rather than
   * leaving a click that does nothing: a control that silently no-ops on
   * every click is worse than one that does the smaller of the two things it
   * knows how to do (truthful rendering's spirit, PORT-EDGE-PLAN-PHASE4.md
   * §5, applied to a click affordance rather than a disabled button).
   */
  editMode?: "single" | "multi";
  /**
   * Follow-up feedback item 3: the label's syntax parser, e.g. `python()`
   * from `@codemirror/lang-python` (already a dependency — `CodeEditor`
   * itself already exposes this exact prop for its own `PseudoCode` story).
   * Omit for plain text. A story-level toggle, not a PortEdge concern of its
   * own — the edge just forwards whatever `LanguageSupport` it's given
   * straight to each port's own editor (F-1: previously the lane's shared
   * `CodeEditor`; now every port's own, individually, same prop reused
   * rather than invented twice — see `PortEdgeSlotBoxProps.labelLanguage`).
   */
  laneLanguage?: LanguageSupport;
  /**
   * Follow-up feedback items 2/4 (docs/FEEDBACK-2026-09-17c-PLAN.md, Lane
   * E): caps how many slots this edge renders. The REST are cut from the
   * track entirely — not grouped, not collapsed, just gone — and replaced
   * by one "+N more" line after the last visible slot, N the real number
   * of PORTS still hidden (a cut slot's own member count, not 1-per-slot,
   * so a cut through a real group still reports accurately).
   *
   * Deliberately its own seam rather than reusing `renderCollapsed`: that
   * prop is handed ONE collapsed family's members (`groupMode==="collapsed"`
   * folding a caller-named group into a single still-occupied slot);
   * `maxVisible` has no family to hand it — the cut can land anywhere,
   * across however many unrelated slots happen to sit past the cutoff, and
   * those slots stop occupying track space altogether rather than shrinking
   * into one. Read and confirmed before adding this: `renderCollapsed`
   * does not fit the shape of this problem.
   */
  maxVisible?: number;
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

// The skin seam (src/skin/skin.ts + skin.css). Ported from `var(--border)`
// to `--bbox-skin-stroke` — the same token Block's own header/footer
// dividers read — with today's value as the fallback, so a consumer who
// never imports skin.css renders the exact line this replaced.
const EDGE_LINE_COLOR = "var(--bbox-skin-stroke, var(--border))";

function EdgeLineMark({ axis }: { axis: "row" | "column" }) {
  return (
    <div
      data-slot="port-edge-center-line"
      aria-hidden
      style={
        axis === "row"
          ? { position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: EDGE_LINE_COLOR, pointerEvents: "none" }
          : { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: EDGE_LINE_COLOR, pointerEvents: "none" }
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
   *  (`labelSlot !== undefined` -> present-beats-absent, B4/labeledPort.tsx).
   *  No call site sets this anymore (F-1 below removed the only one) — kept
   *  as a live seam, not deleted, since a host's own `renderItem` override
   *  may still want it. */
  hideLabel?: boolean;
  /**
   * F-1 (docs/FEEDBACK-2026-09-17c-PLAN.md: "I like the toggle but the
   * actual ports should basically look identical. The only difference is
   * when you click the port to edit it."): whether THIS port's own built-in
   * label is click-to-edit right now — forwarded straight to `LabeledPort`'s
   * `disabled` (inverted). `PortEdge`'s `editing` prop is what arms it,
   * edge-wide; unset/false leaves every port exactly as it renders with no
   * `editing` prop at all, which is what makes the toggle's resting state
   * byte-identical on or off (F1a) — nothing here changes what paints until
   * a port is actually clicked.
   */
  editingEnabled?: boolean;
  /**
   * F-1: fired with THIS port's own id on every keystroke of its built-in
   * label editor — the per-port equivalent of the old lane-wide
   * `onItemsChange` rewrite, now scoped to one port so editing it can never
   * touch its neighbours (F1c: "other ports' labels are unchanged").
   * Omitted for a synthesized item (the collapsed "+N more" pseudo-port has
   * no real label to rename).
   */
  onLabelWrite?(id: string, value: string): void;
  /**
   * F-1 continuity: `PortEdgeProps.laneLanguage` reaches whichever editor a
   * click actually opens — this port's own `labelLanguage` in `"single"`
   * mode, `PortLaneOverlay`'s `language` in `"multi"` mode (both wired from
   * the same source prop, since only one of the two ever mounts at once).
   */
  labelLanguage?: LanguageSupport;
  /** F-1: `PortEdgeProps.editMode`, threaded down the same way `hideLabel`
   *  already was. */
  editMode?: "single" | "multi";
  /**
   * F-1 `"multi"` mode's click target: fired instead of the port's own
   * `onLabelWrite` path when a port is clicked with `editMode: "multi"` —
   * opens the rail-wide lane (`PortEdgeBody`'s own `laneOpen` state) rather
   * than this one port's inline editor. No id/value payload — unlike
   * `onLabelWrite`, this isn't an edit, it's a request to open a DIFFERENT
   * editor that then owns every port's text itself.
   */
  onRequestLaneOpen?(): void;
  /**
   * 2026-09-17 (Lane I, "what does dnd-kit actually use for a grouped
   * family" — see the report): a real (not collapsed) group's dnd-kit
   * registration is ONE `useSortable({id: slot.slotId})` on the SLOT's own
   * wrapping div (`SortableSlotCard`/`FreeSlotCard` below) — never one per
   * member, measured live via `useDndContext().droppableRects`. Drawing a
   * `showCard` overlay per MEMBER here (the pre-fix behaviour) therefore
   * drew a rectangle dnd-kit never registers — N small boxes with gaps
   * between them, when the thing actually being dragged/collision-tested is
   * ONE rectangle enclosing the whole family. `GroupSlotBody` sets this to
   * suppress the per-member surface and draws that one rectangle itself,
   * sized to its own container (the same box the wrapping div's `getBoundingClientRect()`
   * — and therefore dnd-kit's own measurement — returns).
   */
  hideCardSurface?: boolean;
}

// B3: a slot must occupy its rail position even when nothing renders inside
// it (`showPorts` and `showCard` both off) — a distribution scheme spaces
// BOXES, and a zero-size box breaks the pitch it's supposed to hold.
//
// WHY unconditional now (2026-09-17, docs/FEEDBACK-2026-09-17b-PLAN.md, Lane
// B): this used to be `showCard ? cardMainPx() : EMPTY_SLOT_MIN_PX` — the
// slot literally grew to make room for the card's own border+padding the
// instant `showCard` flipped on, which is the precise mechanism behind "the
// members seem to shrink a bit to fit inside the card" (the port itself
// didn't shrink; the box it shares with every other slot on the edge did,
// dragging the whole edge's pitch with it). The overlay below draws INSIDE
// this same fixed footprint instead of requiring a bigger one.
const EMPTY_SLOT_MIN_PX = 24;
// Chrome DevTools' own element-highlight recipe: translucent fill + a solid
// edge, red because that's what Zach asked for. The skin seam touches only
// SHAPE here (radius, stroke-width) — never colour: this red is a deliberate
// ruling (Zach, 2026-09-17), not a state the skin owns, so it is exempt from
// `--bbox-skin-stroke`/`-surface` the way Badge's tinted variants are exempt
// from `--bbox-skin-line-override`. `rounded-lg`/`border` (Tailwind) below
// is replaced by these two so the fallback literal is provably identical —
// `--radius-lg` IS what `rounded-lg` resolves to, `1px` IS what the bare
// `border` utility sets.
const CARD_OVERLAY_FILL = "rgb(239 68 68 / 0.18)";
const CARD_OVERLAY_BORDER = "rgb(239 68 68 / 0.7)";
const CARD_OVERLAY_RADIUS = "var(--bbox-skin-radius, var(--radius-lg))";
const CARD_OVERLAY_STROKE_WIDTH = "var(--bbox-skin-stroke-width, 1px)";

function PortEdgeSlotBox({ item, edge, showPorts, showCard, slotMainPx, renderItem, textLayoutOverride, hideLabel, hideCardSurface, editingEnabled, onLabelWrite, labelLanguage, editMode = "single", onRequestLaneOpen }: PortEdgeSlotBoxProps) {
  const textLayout = textLayoutOverride ?? inwardTextLayout(edge);
  // F-1: in `"multi"` mode, a click opens the RAIL's lane, not this port's
  // own inline editor — so `LabeledPort` itself must stay `disabled` (its
  // own click-to-edit never engages) and a capture-phase listener on the
  // member box below does the opening instead, before the click can reach
  // anything else. `"single"` mode (the default) is unchanged: `disabled`
  // is simply the inverse of "armed".
  const singleLineEditable = editingEnabled && editMode === "single";
  const port =
    item == null ? null : renderItem ? renderItem(item, { textLayout }) : showPorts ? (
      <LabeledPort
        edge={edge}
        state={item.state ?? "empty"}
        diagnostics={item.diagnostics}
        availability={item.availability}
        diameter="md"
        textLayout={textLayout}
        labelSlot={hideLabel ? null : undefined}
        // F-1: `disabled` is the inverse of "armed for single-line editing"
        // — with no `editing` prop at all (or `editing=false`) this is
        // `disabled`, which is exactly the ordinary, unwired `LabeledPort`
        // default every other story on this file already renders. Armed AND
        // in `"single"` mode, a click opens THIS port's own single-line
        // editor (`labeledPort.tsx`'s `DefaultPortLabel`, F-1's other half,
        // already built) — never a second port's, never a rail-wide
        // overlay. Armed AND in `"multi"` mode, this stays `disabled` too —
        // the capture listener below owns the click instead.
        disabled={!singleLineEditable}
        onLabelWrite={onLabelWrite ? (value) => onLabelWrite(item.id, value) : undefined}
        labelLanguage={labelLanguage}
      >
        {item.label}
      </LabeledPort>
    ) : null;

  const boxStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: slotMainPx,
    height: slotMainPx,
    boxSizing: "border-box",
    flexShrink: 0,
  };

  return (
    <span
      data-slot="port-edge-member"
      style={boxStyle}
      // F-1 `"multi"` mode's click target — capture phase, so it runs
      // BEFORE `LabeledPort`'s own bubble-phase click handler would (moot
      // while `disabled`, but keeps this correct if a future `renderItem`
      // override supplies its own clickable content) and `stopPropagation`
      // keeps one click from also reaching an ancestor's own handlers (the
      // sortable card's drag activation, in particular — a plain click
      // never starts a drag on its own, but there is no reason to let this
      // one bubble further than it needs to).
      onClickCapture={
        item != null && editingEnabled && editMode === "multi" && onRequestLaneOpen
          ? (event) => {
              event.stopPropagation();
              onRequestLaneOpen();
            }
          : undefined
      }
    >
      {port}
      {showCard && !hideCardSurface && (
        // B3: "actually show a card, like a kanban card" — now an overlay,
        // not a wrapper (see EMPTY_SLOT_MIN_PX's own comment): painted OVER
        // the same box `port` already occupies, `absolute inset-0` so it
        // contributes nothing to the box's size, `pointer-events: none` so
        // it can't steal the drag that reorders slots. Renders even with
        // `port` null, so `showCard` alone still reads as a real (if empty)
        // card.
        <div
          aria-hidden
          data-slot="port-edge-card-surface"
          className="pointer-events-none absolute inset-0 border"
          style={{
            borderRadius: CARD_OVERLAY_RADIUS,
            borderWidth: CARD_OVERLAY_STROKE_WIDTH,
            backgroundColor: CARD_OVERLAY_FILL,
            borderColor: CARD_OVERLAY_BORDER,
          }}
        />
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
  /** D-A7 — see `PortEdgeProps.renderCollapsed`. */
  renderCollapsed?: PortEdgeProps["renderCollapsed"];
  textLayoutOverride?: PortTextLayout;
  hideLabel?: boolean;
  /** F-1 — see `PortEdgeSlotBoxProps`'s own doc; threaded through the same
   *  way `hideLabel` already was. */
  editingEnabled?: boolean;
  onLabelWrite?(id: string, value: string): void;
  labelLanguage?: LanguageSupport;
  editMode?: "single" | "multi";
  onRequestLaneOpen?(): void;
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

function GroupSlotBody({ slot, edge, itemsById, showPorts, showCard, axis, slotMainPx, gapPx, color, renderItem, textLayoutOverride, hideLabel, editingEnabled, onLabelWrite, labelLanguage, editMode, onRequestLaneOpen }: SlotRenderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const memberIds = slot.members.map((m) => m.id).join(",");
  const box = useEnclosingCircleBox(containerRef, [memberIds, axis, showPorts, showCard, slotMainPx, gapPx]);
  return (
    <div data-slot="port-edge-group" ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: axis === "row" ? "row" : "column", gap: gapPx }}>
      {box && (
        // The skin seam (src/skin/skin.ts + skin.css) — same recipe
        // Block/Badge/Port already use: the CSS border's COLOUR is state-
        // owned (`color`, the group's own accent, same split as Port's own
        // ring — see traceTerminal.tsx's identical reasoning), so it reads
        // `--bbox-skin-line-override` rather than `--bbox-skin-stroke`;
        // width and radius are the skin's to set outright, same as every
        // other bordered box in this port. `SketchOutline` — a CHILD of
        // this `position: absolute` box, which already establishes the
        // containing block its own `left/top: -borderWidth` positions
        // against, the exact recipe `block.tsx` uses — draws the hand-drawn
        // twin; it renders always and CSS decides which one paints, so
        // there is nothing here that has to know the active skin.
        <div
          data-slot="port-edge-group-outline"
          data-group-id={slot.slotId}
          aria-hidden
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            border: `var(--bbox-skin-stroke-width, 2px) solid var(--bbox-skin-line-override, ${color ?? "var(--border)"})`,
            borderRadius: "var(--bbox-skin-radius, 10px)",
            pointerEvents: "none",
          }}
        >
          <SketchOutline
            width={box.width}
            height={box.height}
            borderWidth={2}
            stroke={color ?? "var(--border)"}
            seed={`port-edge-group:${slot.slotId}`}
          />
        </div>
      )}
      {showCard && (
        // "What does dnd-kit actually use for a grouped family" (Lane I):
        // ONE rectangle, registered by `SortableSlotCard`/`FreeSlotCard`'s
        // own `useSortable({id: slot.slotId})` on the div that wraps THIS
        // component whole — measured live via `useDndContext().droppableRects`
        // (see the report), not the N per-member boxes the pre-fix overlay
        // drew. `inset-0` of THIS `position:relative` container is exactly
        // that wrapping div's own box (no padding/border sits between them),
        // so the drawn rectangle and the one dnd-kit registers are the same
        // rectangle by construction, not by coincidence — unlike the
        // `port-edge-group-outline` above (deliberately padded around the
        // dots for legibility), this one must NOT add `GROUP_OUTLINE_PAD` or
        // it would stop matching what dnd-kit measures.
        <div
          aria-hidden
          data-slot="port-edge-card-surface"
          className="pointer-events-none absolute inset-0 border"
          style={{
            borderRadius: CARD_OVERLAY_RADIUS,
            borderWidth: CARD_OVERLAY_STROKE_WIDTH,
            backgroundColor: CARD_OVERLAY_FILL,
            borderColor: CARD_OVERLAY_BORDER,
          }}
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
          editingEnabled={editingEnabled}
          onLabelWrite={onLabelWrite}
          labelLanguage={labelLanguage}
          editMode={editMode}
          onRequestLaneOpen={onRequestLaneOpen}
          hideCardSurface
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
    // D-A7: the whole family, in the order it renders — what
    // `renderCollapsed` is handed, and the reason it is a different seam
    // from `renderItem` (which only ever sees one port).
    const members = slot.members
      .map((m) => itemsById.get(m.id))
      .filter((it): it is PortEdgeItem => it != null);
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
        //
        // D-A7: `props.renderCollapsed` IS consulted, because it is given
        // the whole family instead. Absent, the `+N more` chip above stands
        // unchanged — this branch is byte-identical without the prop.
        renderItem={props.renderCollapsed ? (_item, ctx) => props.renderCollapsed?.(members, ctx) : undefined}
        textLayoutOverride={props.textLayoutOverride}
        hideLabel={props.hideLabel}
        // F-1: deliberately NOT forwarding `editingEnabled`/`onLabelWrite`
        // here — `collapsedItem` is a synthesized "+N more" pseudo-port with
        // no real label of its own; wiring a write handler to it would let a
        // click rename the SUMMARY text and silently corrupt whichever real
        // member happens to share `collapsedItem.id` (it doesn't — the id is
        // the slot's, not any member's — so today it would just write into a
        // dangling id instead). Collapsed stays view-only, same as before.
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
      editingEnabled={props.editingEnabled}
      onLabelWrite={props.onLabelWrite}
      labelLanguage={props.labelLanguage}
      editMode={props.editMode}
      onRequestLaneOpen={props.onRequestLaneOpen}
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
/* useMoreIndicatorPosition — maxVisible's own "+N more" line. Measures    */
/* the real DOM rather than re-deriving flex math (D8's own "measure,      */
/* don't assume" — `useEnclosingCircleBox`/`useLaneGeometry` already do    */
/* exactly this), so it stays correct across every Distribution/axis       */
/* combination without a second formula to keep in sync with               */
/* `mainAxisPositions`/`distributionStyle`.                                 */
/*                                                                          */
/* WHY a HOOK called from `PortEdgeBody` itself, not a separate child      */
/* component reading `trackRef` (`PortLaneOverlay`'s own shape, which this */
/* first mirrored): a callback ref's attachment and a DESCENDANT's own     */
/* `useLayoutEffect` commit in the same pass, children-before-parent — so  */
/* a child sitting UNDER the ref-owning div can observe `trackRef.current` */
/* as still `null` on the very render it and the div both first mount      */
/* (measured live: logged `null` every time `maxVisible` was already set   */
/* on first render, since nothing then makes the effect ever re-fire with  */
/* the ref populated). `PortLaneOverlay` never hits this in practice only  */
/* because `editing` starts `false` — it always mounts on a LATER render,  */
/* by which point the div's ref is already attached from a prior commit.   */
/* `maxVisible` has no such gate (it can be true from the first paint), so */
/* it needs the ordering that's actually guaranteed: a hook called INSIDE  */
/* the same component that owns the ref (`PortEdgeBody`, exactly           */
/* `useEnclosingCircleBox`'s own shape in `GroupSlotBody`) sits ABOVE the  */
/* div in the fiber tree, so its layout effect always commits AFTER the    */
/* div's — the ref is guaranteed attached by then, mount or update alike.  */
/* ------------------------------------------------------------------ */

const MORE_INDICATOR_GAP_PX = 6;

function useMoreIndicatorPosition(trackRef: RefObject<HTMLDivElement | null>, axis: "row" | "column", hiddenCount: number) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (hiddenCount <= 0) {
      setPos(null);
      return;
    }
    const track = trackRef.current;
    if (!track) {
      setPos(null);
      return;
    }
    const measure = () => {
      const members = Array.from(track.querySelectorAll<HTMLElement>('[data-slot="port-edge-member"]'));
      const last = members[members.length - 1];
      if (!last) {
        setPos(null);
        return;
      }
      const trackRect = track.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      setPos(
        axis === "column"
          ? { left: lastRect.left - trackRect.left, top: lastRect.bottom - trackRect.top + MORE_INDICATOR_GAP_PX }
          : { left: lastRect.right - trackRect.left + MORE_INDICATOR_GAP_PX, top: lastRect.top - trackRect.top + lastRect.height / 2 },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef, axis, hiddenCount]);
  return pos;
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
  renderCollapsed,
  textLayout,
  editing = false,
  onEditingChange,
  editMode = "single",
  laneLanguage,
  maxVisible,
}: PortEdgeProps) {
  const containerId = id ?? edge;
  const axis = AXIS_FOR_EDGE[edge];
  const resolvedSize = size ?? DEFAULT_SIZE[axis];
  const strategy: SortingStrategy = axis === "row" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  const itemIds = items.map((i) => i.id);
  const itemsById = new Map(items.map((i) => [i.id, i] as const));
  const { set: groupingSet, unknownIds } = groupingSetFromText(groups, itemIds);
  const allSlots = computeSlots(itemIds, groupingSet, groupMode);
  const colorMap = buildColorMap(itemIds, groupingSet);

  // `maxVisible` cuts SLOTS (the rendered boxes), not raw items — a cut
  // through a real (not collapsed) group hides every member of whichever
  // slot falls past the cutoff, and `hiddenPortCount` sums those members'
  // real count rather than counting 1 per cut slot, so the "+N more" text
  // stays a true port count even when the cut lands inside a group.
  const slots = maxVisible != null ? allSlots.slice(0, maxVisible) : allSlots;
  const hiddenSlots = maxVisible != null ? allSlots.slice(maxVisible) : [];
  const hiddenPortCount = hiddenSlots.reduce((n, s) => n + s.members.length, 0);

  // Still what a HOST's own toggle button should read for its
  // disabled/reason state (both `PortEdge.stories.tsx` and
  // `BlockPortLane.stories.tsx` already do) — the multi-line lane's own
  // preconditions (column edge, auto mode, no collapsed real family) are
  // real and unchanged. Per-port SINGLE-line click-to-edit
  // (`editingEnabled` below) has none of the lane's geometry requirements,
  // so it stays armed on every axis/mode/groupMode regardless of `lane`.
  const lane = laneAvailability(axis, mode, groupMode, slots);
  // F-1: `editing` ARMS click-to-edit — see `PortEdgeProps.editing`'s own
  // doc. `editMode` picks WHICH editor a click opens; resolved here rather
  // than at each leaf so every slot renderer downstream can stay ignorant
  // of `laneAvailability` entirely. `"multi"` degrades to `"single"` when
  // the lane genuinely cannot open (see `PortEdgeProps.editMode`'s own doc
  // for why a graceful fallback beats a click that does nothing) — this is
  // the ONE place that decision is made, so a caller who asks for `"multi"`
  // on, say, a row edge gets ordinary single-port editing everywhere
  // instead of each slot separately reinventing the same fallback.
  const editingEnabled = editing;
  const resolvedEditMode: "single" | "multi" = editMode === "multi" && lane.available ? "multi" : "single";
  // F-1: the rail-wide lane's own open/closed state — local, because
  // opening it is now a CONSEQUENCE of a port click (`onRequestLaneOpen`
  // below), not a direct reflection of `editing` the way it was before this
  // redesign (that was the bug: arming and showing were the same bit).
  const [laneOpen, setLaneOpen] = useState(false);
  // Mirrors the old D12/A12 safety net, now scoped to `laneOpen` instead of
  // `editing` itself: if the rail stops being armed, or the lane's own
  // preconditions lapse mid-edit (a live groupMode/mode change), or the
  // caller drops back to `"single"`, close the lane rather than leave it
  // mounted and mismatched. Content-lossless for the same reason as before
  // — every keystroke already wrote through `onItemsChange`.
  useEffect(() => {
    if (laneOpen && (!editingEnabled || resolvedEditMode !== "multi")) setLaneOpen(false);
  }, [laneOpen, editingEnabled, resolvedEditMode]);
  const handlePortLabelWrite = (id: string, value: string) => {
    onItemsChange?.(items.map((it) => (it.id === id ? { ...it, label: value } : it)));
  };
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
  // WHY the gap's "count" is the PORT count of the RENDERED slots, not
  // `slots.length` (every rendered DOM box): under a `distribute` scheme,
  // grouping merges N ports into 1 box, so `slots.length` SHRINKS — feeding
  // that shrunk count into the space-between/evenly/around division changes
  // how much free space each remaining gap absorbs, which would make a
  // grouped edge's pitch drift from its OWN ungrouped pitch (A5's actual
  // requirement is "equals the ungrouped pitch for the same items", not
  // merely "uniform"). The total content size (`portCount * slotMainPx`) and
  // the total number of gaps a fully-ungrouped edge would have
  // (`portCount - 1`) are both invariant to how those ports happen to be
  // visually clustered — solving the self-consistency equation (internal
  // group gap == the gap flexbox computes BETWEEN the fewer top-level boxes
  // it actually sees) confirms this is the fixed point: using the PORT count
  // here makes the internal group gap and the real inter-box gap land on the
  // exact same number, by construction, not by coincidence.
  //
  // `maxVisible` (follow-up feedback item 2/4): the count is scoped to the
  // VISIBLE slots' own members, not `items.length` — a cut edge's pitch is
  // computed for what's actually on the track, the same way it would be if
  // the caller had simply passed fewer `items` to begin with.
  // Fixed regardless of `showCard` — see EMPTY_SLOT_MIN_PX's own comment;
  // the card overlay draws inside this footprint, it never grows it.
  const slotMainPx = EMPTY_SLOT_MIN_PX;
  const contentMainPx = (axis === "row" ? resolvedSize.width : resolvedSize.height) - 2 * CONTAINER_BORDER - 2 * CONTAINER_PADDING;
  const visiblePortCount = slots.reduce((n, s) => n + s.members.length, 0);
  const gapPx = mode === "auto" ? interSlotGapPx(distribution, contentMainPx, visiblePortCount, slotMainPx) : DEFAULT_ALIGN_GAP;

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

  // See `useMoreIndicatorPosition`'s own doc for why this is called HERE
  // (inside PortEdgeBody, the component that owns `trackRef`) rather than
  // inside a separate child component.
  const moreIndicatorPos = useMoreIndicatorPosition(trackRef, axis, hiddenPortCount);

  const trackStyle: CSSProperties = {
    boxSizing: "border-box",
    width: resolvedSize.width,
    height: resolvedSize.height,
    position: "relative",
    display: "flex",
    flexDirection: axis === "row" ? "row" : "column",
    alignItems: "center",
    padding: CONTAINER_PADDING,
    // The skin seam — `showContainer`'s dashed dev outline reads
    // `--bbox-skin-stroke` (the same token Block's own border reads) with
    // today's `var(--border)` as its fallback; `radius: 6` -> the token,
    // same fallback literal. The `showContainer=false` branch stays
    // `solid transparent` untouched — a transparent border needs no skin,
    // it is already invisible in every one.
    border: `${CONTAINER_BORDER}px ${showContainer ? "dashed var(--bbox-skin-stroke, var(--border))" : "solid transparent"}`,
    borderRadius: "var(--bbox-skin-radius, 6px)",
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
        // D13, restored: starting a drag CLOSES the lane rather than
        // disabling the sortable — `useSortable({disabled:true})` still
        // spreads `attributes` (role/tabIndex) and never reaches Custom
        // mode's `useDraggable` at all, so it doesn't actually stop a drag;
        // a capture-phase pointerdown on any card does, unconditionally,
        // and makes the exclusivity legible instead of emergent (see the
        // codeEditor's OWN capture listener, which this mirrors). Gated on
        // `laneOpen` alone now, not `editing` — a per-port single-line edit
        // has nothing shared to protect, only the rail-wide document does.
        onPointerDownCapture={
          laneOpen
            ? (event) => {
                if (event.target instanceof Element && event.target.closest('[data-slot="port-edge-card"]')) {
                  setLaneOpen(false);
                }
              }
            : undefined
        }
      >
        {showCenterLine ? <EdgeLineMark axis={axis} /> : null}
        {laneOpen && (
          <PortLaneOverlay trackRef={trackRef} visualOrder={visualOrder} onItemsChange={onItemsChange} onClose={() => setLaneOpen(false)} language={laneLanguage} />
        )}
        {hiddenPortCount > 0 && moreIndicatorPos && (
          <span
            data-slot="port-edge-more"
            style={{
              position: "absolute",
              left: moreIndicatorPos.left,
              top: moreIndicatorPos.top,
              transform: axis === "row" ? "translateY(-50%)" : undefined,
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--muted-foreground)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            +{hiddenPortCount} more
          </span>
        )}
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
                renderCollapsed={renderCollapsed}
                textLayoutOverride={resolvedTextLayout}
                editingEnabled={editingEnabled}
                onLabelWrite={handlePortLabelWrite}
                labelLanguage={laneLanguage}
                editMode={resolvedEditMode}
                onRequestLaneOpen={() => setLaneOpen(true)}
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
                renderCollapsed={renderCollapsed}
                textLayoutOverride={resolvedTextLayout}
                editingEnabled={editingEnabled}
                onLabelWrite={handlePortLabelWrite}
                labelLanguage={laneLanguage}
                editMode={resolvedEditMode}
                onRequestLaneOpen={() => setLaneOpen(true)}
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
