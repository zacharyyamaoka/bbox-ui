// src/chrome/cornerClusterForm.ts — the bottom-right cluster's PURE geometry:
// where it sits (`placeCornerCluster`), the patch that covers the licence
// watermark when the forced-corner opt-in is on (`watermarkCoverRect`), and
// which FORM the cluster takes (`cornerClusterForm`: one row, or stacked).
//
// The first two moved out of `overlay.tsx` verbatim, so the node `unit`
// project can load them: this file imports no tldraw and no React.
// `overlay.tsx` re-exports everything that used to live there, because
// `corner.smoke.test.tsx` imports `placeCornerCluster` and `watermarkCoverRect`
// from `./chrome/overlay`.

/** Both edges, and the same 8px the chrome bar keeps from the opposite
 *  (top-left) corner, so the two clusters frame the board symmetrically. */
export const CORNER_INSET = 8;

/** Viewport px, `getBoundingClientRect` shape. */
export interface CornerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CornerPlacementKind = "corner" | "beside-licence" | "above-licence" | "above-dock";

/** Offsets from the container's right and bottom edges, and which rule won. */
export interface CornerPlacement {
  right: number;
  bottom: number;
  placement: CornerPlacementKind;
}

function overlaps(a: CornerRect, b: CornerRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Where the bottom-right cluster goes: the first of these that covers
 * neither tldraw's licence watermark nor any obstacle (the dock) —
 *
 *   1. `corner`         — flush, `CORNER_INSET` from both edges;
 *   2. `beside-licence` — the bottom edge, immediately LEFT of the watermark;
 *   3. `above-licence`  — flush right, immediately ABOVE the watermark — and
 *                         above the dock too, if the row is wide enough to
 *                         reach it (`above-dock` when no watermark exists
 *                         and only the dock is in the way). The last resort,
 *                         so it is built to clear everything beneath it.
 *
 * WHY this order, Zach 2026-09-19 (Pasted image 20260919134814.png): "please
 * move the right corner menu to be truly in the right corner right now its
 * above this text 'get a license for production'". 1 is what he asked for
 * and what a licensed build gets. When the watermark owns the corner, 2 keeps
 * the cluster on the corner's own bottom edge instead of parked above the
 * text — the placement he rejected — and 3 is only the narrow-window
 * fallback.
 *
 * WHY the watermark is a hard wall and never something to paint over: it is
 * tldraw's licence notice, and tldraw's own stylesheet binds users to keep it
 * "visible, unobscured, and available to user-interaction" (@tldraw/editor
 * Watermark.mjs:123-129). It sits at `--tl-layer-watermark: 248`, BELOW this
 * slot's 250 (editor.css:45-46), so nothing in tldraw stops chrome here from
 * covering it — the archive's bottom-right strip did exactly that, sitting on
 * the watermark's own 4px anchor one layer above it. Covering is removing.
 *
 * WHY 3 lifts over the dock rather than falling back to 2: a trial merge with
 * main at 52506fa, whose temporary variant pill rides in this same row
 * (482px wide), measured the first version of this rule at 1024px: nothing
 * fitted, so it fell back to "beside" and laid the row straight across the
 * dock. A cluster in the air is a cosmetic cost; one on top of the tools is
 * a broken toolbar.
 */
export function placeCornerCluster({
  container,
  cluster,
  watermark,
  obstacles,
}: {
  container: CornerRect;
  cluster: { width: number; height: number };
  watermark: CornerRect | null;
  obstacles: readonly CornerRect[];
}): CornerPlacement {
  const candidates: CornerPlacement[] = [{ right: CORNER_INSET, bottom: CORNER_INSET, placement: "corner" }];
  if (watermark) {
    candidates.push({ right: container.right - watermark.left + CORNER_INSET, bottom: CORNER_INSET, placement: "beside-licence" });
  }
  // 3: flush right, lifted clear of whatever sits under that flush-right span.
  const spanLeft = container.right - CORNER_INSET - cluster.width;
  const spanRight = container.right - CORNER_INSET;
  const beneath = [...(watermark ? [watermark] : []), ...obstacles].filter((rect) => rect.left < spanRight && spanLeft < rect.right);
  if (beneath.length > 0) {
    candidates.push({
      right: CORNER_INSET,
      bottom: container.bottom - Math.min(...beneath.map((rect) => rect.top)) + CORNER_INSET,
      placement: watermark && beneath.includes(watermark) ? "above-licence" : "above-dock",
    });
  }
  const candidateRect = (candidate: CornerPlacement): CornerRect => {
    const right = container.right - candidate.right;
    const bottom = container.bottom - candidate.bottom;
    return { left: right - cluster.width, top: bottom - cluster.height, right, bottom };
  };
  const blockers = watermark ? [watermark, ...obstacles] : obstacles;
  const fits = candidates.find((candidate) => !blockers.some((rect) => overlaps(candidateRect(candidate), rect)));
  // Always found: if nothing lies beneath the flush-right span the corner
  // itself is clear, and if something does, 3 is lifted above all of it. The
  // fallback only satisfies the type checker.
  return fits ?? candidates[candidates.length - 1];
}

/**
 * The forced-corner opt-in's own finishing touch (Zach, 2026-09-22, after
 * seeing it running: "there is this little piece of the letter showing, can
 * you please... cover that"). `useCornerPlacement` gets the CLUSTER's own
 * placement by calling `placeCornerCluster` with NO watermark, so it always
 * lands at the plain `CORNER_INSET` (8px) — but tldraw sits its own
 * watermark closer to the true corner than that (measured ~4px at 1400x900
 * desktop), so the cluster's flush-8px box does not fully contain the
 * watermark's, and a sliver of its right/bottom edge — the tail of a letter
 * — pokes out past the cluster.
 *
 * The first fix here shrank the CLUSTER's own offset to hug the watermark
 * (`Math.min` against `CORNER_INSET`), and Zach caught the real cost of
 * that: it broke the 8px inset every other piece of chrome in this app
 * shares (the top-left bar keeps the same `CORNER_INSET`), so the corner
 * cluster alone sat 4px closer to the edge than its mirror — "I don't like
 * how that made the spacing [no longer] align with the other toolbars." His
 * own fix is this function: decouple the two concerns entirely. The cluster
 * keeps the SAME flush `CORNER_INSET` position it would use if there were no
 * watermark at all — reliable, and consistent with the rest of the chrome —
 * and a separate, purely cosmetic patch (`SystemSketchChrome` below) is
 * painted over wherever the watermark actually measures, independent of
 * where the cluster itself sits. The two no longer have to agree on a
 * position for either to work.
 *
 * This is pure geometry, not layout policy — `MARGIN` pads a couple of
 * pixels past the watermark's own measured edges so a sub-pixel rounding
 * difference between `getBoundingClientRect` calls can never leave a
 * hairline gap. Returns container-relative CSS offsets (the same `right`/
 * `bottom` convention `CornerPlacement` already uses), not viewport
 * coordinates, so the result drops straight into inline `style`.
 */
export interface WatermarkCoverRect {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const WATERMARK_COVER_MARGIN = 2;

export function watermarkCoverRect(container: CornerRect, watermark: CornerRect): WatermarkCoverRect {
  return {
    right: Math.max(0, container.right - watermark.right - WATERMARK_COVER_MARGIN),
    bottom: Math.max(0, container.bottom - watermark.bottom - WATERMARK_COVER_MARGIN),
    width: watermark.right - watermark.left + WATERMARK_COVER_MARGIN * 2,
    height: watermark.bottom - watermark.top + WATERMARK_COVER_MARGIN * 2,
  };
}


/** The cluster's two forms. `row` is the single row the strip has always been;
 *  `stacked` is the same strip in two rows (see `statusStrip.tsx`). */
export type CornerClusterForm = "row" | "stacked";

/**
 * Which form the cluster should take: `"stacked"` exactly when the single ROW
 * could not sit anywhere but lifted over something other than the watermark —
 * over the dock (`above-dock`), or over the dock AND the watermark
 * (`above-licence` reaching higher than the watermark's own top).
 *
 * WHY the cluster changes FORM rather than only place: measured at 720x900 the
 * row is 294.7px wide and the flush-right span it needs (417-712) reaches over
 * the dock (right edge 530.5), so rule 3 of `placeCornerCluster` lifted it
 * above the DOCK's top (840) instead of the watermark's (860) — 28px over the
 * licence text, past the 8px `corner.smoke` allows. No placement alone can
 * pass: the strip's bottom has to sit 8px above the watermark, which is inside
 * the dock's rows, so it must clear the dock SIDEWAYS, and that needs width
 * <= 712 - 530.5 = 181.5px. One row cannot be that narrow; two rows can (159.7px).
 *
 * WHY it stacks instead of dropping cells: Zach asked for grid and help on
 * 2026-09-20 (`statusStrip.tsx` header) and `railClose.smoke.test.tsx` presses
 * Frames and Problems at 720 — all six stay one click at every width. WHY it
 * does not move the dock: it stays where tldraw's own toolbar sits
 * (`Toolbar/dock.tsx`), and a dock that moved off the cluster that measures the
 * dock is a circular measurement. WHY it stacks immediately above the licence
 * (rule 3, `above-licence`): Zach, 2026-09-19, "please move the right corner
 * menu to be truly in the right corner" — `corner.smoke`'s third bullet.
 * Rule 3's lift over the dock stays the last resort for windows too narrow
 * even for the stack (below about 677px, or with the zoom +/- buttons on in
 * the readout). There is no donor: this rule is ours.
 *
 * `row` is the single-row cluster's size — measured while the row is what is
 * rendered, never from the stacked box (which always fits, so deciding from it
 * would flip back to `row` and oscillate).
 */
export function cornerClusterForm({
  container,
  row,
  watermark,
  obstacles,
}: {
  container: CornerRect;
  row: { width: number; height: number };
  watermark: CornerRect | null;
  obstacles: readonly CornerRect[];
}): CornerClusterForm {
  const placed = placeCornerCluster({ container, cluster: row, watermark, obstacles });
  if (placed.placement === "above-dock") return "stacked";
  if (placed.placement === "above-licence" && watermark && placed.bottom > container.bottom - watermark.top + CORNER_INSET) {
    return "stacked";
  }
  return "row";
}
