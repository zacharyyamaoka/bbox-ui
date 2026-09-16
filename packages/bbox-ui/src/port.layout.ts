/**
 * packages/bbox-ui/src/port.layout.ts
 *
 * Port's own portable geometry and vocabulary — split out of the frozen
 * `layout.ts` (docs/T1-SPEC.md §0) because Port's whole geometry was
 * rebuilt against `PORT-SPEC.md`'s measured-from-the-real-app constants,
 * and `layout.ts` cannot be touched mid-T1. Carries forward, verified-
 * correct-and-unchanged, everything `layout.ts` currently has under its
 * "Port anchors on a block boundary" and "Port placement" headings
 * (`portAnchor`, `portDotPlacement`, `PORT_DOT_CENTER_TRANSFORM`,
 * `portLabelPlacement`, `PortDotBox`, `portLabelOut`, `inwardTextLayout`,
 * `portSideForDirection` — PORT-SPEC.md §4 confirms these against the
 * running app, unchanged), beside the rebuilt Port-state geometry below.
 *
 * `BLOCK_BORDER_PX` is RE-DECLARED here (not imported) because the
 * placement math needs it and `layout.ts` is frozen for the whole of T1
 * (docs/T1-SPEC.md §0) — the one deliberate constant duplication besides
 * the size-rung ones that section already calls out. `SIMPLE_BLOCK` (the
 * default anchor rectangle) is still IMPORTED from `./layout` — it is
 * Block's own fact, not Port-shaped, and stays alive there untouched.
 */
import type { CSSProperties } from "react";
import { SIMPLE_BLOCK } from "./layout";

/* ------------------------------------------------------------------ */
/* Port dot — geometry re-measured against the real SystemSketch app   */
/* (PORT-SPEC.md §1.1), replacing layout.ts's old wireframe-only        */
/* numbers. See docs/T1-SPEC.md §4.7 and PORT-SPEC.md §5.               */
/* ------------------------------------------------------------------ */

export const PORT_DIAMETERS = { sm: 8, md: 12, lg: 18 } as const;
export type PortSize = keyof typeof PORT_DIAMETERS | number; // number = "Exact"

export const PORT_DIAMETER_LABELS: Record<keyof typeof PORT_DIAMETERS, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
};

export const PORT_SURFACE_RING_PX = 2;
export const PORT_STATE_RING_PX = 3;
// WHY: the rings are box-shadow, painted OUTSIDE the dot's layout box (the
// donor's ring is a border INSIDE its box, so its numbers never needed this
// compensation) — any spacing measured from the box edge must add this or
// the ring eats it, which is why the donor's 8px gap reads as 8px of air on
// our dots but only 3px.
export const PORT_RING_OVERHANG_PX = PORT_SURFACE_RING_PX + PORT_STATE_RING_PX;
export const PORT_HIT_PX = 40;

export const PORT_ROW_PITCH_PX = 44;
export const PORT_HEADER_PITCH_PX = 20;
export const PORT_LABEL_INSET_PX = 12;
export const PORT_LABEL_HEIGHT_PX = 24;

export function portRowCentre(
  slot: number,
  opts: { headerPx: number; gapPx: number; pitchPx: number } = {
    headerPx: 48,
    gapPx: 8,
    pitchPx: PORT_ROW_PITCH_PX,
  },
): number {
  return opts.headerPx + opts.gapPx + opts.pitchPx * slot + opts.pitchPx / 2;
}

/**
 * WIDENED 2026-09-12 (the two-slot proposal): PORT-SPEC.md §3f narrowed this
 * from T0's 6-way enum down to 4 because "the real app has no horizontal
 * offset label, only a vertical lift" — true of the SystemSketch board this
 * package was built against, but Zach's own two-slot diagram for the
 * GENERIC `Port` component (this package, not that board) names "Right
 * Offset"/"Left Offset" as two of the label slot's six real positions
 * (alongside `secondarySlotLayout`'s own, independently-offset four-way
 * axis below). Re-adding them here rather than inventing a parallel
 * `LabelSlotLayout` type: every host adapter already imports this exact
 * type name as an opaque prop (`PortTextLayout`, no exhaustive switch of
 * its own — confirmed by recon before this change), so widening the one
 * shared type costs two new cases in this file's own switches instead of
 * a second, easy-to-confuse-with-the-first enum a caller could reach for
 * by mistake.
 */
export type PortTextLayout = "top" | "bot" | "right" | "left" | "rightOffset" | "leftOffset";

export const PORT_TEXT_LAYOUTS: PortTextLayout[] = [
  "top",
  "bot",
  "right",
  "left",
  "rightOffset",
  "leftOffset",
];

export const PORT_TEXT_LAYOUT_LABELS: Record<PortTextLayout, string> = {
  top: "Top",
  bot: "Bot",
  right: "Right",
  left: "Left",
  rightOffset: "Right Offset",
  leftOffset: "Left Offset",
};

export const PORT_LABEL_GAP = 8;

/**
 * The flex direction for a resolved ORIGIN.
 *
 * REPLACES `portFlexDirection`, which took a legacy `PortTextLayout` and
 * was deleted with this change: once the row follows the resolved origin
 * there is nothing left for a layout-keyed twin to answer, and keeping an
 * unused second spelling of one fact is how the two paths drifted apart
 * in the first place (same standard `portBadgeSide`/`portCueSide` were
 * removed under).
 *
 * Without this the Expert `labelOrigin` control was inert in the flex
 * path: the row's direction came from the `textLayout` PRESET, so setting
 * origin `left` while the preset said `right` put the label on the right
 * in the DOM renderer and on the left in an anchored host — the same port
 * drawn two ways, which is exactly what one shared model is for
 * (adversarial judge, 2026-09-15).
 */
export function originFlexDirection(
  origin: SlotOrigin,
): "row" | "row-reverse" | "column" | "column-reverse" {
  switch (origin) {
    case "top":
      return "column-reverse"; // label above the dot
    case "bottom":
      return "column";
    case "right":
      return "row";
    case "left":
      return "row-reverse";
  }
}


/** True for the two label positions that LIFT the label clear of the
 * trace wire (`portLabelLift` below). Kept as a named predicate rather
 * than an inline `=== "rightOffset" || === "leftOffset"` because three
 * separate geometry paths (the CSS placement, the measured box, and
 * `Port`'s own flex row) each have to ask the same question and must
 * never drift apart on the answer. */
export function isOffsetTextLayout(layout: PortTextLayout): boolean {
  return layout === "rightOffset" || layout === "leftOffset";
}

/**
 * How far an "Offset" label's BOTTOM edge sits ABOVE the dot's vertical
 * centre. Zero for every other layout.
 *
 * WHY the offset is a Y LIFT and not extra X distance (Zach, 2026-09-15,
 * correcting the first implementation — "they should be offset up in the
 * y direction right now you are offseting in the x direction"): a trace
 * wire leaves the dot horizontally, along the dot's own centre line, so
 * a plain `right` label has the wire running straight THROUGH it. Pushing
 * the label further right does nothing about that — the wire just travels
 * further before hitting it. Lifting the label above the centre line is
 * what actually clears the wire, which is the entire reason the position
 * exists. That is also why the lift is measured from the centre (where
 * the wire is) rather than from the label's plain resting place.
 *
 * Scales with the dot: clearing the PAINTED ring (`PORT_RING_OVERHANG_PX`,
 * box-shadow drawn outside the layout box) by `PORT_LABEL_GAP` keeps an
 * `xl` port reading the same as an `sm` one, where a fixed lift would have
 * the biggest dot's ring crowding the label.
 *
 * `overridePx` is the author's own tuned distance (Port's `labelOffset`
 * field, Expert tier — Zach, 2026-09-15: "expose the offset distance as a
 * parameter you can tune"). It replaces the computed lift outright rather
 * than adding to it, so the number in the panel IS the number of pixels
 * between the wire and the label's bottom edge — a delta would make the
 * control's value unreadable off the screen. It is ignored for a
 * non-offset layout: there is no lift there to tune, and silently lifting
 * a plain `right` label because a stale field value survived a layout
 * change is exactly the kind of ghost this codebase keeps designing out.
 */
export function portLabelLift(
  layout: PortTextLayout,
  dot: PortDotBox,
  overridePx?: number,
): number {
  if (!isOffsetTextLayout(layout)) return 0;
  if (typeof overridePx === "number" && Number.isFinite(overridePx)) return overridePx;
  return defaultPortLabelLift(dot);
}

/** The lift an Offset label takes when nobody has tuned `labelOffset` —
 *  exported so the panel can SHOW that computed number as the field's
 *  real resolved value (`portResolutionSubject`, port.tsx) instead of the
 *  static `defaultValue` its FieldSpec is forced to declare. */
export function defaultPortLabelLift(dot: PortDotBox): number {
  return dot.h / 2 + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
}

export type PortDirection = "input" | "output";
export const PORT_DIRECTIONS: PortDirection[] = ["input", "output"];
export const PORT_DIRECTION_LABELS: Record<PortDirection, string> = {
  input: "Input",
  output: "Output",
};

export type BlockSide = "left" | "right" | "top" | "bottom";
export const BLOCK_SIDES: BlockSide[] = ["left", "right", "top", "bottom"];
export const BLOCK_SIDE_LABELS: Record<BlockSide, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
  bottom: "Bottom",
};

/**
 * Which container side a port lands on when only its direction is known:
 * inputs enter on the left, outputs leave on the right.
 *
 * WHY a total lookup and not a ternary: `PortDirection` has exactly two
 * members today, so the ternary produces the right output right now — but
 * a ternary has no way to fail if a third direction is ever added, and it
 * would silently fall through to "right" instead of failing to compile.
 * `port.tsx` and `stack.tsx` already made this call for their own unions;
 * this was the last ternary/`===` chain in the file consuming a closed
 * union without one.
 */
const SIDE_FOR_DIRECTION: Record<PortDirection, BlockSide> = {
  input: "left",
  output: "right",
};

export function portSideForDirection(direction: PortDirection): BlockSide {
  return SIDE_FOR_DIRECTION[direction];
}

/**
 * Which way the label flows from the dot by default: inward, into the
 * block's interior, away from whatever the port connects to outside.
 */
export function inwardTextLayout(side: BlockSide): PortTextLayout {
  switch (side) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bot";
    case "bottom":
      return "top";
  }
}

/** Port's own 18px "small" text rung — deliberately NOT a shared
 * TEXT_SIZES edit, see T1-SPEC.md §0 (three components each get their own
 * 18px rung, in their own file, rather than merging into one). */
export const PORT_TEXT_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type PortTextSize = keyof typeof PORT_TEXT_SIZES;
export const PORT_TEXT_SIZE_LABELS: Record<PortTextSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};

/**
 * The unified size rung a header (Bar/Flex) hands down to its Ports
 * (Zach, 2026-09-11: "one size rung, the same four names on every leaf").
 * One cascading field instead of `diameter`/`textSize` drifting apart —
 * see `port.presets.ts`, whose `PORT_PRESETS` governs both from this rung.
 * Deliberately its own type, not `PortSize`/`PortTextSize`: those are each
 * a single leaf's OWN ladder (and `PortSize` also accepts a bare `number`,
 * the "Exact" branch), while `PortSizeRung` is the closed four-name
 * vocabulary shared with `FlexSize`/`BarSize`.
 */
export const PORT_SIZE_RUNGS = ["sm", "md", "lg", "xl"] as const;
export type PortSizeRung = (typeof PORT_SIZE_RUNGS)[number];
export const PORT_SIZE_RUNG_LABELS: Record<PortSizeRung, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};

/**
 * The interaction axis's visibility policy (PORT-SPEC.md §1.3.2):
 * `"onHover"` replaces the donor's `subtle` (opacity, not colour, so it
 * has no place on the state/colour axis). Host-computed, never persisted
 * — see `port.fields.ts`'s `reveal` field.
 */
export const PORT_REVEALS = ["always", "onHover"] as const;
export type PortReveal = (typeof PORT_REVEALS)[number];
export const PORT_REVEAL_LABELS: Record<PortReveal, string> = {
  always: "Always",
  onHover: "On Hover",
};

// `PortRole`/`PortDecoration` (and `PORT_ROLES`/`PORT_ROLE_LABELS`/
// `PORT_DECORATIONS`/`PORT_DECORATION_LABELS`) REMOVED 2026-09-12, per
// Zach's ruling on the port-props proposal (D4): these are Python-specific
// annotations (a `configuration`/`control`/`error` port role, a
// `mutates`/`variadic-*` collar) that belong to whichever app has that
// domain knowledge — SystemSketch, not this generic design system — never
// to base `Port`'s own panel. Confirmed dead weight before removal: no
// host adapter (React Flow, tldraw) ever set or read either prop, and
// neither is part of any persisted shape (`git log`/recon, 2026-09-12). A
// consuming app that wants them back composes its own ring/cue as a thin
// wrapper OVER `PortDot`/`Port` (an absolutely-positioned sibling span,
// the same technique `PortDecorationRing`/`PortRoleCue` used internally)
// rather than reaching for a prop this package no longer carries.

/**
 * `PortDot`'s SECOND independently-positioned slot (the two-slot proposal,
 * 2026-09-12): generic content hugging a corner of the dot, closer in than
 * the label slot's own "Offset" positions — Zach's diagram names these
 * "Secondary Slot Placement", all four already offset variants (there is
 * no plain, flush-against-the-dot member on this axis the way the label
 * slot has `top`/`bot`/`right`/`left`). Spelled with its own vocabulary,
 * not a subset of `PortTextLayout` reused wholesale — that type's members
 * name where the LABEL flows (mirrored input/output content, wide gap);
 * this one names which CORNER of the dot's own box a small cue hugs
 * (content-agnostic, tight gap) — conflating the two would let a caller
 * pass a bare `"left"` here and land on the wrong geometry entirely.
 *
 * REPLACES `portBadgeSide`/`portCueSide` (both removed here): those
 * computed one FIXED axis opposite the label, assuming the only content
 * this slot would ever hold was the producer-count badge. Now that
 * `PortDot`'s secondary slot is genuinely generic (`PortDotProps.secondarySlot`,
 * any `ReactNode` — port.tsx), the "opposite the label" rule survives only
 * as `defaultSecondarySlotLayout`'s AUTO default below; an explicit
 * `secondarySlotLayout` always wins.
 */
export type SecondarySlotLayout = "leftOffset" | "rightOffset" | "topOffset" | "botOffset";

export const SECONDARY_SLOT_LAYOUTS: SecondarySlotLayout[] = [
  "leftOffset",
  "rightOffset",
  "topOffset",
  "botOffset",
];

export const SECONDARY_SLOT_LAYOUT_LABELS: Record<SecondarySlotLayout, string> = {
  leftOffset: "Left Offset",
  rightOffset: "Right Offset",
  topOffset: "Top Offset",
  botOffset: "Bot Offset",
};

/** How tightly the secondary slot hugs the dot's own box — deliberately
 * SMALLER than `PORT_LABEL_GAP` (the diagram's own visual distinction: a
 * "small badge/cue hugging a corner", not content sitting flush beside the
 * dot). Equal to the old hardcoded `PortCountBadge` overlay's own gap
 * (`port.tsx`, pre-two-slot) — carried forward, not re-guessed. */
export const PORT_SECONDARY_SLOT_GAP_PX = 6;

/**
 * The secondary slot's AUTO default position, given wherever the label is
 * actually flowing — the same "opposite the label" rule `portBadgeSide`
 * used to compute (2026-09-12 port-props D5's fix for "the badge sat on
 * top of a left-flowing label"), generalized from one fixed axis to the
 * secondary slot's own independent, always-offset vocabulary. Only
 * consulted when a caller omits `secondarySlotLayout` outright — an
 * explicit value always wins (`PortDot`, port.tsx).
 */
export function defaultSecondarySlotLayout(labelLayout: PortTextLayout): SecondarySlotLayout {
  switch (labelLayout) {
    case "left":
    case "leftOffset":
      return "rightOffset";
    case "right":
    case "rightOffset":
      return "leftOffset";
    case "top":
      return "botOffset";
    case "bot":
      return "topOffset";
  }
}

/* ------------------------------------------------------------------ */
/* Port anchors on a block boundary — carried forward verbatim         */
/* from layout.ts (PORT-SPEC.md §4, verified against the running app)  */
/* ------------------------------------------------------------------ */

/**
 * Stroke width of the Block container border. Re-declared here (not
 * imported) because the placement math needs it and `layout.ts` is
 * frozen for the whole of T1 — see this file's own header.
 *
 * INTEGRATION: kept file-local (not exported) — `layout.ts` also exports
 * a `BLOCK_BORDER_PX` (frozen, §0's "keeps exactly what it exports"
 * list), and re-exporting both of equal name through the barrel
 * (`packages/bbox-ui/src/index.ts`) is an ambiguous `export *` collision
 * TypeScript refuses to resolve. Nothing outside this file imports this
 * copy (verified: only `layout.ts`'s is imported elsewhere), so dropping
 * `export` here is the whole fix — nothing else needs to change.
 */
const BLOCK_BORDER_PX = 2;

/**
 * Point on the boundary of a `width × height` rectangle where a port dot
 * centers. `t` runs 0→1 along the side (top→bottom for left/right,
 * left→right for top/bottom). Hosts translate this into their own space:
 * tldraw positions absolutely from shape props, React Flow feeds it to a
 * Handle's `top`/`left` percentage.
 */
export function portAnchor(
  side: BlockSide,
  t: number,
  width: number = SIMPLE_BLOCK.width,
  height: number = SIMPLE_BLOCK.height,
): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: 0, y: t * height };
    case "right":
      return { x: width, y: t * height };
    case "top":
      return { x: t * width, y: 0 };
    case "bottom":
      return { x: t * width, y: height };
  }
}

/** Pair with `portDotPlacement` to centre the dot's box on the anchor. */
export const PORT_DOT_CENTER_TRANSFORM = "translate(-50%, -50%)";

/**
 * CSS `left`/`top` (px) that centre a port dot ON the container boundary —
 * half in, half out. For an absolutely positioned element inside `Block`,
 * whose containing box is the Block's *padding* box (inset `BLOCK_BORDER_PX`
 * from the outer boundary `portAnchor` speaks in — compensated here, once).
 * Combine with `PORT_DOT_CENTER_TRANSFORM`.
 */
export function portDotPlacement(
  side: BlockSide,
  t: number,
  width: number = SIMPLE_BLOCK.width,
  height: number = SIMPLE_BLOCK.height,
): { left: number; top: number } {
  const anchor = portAnchor(side, t, width, height);
  return { left: anchor.x - BLOCK_BORDER_PX, top: anchor.y - BLOCK_BORDER_PX };
}

/**
 * CSS offsets for a label absolutely positioned inside the dot's box.
 * Plain data — spreads into any host's style object.
 *
 * WHY it extends CSSProperties rather than standing alone: a newer @types/react
 * gave `CSSProperties` a `--${string}` index signature (CSS custom properties),
 * and TS refuses to assign a same-shaped but nominally distinct interface into
 * an indexed type — every host that passed this straight into a `style` prop
 * failed to typecheck with no change of its own.
 */
export interface PortLabelPlacement extends CSSProperties {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  transform: string;
}

/**
 * A port dot's box, named so it cannot be mistaken for anything else.
 *
 * WHY an object and not two positional numbers: `portLabelPlacement` once
 * took `(layout, diameterPx, boxInsetPx)` — when the resized-dot fix needed
 * the height too, reusing the third positional slot would have silently
 * re-read every existing caller's inset as a height (a 21px label move with
 * no compile error). A named box makes a stale numeric call fail to
 * typecheck instead of quietly moving labels.
 */
export interface PortDotBox {
  w: number;
  h: number;
}

/**
 * How far the label's near edge sits from the dot box's near edge, measured
 * from the box's origin-side edge along the label's own axis: the dot's span
 * ALONG THAT AXIS plus the gap — `w` for left/right labels, `h` for top/bot.
 * The label's near edge clears the RING's outer edge by the gap, not the
 * box's — so the ring's painted overhang goes in before the gap.
 */
export function portLabelOut(layout: PortTextLayout, dot: PortDotBox): number {
  const alongAxis = layout === "top" || layout === "bot" ? dot.h : dot.w;
  return alongAxis + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
}

/**
 * Where the label sits relative to the dot: its near edge lands
 * `PORT_LABEL_GAP` px clear of the dot's outer edge — the same geometry
 * the core `Port`'s flex row produces, so a host-positioned label and a
 * flex-flowed one agree to the pixel.
 *
 * An "Offset" layout keeps that same along-axis distance and instead
 * LIFTS the label clear of the trace wire — see `portLabelLift`'s own WHY.
 * It anchors by the label's BOTTOM edge (`bottom`, no `translateY`), where
 * the plain layouts anchor by their centre, because "clear of the wire" is
 * a statement about the bottom edge and must not drift with the label's
 * own height.
 *
 * WHY `calc(50% + Npx)` and not a plain px `bottom`: 50% of the
 * positioning context is the dot's own centre line REGARDLESS of
 * `boxInsetPx` (the inset is symmetric), so the one expression is correct
 * for React Flow's inset Handle and tldraw's flush wrapper alike. A px
 * value measured from the container's bottom edge would need the inset
 * subtracted and would silently be wrong for whichever host was not the
 * one it was written against.
 *
 * `boxInsetPx` is how far the positioning context is inset from the dot's
 * border box: React Flow's `Handle` IS the bordered dot, so its padding box
 * sits `PORT_SURFACE_RING_PX + PORT_STATE_RING_PX` inside; tldraw's
 * unbordered wrapper passes 0.
 */
export function portLabelPlacement(
  layout: PortTextLayout,
  dot: PortDotBox,
  boxInsetPx: number = 0,
): PortLabelPlacement {
  const preset = TEXT_LAYOUT_AS_PLACEMENT[layout];
  return slotPlacementStyle(
    { origin: preset.origin, align: preset.align, offsetX: 0, offsetY: preset.offsetY },
    dot,
    PORT_LABEL_GAP,
    boxInsetPx,
  );
}

/* ------------------------------------------------------------------ */
/* THE UNIFIED SLOT PLACEMENT MODEL (2026-09-15)                       */
/* ------------------------------------------------------------------ */

/**
 * Which side of the dot a slot anchors to — the ORIGIN. Four values,
 * shared by BOTH slots.
 *
 * Zach, 2026-09-15: "Its just Top, bottom, right, left. thoose basically
 * set the origins. and then sepertly we can always control a x and y
 * offset. seems simpler and more general… Ok yes I think I would now
 * consider like top/left/right/etc for both secondary and primary thoose
 * are just presets!"
 *
 * WHY this replaces two separate enums: `PortTextLayout` and
 * `SecondarySlotLayout` both spell `rightOffset`, mean different things,
 * and carry different gaps (8px vs 6px) — a caller could pass one where
 * the other was wanted and land on plausible-but-wrong geometry with no
 * type error, because they are both just strings at the persistence
 * boundary. One origin type for both slots deletes that whole class.
 *
 * The named placements that used to be enum members are now PRESETS over
 * (origin, offsetX, offsetY) — "Right" is `{right, 0, 0}` and the old
 * "Right Offset" is `{right, 0, -lift}`. That also makes NEGATIVE offsets
 * fall out for free, which the enum could never express.
 */
export type SlotOrigin = "top" | "bottom" | "left" | "right";

export const SLOT_ORIGINS: SlotOrigin[] = ["top", "bottom", "left", "right"];

export const SLOT_ORIGIN_LABELS: Record<SlotOrigin, string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

/** Where a slot sits: an origin on the dot, plus a free displacement.
 *  `offsetX` is +right, `offsetY` is +DOWN (screen convention), so a
 *  label lifted clear of a trace wire carries a NEGATIVE `offsetY`. */
/**
 * WHICH PART OF THE SLOT is the reference point — the slot's own anchor,
 * on the axis the origin leaves free.
 *
 * Zach, 2026-09-15: "we need to be able to align to the slot left edge,
 * middle or right edge. and then we position that… We defintily don't
 * want to kinda be dynamically calculating the x/y offset if the slot
 * length changes right. so its important we can basically use a different
 * part of the slot as the reference edge."
 *
 * That is the fix for a real defect, not a convenience. With the anchor
 * fixed at the CENTRE, "the label's bottom edge clears the trace wire"
 * could only be expressed as an offset DERIVED from the content's own
 * height — and the component cannot know that height: measured live, a
 * label was 26.2px where the `textSize * 1.25` formula said 23, because
 * the `CodeField` inside it adds line-height 1.4, 4px padding and 1px
 * borders, and it changes again for any other slot content. Making the
 * reference edge selectable turns that guarantee into pure CSS —
 * `translate(…, -100%)` puts the bottom edge ON the line whatever the
 * height is — so the offset beside it can be a static number that never
 * needs recomputing when the slot grows.
 *
 * Named on the CROSS axis, since the origin already pins the other one: a
 * `left`/`right` origin leaves the vertical free (start = top edge,
 * end = bottom edge), a `top`/`bottom` origin the horizontal (start =
 * left edge, end = right edge).
 */
export type SlotAlign = "start" | "center" | "end";

export const SLOT_ALIGNS: SlotAlign[] = ["start", "center", "end"];

/** Per-axis labels, because "Start" alone does not say which edge it is —
 *  the control should read "Top" on a side origin and "Left" on a
 *  top/bottom one. Keyed by whether the FREE axis is vertical. */
export const SLOT_ALIGN_LABELS: Record<"vertical" | "horizontal", Record<SlotAlign, string>> = {
  vertical: { start: "Top", center: "Middle", end: "Bottom" },
  horizontal: { start: "Left", center: "Middle", end: "Right" },
};

/** True when the origin leaves the VERTICAL axis free to align on. */
export function originFreeAxisIsVertical(origin: SlotOrigin): boolean {
  return origin === "left" || origin === "right";
}

/** The CSS translate percentage that puts the chosen edge on the
 *  reference line. Height/width independent by construction — that is the
 *  entire point. */
const ALIGN_SHIFT: Record<SlotAlign, string> = {
  start: "0%",
  center: "-50%",
  end: "-100%",
};

export interface SlotPlacement {
  origin: SlotOrigin;
  /** Which part of the slot lands on the origin's line. Defaults to
   *  `center` everywhere it is omitted, which is the historic behaviour. */
  align: SlotAlign;
  offsetX: number;
  offsetY: number;
}

/**
 * THE ONE ANCHOR RULE, stated once so every path can agree on it: the
 * slot's content anchors by the edge FACING its origin, centred on the
 * other axis, sitting `gap` clear of the dot's PAINTED ring. `offsetX`/
 * `offsetY` then translate it from there.
 *
 * - origin "right"  → content's LEFT edge at the ring, vertically centred
 * - origin "left"   → content's RIGHT edge at the ring, vertically centred
 * - origin "top"    → content's BOTTOM edge at the ring, horizontally centred
 * - origin "bottom" → content's TOP edge at the ring, horizontally centred
 *
 * WHY one fixed rule and no "when offsetY ≠ 0 anchor the bottom instead"
 * mode: a hidden anchor switch is exactly the kind of thing that reads
 * fine in the one case it was written for and silently does the wrong
 * thing in the next. The cost is that a lift computed for one label
 * height is only tight for that height — which is why the lifted default
 * is RESOLVED from the live text size rather than frozen into a preset
 * literal (see `defaultLiftOffsetY`).
 */
export function slotPlacementStyle(
  placement: SlotPlacement,
  dot: PortDotBox,
  gapPx: number,
  boxInsetPx: number = 0,
): PortLabelPlacement {
  const { origin, align, offsetX, offsetY } = placement;
  // The chosen edge, as a percentage of the slot's OWN size — so it stays
  // correct when the slot grows, with no recomputation anywhere.
  const shift = ALIGN_SHIFT[align];
  const outX = `${dot.w + PORT_RING_OVERHANG_PX + gapPx - boxInsetPx}px`;
  const outY = `${dot.h + PORT_RING_OVERHANG_PX + gapPx - boxInsetPx}px`;
  // Both offsets ride in the TRANSFORM rather than the edge properties, so
  // the cross-axis `-50%` centring and the displacement compose without
  // either needing to know the content's own size — and a percentage and
  // a px value never have to be added by hand.
  switch (origin) {
    // WHY every origin uses the SAME unmirrored signs even though `left`
    // anchors by `right:` and `top` by `bottom:` — both of which grow
    // toward the origin: a transform is applied in SCREEN space, not in
    // the anchor's direction, so `translate(5px)` moves right on all four.
    // An earlier version mirrored the sign so `+x` would mean "away from
    // the dot", which reads well until you notice the control reverses
    // itself depending on the origin, and contradicts this very type's
    // "+x right, +y DOWN" contract. Screen space is what every design tool
    // means by an x/y offset, and it is the one convention that does not
    // change meaning halfway down the origin list.
    case "right":
      return { left: outX, top: "50%", transform: `translate(${offsetX}px, calc(${shift} + ${offsetY}px))` };
    case "left":
      return { right: outX, top: "50%", transform: `translate(${offsetX}px, calc(${shift} + ${offsetY}px))` };
    case "top":
      return { bottom: outY, left: "50%", transform: `translate(calc(${shift} + ${offsetX}px), ${offsetY}px)` };
    case "bottom":
      return { top: outY, left: "50%", transform: `translate(calc(${shift} + ${offsetX}px), ${offsetY}px)` };
  }
}



/**
 * The old six-member `PortTextLayout` as (origin, offsetY) — the
 * compatibility read for everything already persisted.
 *
 * `PortTextLayout`'s literals are written into saved tldraw shapes
 * (`T.literalEnum` in both shape utils), so a board saved before this
 * change still hands them back. This is the one place that translation
 * lives; nothing downstream needs to know the old vocabulary existed.
 * `liftedLabel` marks the two members whose `offsetY` must be RESOLVED
 * from the live text size rather than taken as 0.
 */
export const TEXT_LAYOUT_AS_PLACEMENT: Record<
  PortTextLayout,
  { origin: SlotOrigin; align: SlotAlign; offsetY: number }
> = {
  top: { origin: "top", align: "center", offsetY: 0 },
  bot: { origin: "bottom", align: "center", offsetY: 0 },
  right: { origin: "right", align: "center", offsetY: 0 },
  left: { origin: "left", align: "center", offsetY: 0 },
  // The two lifted members are now a STATIC placement: anchor the slot's
  // BOTTOM edge (`align: "end"`) on the dot's centre line, then push it up
  // by one gap. Height-independent by construction, where the previous
  // form had to derive the lift from the label's own height — a number the
  // component cannot actually know (Zach, 2026-09-15: "We defintily don't
  // want to kinda be dynamically calculating the x/y offset if the slot
  // length changes right").
  rightOffset: { origin: "right", align: "end", offsetY: -PORT_LABEL_GAP },
  leftOffset: { origin: "left", align: "end", offsetY: -PORT_LABEL_GAP },
};

/** The same compatibility read for the secondary slot's own four-member
 *  enum — every member is a corner hug, so none is "lifted". */
export const SECONDARY_LAYOUT_AS_ORIGIN: Record<SecondarySlotLayout, SlotOrigin> = {
  leftOffset: "left",
  rightOffset: "right",
  topOffset: "top",
  botOffset: "bottom",
};
