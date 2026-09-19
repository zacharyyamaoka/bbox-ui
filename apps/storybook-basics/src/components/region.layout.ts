// src/components/region.layout.ts — the Region's vertical geometry as a PURE
// function: where the corner block sits, where the free body starts, and
// how arms stack. CONTRACT STUB — docs/CONTROL-FLOW-PLAN.md, lane A.
// Signatures and constants frozen by `region.layout.test.ts`.
//
// PROVENANCE: the stacking rule is SystemSketch's `branchLayout`
// (`/home/bam/systemsketch/src/branch/branchModel.ts:161-230`, read
// 2026-09-18): rows are a running cursor, `bodyTop = rowTop + header`,
// `bodyH = open ? h : 0`, `bottom = bodyTop + bodyH`, next row's top is
// this row's bottom, and the region's height is the cursor plus a bottom
// pad. Ported by VALUE (restated in this repo's names), not by import. The
// one deliberate change: the first row starts under the CORNER BLOCK, not
// under a full-width band — Zach's 2026-09-18 ruling replaced the band with
// a real Block in the frame's top-left corner ("OLD: BAD / NEW: GOOD",
// `Pasted image 20260918150916.png`).
//
// WHY a pure twin exists when the DOM could stack arms with flexbox: the
// component positions arm rows from THIS function (with a measured corner
// height), so a host that needs arm geometry WITHOUT rendering — a drop
// target, an SVG export, stream 2's tldraw shape — reads the same numbers
// the paint used. SystemSketch's own reason (branchModel.ts:14-16): "a
// fold, an added arm and a tldraw resize all agree about where every row
// is."
//
// Pure: no React, no DOM.

/** Donor `BRANCH_ARM_HEADER_HEIGHT` (branchModel.ts:29). */
export const REGION_ARM_HEADER_PX = 32;
/** Donor `BRANCH_DEFAULT_ARM_HEIGHT` (branchModel.ts:31). */
export const REGION_ARM_DEFAULT_BODY_PX = 180;
/** Donor `BRANCH_MIN_ARM_HEIGHT` (branchModel.ts:32). */
export const REGION_ARM_MIN_BODY_PX = 48;
/** Ours: an empty loop/group still shows a body to drop into. */
export const REGION_BODY_MIN_PX = 120;
/** `BLOCK_MEMBER_INSET_PX` (blockMembers.tsx) — the same 12 the members
 *  region already breathes by; the donor's own pad was 10. */
export const REGION_PAD_BOTTOM_PX = 12;
/** Donor `BRANCH_MIN_WIDTH` (branchModel.ts:33). */
export const REGION_MIN_WIDTH_PX = 240;
/** Donor `BRANCH_FADE_OPACITY` (branchModel.ts:38-39): "Non-active arms,
 *  their Blocks and their cables fade to this. One token." */
export const REGION_ARM_FADE_OPACITY = 0.18;
/** The corner block's width in the expanded view — Zach's "NEW GOOD"
 *  sketch draws a compact port-view block (~140px) in the frame's corner,
 *  not a full 320px Block. Height hugs the ports. */
export const REGION_CORNER_WIDTH_PX = 160;
/** The opaque card's width (P5): wider than the corner because it also
 *  carries the promoted boundary ports and a footer. Height hugs. */
export const REGION_CARD_WIDTH_PX = 220;

export interface RegionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionArmInput {
  id: string;
  open: boolean;
  /** Body height while open; remembered while folded. Default
   *  `REGION_ARM_DEFAULT_BODY_PX`; never below `REGION_ARM_MIN_BODY_PX`. */
  bodyHeight?: number;
}

export interface RegionLayoutInput {
  width: number;
  /** Explicit outer height. Omitted = hug: the last row's bottom plus
   *  `REGION_PAD_BOTTOM_PX` (or `corner.h + REGION_BODY_MIN_PX` with no arms).
   *  Given but too small for the arms = the arms win (the donor's
   *  `reconcileBranchProps` rule: `h` is kept in step with the arms). */
  height?: number;
  /** The corner block's measured (or declared) size. */
  corner: { w: number; h: number };
  arms?: readonly RegionArmInput[];
}

export interface RegionArmLayout {
  id: string;
  index: number;
  open: boolean;
  /** The row = header + body. `rowTop` of arm 0 is `corner.h`. */
  rowTop: number;
  headerTop: number;
  bodyTop: number;
  /** 0 while folded. */
  bodyHeight: number;
  bottom: number;
}

export interface RegionLayout {
  width: number;
  height: number;
  /** Always `{x: 0, y: 0, w, h}` — the corner block IS the origin. */
  corner: RegionRect;
  /** The free body under the corner block. With arms present it has zero
   *  height (a branch has no free body; its arms are its body). */
  body: RegionRect;
  arms: RegionArmLayout[];
}

export function regionLayout(input: RegionLayoutInput): RegionLayout {
  const width = Math.max(input.width, REGION_MIN_WIDTH_PX);
  const corner = { x: 0, y: 0, w: input.corner.w, h: input.corner.h };

  // The donor's running cursor (branchModel.ts:161-230), restated: one row
  // is header + body, the body costs nothing while folded, and the next
  // row starts exactly where this one ended. The ONE change from the donor
  // is where the cursor starts — under the CORNER BLOCK, not under a
  // full-width band (Zach's 2026-09-18 "OLD: BAD / NEW: GOOD" ruling).
  let cursor = corner.h;
  const arms: RegionArmLayout[] = (input.arms ?? []).map((arm, index) => {
    const rowTop = cursor;
    const bodyTop = rowTop + REGION_ARM_HEADER_PX;
    // WHY the clamp only applies while OPEN: `bodyHeight` is the height an
    // arm remembers, and a folded arm must remember the number it will
    // re-open at — clamping a folded arm to the minimum would silently
    // rewrite an authored 10 into 48 the moment someone folded it.
    const bodyHeight = arm.open ? Math.max(arm.bodyHeight ?? REGION_ARM_DEFAULT_BODY_PX, REGION_ARM_MIN_BODY_PX) : 0;
    const bottom = bodyTop + bodyHeight;
    cursor = bottom;
    return { id: arm.id, index, open: arm.open, rowTop, headerTop: rowTop, bodyTop, bodyHeight, bottom };
  });

  // Hug: the last row's bottom plus the pad, or — with no arms — enough
  // room for the free body a loop/group drops into. An explicit `height`
  // may only ever make the region TALLER; the donor's own
  // `reconcileBranchProps` keeps `h` in step with the arms for the same
  // reason, and a frame shorter than its own rows would paint arms outside
  // the border they are supposed to live in.
  const hugged = arms.length > 0 ? cursor + REGION_PAD_BOTTOM_PX : corner.h + REGION_BODY_MIN_PX;
  const height = Math.max(input.height ?? 0, hugged);

  return {
    width,
    height,
    corner,
    // A branch has no free body: its arms ARE its body (plan §3.2). Kept as
    // a zero-height rect at the same origin rather than omitted, so a
    // caller reads one shape either way.
    body: { x: 0, y: corner.h, w: width, h: arms.length > 0 ? 0 : height - corner.h },
    arms,
  };
}
