"use client";

// src/components/blockMembers.tsx — Block membership: the members region a
// Block renders between its body and footer. Free vs Stack are two layout
// modes over the SAME member list ("free vs stack is basically the same
// thing, it's all just membership" — Zach), never two features: `free`
// places each member at its own authored (x, y) like a frame's canvas;
// `stack` lays the same list out as an ordered column, drag-reorderable
// like kanban cards.
//
// Ported by value from SystemSketch (read-only donor, never imported):
//   - `BLOCK_MEMBER_INSET_PX` / `BLOCK_MEMBER_GAP_PX` = 12
//     (src/blocks/memberLayout.ts:18) — the gutter/gap defaults.
//   - the layout vocabulary (src/blocks/blockModel.ts): body layouts
//     `free | stack`, member widths `fill | own`, member spacing
//     `inset | edge-to-edge`, inset backgrounds none vs soft gray.
//   - the geometry of `stackMemberPlacements` (memberLayout.ts:60): first
//     slot one gap below the header, members follow in list order, a fill
//     member takes `inner - gutter*2` — restated here as flex column
//     geometry (rowGap + per-slot margins) instead of computed x/y
//     writes, because this app is props-in DOM-out, not a tldraw store.
//   - `blockMemberDropTarget`'s midpoint rule (memberLayout.ts:84) is
//     subsumed by dnd-kit's own `closestCenter` — not re-ported.
//
// WHY spacing and width are PER MEMBER here where the donor kept them
// parent-level: the donor's own `BLOCK_MEMBER_WIDTHS` comment says
// "Parent-level on purpose for V1; a per-member override is the documented
// follow-up" — Zach is now asking for exactly that follow-up ("we want to
// be able to apply these settings on a per member setting"), so the
// per-member move is the deliberate delta from the donor, not a drift.
//
// The dnd machinery mirrors portEdge.tsx (this app's prior art for
// kanban-style reorder): PointerSensor with a 4px activation distance, and
// `neutralizeScale` pinning scaleX/scaleY to 1 — see that file's B1
// comment for why `useDerivedTransform` otherwise stretches non-uniform
// siblings mid-reorder. The whole DndContext only mounts when the caller
// passes `onMembersChange` AND the layout is `stack`: a static gallery
// (or a nested Block inside a sortable member) never grows drag listeners
// it can't honour, which is also what keeps nested membership safe from
// two DndContexts fighting over one pointerdown.
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/* Vocabulary — the donor's enums, restated as string unions.           */
/* ------------------------------------------------------------------ */

export type BlockMembersLayout = "free" | "stack";
/** Per member: inset (a card with breathing room) vs edge-to-edge (full inner width). */
export type BlockMemberInset = "inset" | "edge-to-edge";
/** Per member: take the parent's inner width (Fill) or keep its own (Own). */
export type BlockMemberWidth = "fill" | "own";
/** Block-level surface behind the members — "basically just differentiates it a bit". */
export type BlockInsetBackground = "none" | "soft-gray";

export const BLOCK_MEMBER_INSET_PX = 12;
export const BLOCK_MEMBER_GAP_PX = 12;

export interface BlockMember {
  id: string;
  /** Arbitrary content: another Block, a CodeEditor, text — boxes all the way down. */
  content: ReactNode;
  /** Free-mode position, px, relative to the members region. Ignored by
   *  `stack` — which is what makes a free→stack→free round trip lossless:
   *  stacking never rewrites these. */
  x?: number;
  y?: number;
  /** Per-member spacing. Defaults to `"inset"`. */
  inset?: BlockMemberInset;
  /** Per-member width. Defaults to `"fill"`. */
  width?: BlockMemberWidth;
  /**
   * WHY: rectangles/arrows can be members but make no sense stacked —
   * Zach's ruling is "they should keep their membership but have their
   * visibility turned off". `false` keeps the member in the list (and in
   * any future members panel) while rendering nothing.
   */
  visible?: boolean;
}

export interface BlockMembersProps {
  layout: BlockMembersLayout;
  members: BlockMember[];
  /** Enables drag-to-reorder in `stack` layout. Omit for a static region. */
  onMembersChange?(members: BlockMember[]): void;
  /** Vertical gap between stacked members, and the stack's top/bottom padding. */
  gap: number;
  /** Horizontal inset an `"inset"` member sits in from the Block's inner edge. */
  gutter: number;
  insetBackground: BlockInsetBackground;
  /** Off = member content leaves the DOM entirely (not opacity 0). */
  showMembers: boolean;
  /**
   * WHY overlay, not container (2026-09-17,
   * docs/FEEDBACK-2026-09-17b-PLAN.md, Lane B — "I don't like how when you
   * show the cards it kinda changes the shape of how the members look"):
   * the card is a VIEW of membership that's always true — those cards are
   * always "there" in spirit — so drawing it must never move the thing it
   * describes. On = a translucent red, Chrome-inspector-style outline is
   * painted OVER each member's existing box; it never wraps, pads or
   * insets the content, which is exactly what the old "sits inside a
   * kanban-style card surface" wrapper did wrong.
   */
  showCards: boolean;
}

/* ------------------------------------------------------------------ */
/* Slot geometry                                                       */
/* ------------------------------------------------------------------ */

// A card whose member content is hidden still reads as a card — same as
// portEdge.tsx's empty-card behaviour ("showCard alone still reads as a
// real (if empty) card"), so "hide the members and just focus on the card
// interactions" has cards left to interact with. This is the ONE place the
// overlay is still allowed to affect geometry: with no content there is no
// content box left to preserve, so the SLOT reserves the footprint instead
// (the overlay itself never sizes anything — see `memberSlotChildren`).
export const EMPTY_CARD_MIN_PX = 24;
// Chrome DevTools' own element-highlight recipe: translucent fill + a solid
// edge, red because that's what Zach asked for. Same split as portEdge.tsx's
// identical overlay: the skin seam touches SHAPE only (radius, stroke-width)
// — this red stays exactly this red in every skin, a deliberate ruling, not
// a state the skin owns.
const CARD_OVERLAY_FILL = "rgb(239 68 68 / 0.18)";
const CARD_OVERLAY_BORDER = "rgb(239 68 68 / 0.7)";
const CARD_OVERLAY_RADIUS = "var(--bbox-skin-radius, var(--radius-lg))";
const CARD_OVERLAY_STROKE_WIDTH = "var(--bbox-skin-stroke-width, 1px)";

interface MemberSlotProps {
  member: BlockMember;
  layout: BlockMembersLayout;
  gutter: number;
  showMembers: boolean;
  showCards: boolean;
}

function resolveMemberContent({ member, showMembers }: MemberSlotProps): ReactNode {
  return showMembers ? member.content : null;
}

function slotStyle(props: MemberSlotProps): CSSProperties {
  const { member, layout, gutter, showCards } = props;
  // The one geometry-affecting case: no content box exists to keep
  // identical, so the slot (not the overlay) reserves the footprint.
  const reserveEmptyFootprint = showCards && resolveMemberContent(props) == null;
  if (layout === "free") {
    // The frame inside: authored position, own size — like the canvas
    // outside. `position: absolute` already establishes the containing
    // block the overlay positions against, same as `relative` would.
    return {
      position: "absolute",
      left: member.x ?? 0,
      top: member.y ?? 0,
      width: "max-content",
      ...(reserveEmptyFootprint ? { minHeight: EMPTY_CARD_MIN_PX } : null),
    };
  }
  const inset = (member.inset ?? "inset") === "inset";
  const own = (member.width ?? "fill") === "own";
  return {
    // `position: relative` so the overlay (`absolute inset-0`, added in
    // `memberSlotChildren`) positions against the slot itself.
    position: "relative",
    // WHY block layout, not flex: a block-level child (a Block, a
    // CodeEditor, a plain div) then fills the slot's width naturally,
    // which is what `fill` means; a flex slot would shrink children to
    // max-content and quietly break it.
    marginLeft: inset ? gutter : 0,
    marginRight: inset ? gutter : 0,
    // Own: the slot hugs its content and left-aligns where the donor
    // placed it (x = gutter for inset, 0 for edge-to-edge).
    ...(own ? { alignSelf: "flex-start", width: "max-content" } : null),
    ...(reserveEmptyFootprint ? { minHeight: EMPTY_CARD_MIN_PX } : null),
  };
}

/**
 * Content plus, when `showCards`, a sibling overlay — NEVER a wrapper.
 * `position: absolute inset-0` makes the overlay contribute nothing to the
 * slot's own size, and `pointer-events: none` keeps it out of the way of
 * drag/reorder (B3) — an overlay the pointer could hit would steal the
 * gesture that reorders members.
 */
function memberSlotChildren(props: MemberSlotProps): ReactNode {
  const content = resolveMemberContent(props);
  if (!props.showCards) return content;
  return (
    <>
      {content}
      <div
        aria-hidden
        data-slot="block-member-card"
        className="pointer-events-none absolute inset-0 border"
        style={{
          borderRadius: CARD_OVERLAY_RADIUS,
          borderWidth: CARD_OVERLAY_STROKE_WIDTH,
          backgroundColor: CARD_OVERLAY_FILL,
          borderColor: CARD_OVERLAY_BORDER,
        }}
      />
    </>
  );
}

function memberSlotData(member: BlockMember) {
  return {
    "data-slot": "block-member",
    "data-member-id": member.id,
    "data-member-inset": member.inset ?? "inset",
    "data-member-width": member.width ?? "fill",
  } as const;
}

/**
 * WHY an edge-to-edge member squares ALL FOUR corners of its outermost box
 * (`[&>*]` — the card surface or the bare content, never anything deeper):
 * Zach's ruling — "when block goes edge to edge, its corners should not be
 * radius, so it looks like it's part of the parent block". A rounded corner
 * on a flush member reads as a separate card that happens to touch; square
 * corners merge it into the parent's surface. All four rather than only the
 * flush left/right sides: a stacked member only ever touches the parent's
 * left/right inner edges (the header and the region's own gap padding keep
 * it off the top and bottom), and in the degenerate case where one does
 * reach a real corner, the parent Block's own `overflow-hidden rounded-lg`
 * re-clips it to the parent's radius anyway — so following the parent's
 * radius from the inside would only duplicate what the clip already
 * guarantees. An inset member keeps its radius on purpose: it IS a
 * separate card. Free-mode members are never flush, so nothing applies.
 */
function slotClassName(member: BlockMember, layout: BlockMembersLayout): string | undefined {
  if (layout !== "stack") return undefined;
  return (member.inset ?? "inset") === "edge-to-edge" ? "[&>*]:rounded-none!" : undefined;
}

function StaticMemberSlot(props: MemberSlotProps) {
  return (
    <div
      {...memberSlotData(props.member)}
      className={slotClassName(props.member, props.layout)}
      style={slotStyle(props)}
    >
      {memberSlotChildren(props)}
    </div>
  );
}

/**
 * portEdge.tsx's B1 fix, copied by value: `useSortable`'s transform can
 * carry a scaleX/scaleY "squeeze" from `useDerivedTransform` on any
 * sibling whose rect differs from the dragged one's — members are
 * arbitrary content, so theirs always differ. Pin scale to 1; only ever
 * translate.
 */
function neutralizeScale(transform: Parameters<typeof CSS.Transform.toString>[0]) {
  if (!transform) return transform;
  return { ...transform, scaleX: 1, scaleY: 1 };
}

function SortableMemberSlot(props: MemberSlotProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.member.id });
  const style: CSSProperties = {
    ...slotStyle(props),
    transform: CSS.Transform.toString(neutralizeScale(transform)),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: "grab",
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      {...memberSlotData(props.member)}
      className={slotClassName(props.member, props.layout)}
      data-dragging={isDragging || undefined}
      style={style}
      {...attributes}
      {...listeners}
    >
      {memberSlotChildren(props)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The region                                                          */
/* ------------------------------------------------------------------ */

export function BlockMembers({ layout, members, onMembersChange, gap, gutter, insetBackground, showMembers, showCards }: BlockMembersProps) {
  // Both toggles off: nothing member-related renders at all — the Block
  // itself still stands (its header/body/footer are not this region's).
  if (!showMembers && !showCards) return null;

  const rendered = members.filter((member) => member.visible !== false);
  const sortable = layout === "stack" && onMembersChange !== undefined;

  const regionStyle: CSSProperties =
    layout === "free"
      ? // The frame inside: fills whatever height the Block gives it. A free
        // region needs the Block to carry an explicit height — absolutely
        // positioned members contribute none, same as a canvas.
        { position: "relative", flex: 1, minHeight: 0, alignSelf: "stretch" }
      : // The donor's stack geometry: first member one gap below the header,
        // one uniform gap between members, one gap before whatever follows.
        { display: "flex", flexDirection: "column", rowGap: gap, paddingTop: gap, paddingBottom: gap };

  const region = (
    <div
      data-slot="block-members"
      data-layout={layout}
      data-inset-background={insetBackground}
      className={cn(insetBackground === "soft-gray" && "bg-muted/50")}
      style={regionStyle}
    >
      {rendered.map((member) => {
        const slotProps: MemberSlotProps = { member, layout, gutter, showMembers, showCards };
        return sortable ? <SortableMemberSlot key={member.id} {...slotProps} /> : <StaticMemberSlot key={member.id} {...slotProps} />;
      })}
    </div>
  );

  if (!sortable) return region;
  return (
    <MemberDndBoundary members={members} renderedIds={rendered.map((member) => member.id)} onMembersChange={onMembersChange}>
      {region}
    </MemberDndBoundary>
  );
}

function MemberDndBoundary({
  members,
  renderedIds,
  onMembersChange,
  children,
}: {
  members: BlockMember[];
  renderedIds: string[];
  onMembersChange(members: BlockMember[]): void;
  children: ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || over.id === active.id) return;
    // Indexes resolved against the FULL member list, so a hidden member
    // (visible: false) keeps its membership through a reorder of its
    // visible siblings.
    const from = members.findIndex((member) => member.id === active.id);
    const to = members.findIndex((member) => member.id === over.id);
    if (from === -1 || to === -1) return;
    onMembersChange(arrayMove(members, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={renderedIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
