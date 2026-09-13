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

/** Narrowed from layout.ts's old 6-way enum — the real app has no
 * horizontal "offset" label, only a vertical lift; see PORT-SPEC.md §3f. */
export type PortTextLayout = "top" | "bot" | "right" | "left";

export const PORT_TEXT_LAYOUTS: PortTextLayout[] = ["top", "bot", "right", "left"];

export const PORT_TEXT_LAYOUT_LABELS: Record<PortTextLayout, string> = {
  top: "Top",
  bot: "Bot",
  right: "Right",
  left: "Left",
};

export const PORT_LABEL_GAP = 8;

export function portFlexDirection(
  layout: PortTextLayout,
): "row" | "row-reverse" | "column" | "column-reverse" {
  switch (layout) {
    case "top":
      return "column-reverse"; // label above the dot
    case "bot":
      return "column";
    case "right":
      return "row";
    case "left":
      return "row-reverse";
  }
}

export function portLabelGap(_layout: PortTextLayout): number {
  return PORT_LABEL_GAP;
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
 * Where the count badge (`Port`'s own `PortCountBadge`) lands relative to
 * the dot, given the label's own flow direction — the fix for "the badge
 * sat on top of a left-flowing label" (2026-09-12 port-props proposal,
 * D5): the badge used to carry a FIXED offset (assuming the label always
 * flows right), so a `textLayout` other than the default silently
 * overlapped it with the label text. Anchoring on the side OPPOSITE
 * whichever way the label is actually flowing keeps it clear in every
 * `textLayout`, not just the default one.
 */
export function portBadgeSide(layout: PortTextLayout): PortTextLayout {
  switch (layout) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bot";
    case "bot":
      return "top";
  }
}

/**
 * The free axis for a small overlay that isn't the count badge — e.g. a
 * consuming app's own semantic-role cue, composed on top of `PortDot` the
 * way `port.layout.ts`'s own module doc (D4) describes. Not used inside
 * this package (the base `PortDot` paints only the badge), exported so a
 * consumer doesn't have to re-derive "which side is free" by hand: the
 * vertical rung is free when the label flows horizontally, the horizontal
 * rung when the label itself flows top/bot.
 */
export function portCueSide(layout: PortTextLayout): "top" | "right" {
  return layout === "top" || layout === "bot" ? "right" : "top";
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
 */
export interface PortLabelPlacement {
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
 */
export function portLabelOut(layout: PortTextLayout, dot: PortDotBox): number {
  const alongAxis = layout === "top" || layout === "bot" ? dot.h : dot.w;
  return alongAxis + portLabelGap(layout);
}

/**
 * Where the label sits relative to the dot: its near edge lands
 * `portLabelGap(layout)` px clear of the dot's outer edge — the same
 * geometry the core `Port`'s flex row produces, so a host-positioned label
 * and a flex-flowed one agree to the pixel.
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
  const out = `${portLabelOut(layout, dot) - boxInsetPx}px`;
  switch (layout) {
    case "right":
      return { left: out, top: "50%", transform: "translateY(-50%)" };
    case "left":
      return { right: out, top: "50%", transform: "translateY(-50%)" };
    case "top":
      return { bottom: out, left: "50%", transform: "translateX(-50%)" };
    case "bot":
      return { top: out, left: "50%", transform: "translateX(-50%)" };
  }
}
