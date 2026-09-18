import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils";
import { BarSizeProvider } from "./barSize";

/**
 * Bar — a horizontal strip with three slots (left · center · right).
 * Structure is unchanged from the reset: no appearance cascade, no
 * tone/state, just the three slots. What changed in the shadcn/Tailwind
 * migration is HOW it's painted — Tailwind utilities against the shadcn CSS
 * variables in src/globals.css instead of raw `style={{...}}` colors,
 * borrowing the visual vocabulary (not the props) of
 * packages/bbox-ui/src/bar.tsx.
 *
 * WHY the grid template is COMPUTED, not a fixed `1fr auto 1fr` (Zach: "if
 * the center slot is empty or so, then things in the other slots should
 * just continue to expand width wise, and not truncate. Unless you
 * specifically set a width limit"): `1fr auto 1fr` forces the left/right
 * tracks to stay EQUAL width even when one of them (or center) is empty —
 * that symmetry is exactly what real centering needs, but it also means an
 * empty center/right still claims (and wastes) half the bar's width, and a
 * long `left` label truncates against that artificial half-width ceiling
 * with the other half sitting empty. Measured live: a previous lane's own
 * `AllSizes` cascade cluster had already been moved from `left` to `center`
 * and its swatch widened 420→520px specifically to dodge this — a symptom
 * fix, not a cause fix, and reverted below now that the cause is fixed.
 * `barGridTemplateColumns` (below) keeps `1fr auto 1fr`'s symmetric flanks
 * ONLY when `center` actually holds content (centering is structurally
 * impossible without equal flanks, filled or not); otherwise the unused
 * slot's track collapses to `0` and `left`'s own track becomes the single
 * `1fr` that absorbs everything center/right aren't using — so it only
 * truncates once the BAR ITSELF is out of room, never before. A caller that
 * wants a truncation limit narrower than "however wide the bar naturally
 * is" sets one explicitly by wrapping its own content in a `width`-bounded
 * box — see `Bar.stories.tsx`'s `Widths` gallery — rather than `Bar`
 * growing a new prop for it.
 *
 * WHY no `rounded-lg`/`border`/`bg-card` here: a Bar is a layout strip, not
 * a card — the same way `Flex` paints nothing of its own. Zach: "I don't
 * like how the bars have these borders. they should fill the block footer
 * and headers edge to edge... the only lines are the dividers." A Bar
 * filling `Block`'s header/footer must read as flush with it, not as a
 * pill floating inside it — `Block`'s own `border-b`/`border-t` supply the
 * only lines. A standalone Bar story that wants to show the strip's own
 * extent adds a wrapper (e.g. a dashed box) at the STORY level instead.
 *
 * WHY `size` is also published via `BarSizeProvider`: Zach's size-cascade
 * ask — a Bar's contents should size themselves off the Bar's own `size`
 * rather than each getting hand-tuned. See `barSize.tsx` for the mapping
 * from these four rungs onto each consumer's own scale.
 */
function barGridTemplateColumns(hasCenter: boolean, hasRight: boolean): string {
  if (hasCenter) return "1fr auto 1fr";
  if (hasRight) return "1fr 0 auto";
  return "1fr 0 0";
}

export const BAR_SIZES = ["sm", "md", "lg", "xl"] as const;
export type BarSize = (typeof BAR_SIZES)[number];

/** Bar height per rung, px. */
export const BAR_HEIGHT: Record<BarSize, number> = { sm: 28, md: 36, lg: 48, xl: 60 };

export interface BarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  size?: BarSize;
  style?: CSSProperties;
}

// WHY `overflow-clip` + a 4px `overflow-clip-margin` instead of plain
// `overflow-hidden`: a focusable control flush against a cell's edge (a
// left-slot FoldingChevron, a right-slot Toggle/Button) paints its
// focus-visible ring OUTSIDE its own border box — `hidden` clips that ink
// the instant it crosses the cell boundary, which is the actual cause of
// the bug Zach reported ("chevron has a box cut off on its left") and,
// measured live, hits any focusable control sitting flush at a cell edge,
// not just the chevron. `overflow-clip-margin` is the CSS-spec-native fix:
// it only relaxes where PAINT (ink like a box-shadow ring or an outline) is
// allowed to bleed past the clip box, layout overflow — the thing this
// class exists to contain, e.g. EditableText's own `minWidth:0`/ellipsis
// truncation still clips flush at (edge + 4px). 4px covers both the
// shadcn ring-3 box-shadow (3px spread, 0 offset) and the browser's native
// default outline that a bare-button control like FoldingChevron falls
// back to. Only takes effect on `overflow: clip` (not `hidden`), which is
// otherwise behaviourally identical for this cell's purposes — no scroll
// either way.
const cellClass = "flex min-w-0 items-center overflow-clip [overflow-clip-margin:4px]";

export function Bar({ left, center, right, size = "md", style }: BarProps) {
  return (
    <BarSizeProvider size={size}>
      <div
        data-slot="bar"
        data-size={size}
        // WHY `group`: a plain Tailwind marker class, paints nothing on its
        // own — it exists so a `FoldingChevron reveal="hover"` inside this
        // Bar can key its `group-hover`/`group-focus-within` reveal off the
        // Bar itself ("the surrounding region... the Bar/header it lives
        // in", not the 24px button). Harmless for every Bar that has no
        // such child.
        className={cn("group grid w-full items-center gap-2 px-3 text-sm text-card-foreground")}
        style={{
          gridTemplateColumns: barGridTemplateColumns(center !== undefined, right !== undefined),
          height: BAR_HEIGHT[size],
          ...style,
        }}
      >
        <div data-slot="bar-left" className={cn(cellClass, "justify-start")}>
          {left}
        </div>
        <div data-slot="bar-center" className={cn(cellClass, "justify-center")}>
          {center}
        </div>
        <div data-slot="bar-right" className={cn(cellClass, "justify-end")}>
          {right}
        </div>
      </div>
    </BarSizeProvider>
  );
}
