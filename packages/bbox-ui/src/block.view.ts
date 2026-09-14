/**
 * packages/bbox-ui/src/block.view.ts
 *
 * Block's three views (Simple / Port / Expanded), as pure data — no React,
 * no DOM, same discipline as `layout.ts`/`port.layout.ts`. `block.fields.ts`
 * turns `BLOCK_VIEWS` into a real `FieldSpec` (`VIEW_FIELD`) and
 * `block.presets.ts` turns it into `BLOCK_PRESETS`, Block's first real
 * `PresetSpec` family (P2 "views are presets",
 * reports/view-switching-proposals-2026-09-11.html). This file is only the
 * closed vocabulary and the per-view "remembered box" bookkeeping a host
 * needs when a person resizes one view and then switches to another.
 */
import { SIMPLE_BLOCK } from "./layout";

export const BLOCK_VIEWS = ["simple", "port", "expanded"] as const;
export type BlockView = (typeof BLOCK_VIEWS)[number];
export const BLOCK_VIEW_LABELS: Record<BlockView, string> = {
  simple: "Simple",
  port: "Port",
  expanded: "Expanded",
};

export interface ViewSize {
  w: number;
  h: number;
}

export type BlockViewSizes = Record<BlockView, ViewSize>;

/**
 * The Port/Expanded boxes are derived from the wireframe's own proportions
 * at the 384px Simple width — the 2026-09-11 report's own caveat: these
 * are a starting pin, not a measurement, and want correcting against a
 * real running board later. Simple's box comes from `SIMPLE_BLOCK`
 * (`layout.ts`) rather than a second literal, so the two can never drift.
 */
export const BLOCK_VIEW_DEFAULT_SIZES: BlockViewSizes = {
  simple: { w: SIMPLE_BLOCK.width, h: SIMPLE_BLOCK.height },
  port: { w: 384, h: 346 },
  expanded: { w: 707, h: 452 },
};

/**
 * Parks `current` (the box the view being left is at RIGHT NOW, including
 * any live resize) under `from`'s own slot — immutably — then hands back
 * the box `to` should use, from that updated bag.
 *
 * WHY parked BEFORE the target is restored: ported from SystemSketch's
 * `setBlockViewProps` (src/blocks/blockModel.ts), minus the fold logic
 * this repo has no concept of. Both host adapters must route every view
 * switch through this ONE helper — forget it in one and Expanded opens at
 * whatever Port's box happened to be, instead of its own remembered size.
 */
export function parkViewSize(
  sizes: BlockViewSizes,
  from: BlockView,
  to: BlockView,
  current: ViewSize,
): { sizes: BlockViewSizes; size: ViewSize } {
  const parked: BlockViewSizes = { ...sizes, [from]: current };
  return { sizes: parked, size: parked[to] };
}
