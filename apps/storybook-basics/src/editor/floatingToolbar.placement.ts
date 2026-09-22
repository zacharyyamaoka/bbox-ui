/**
 * Where the floating toolbar goes, computed by `@floating-ui/core`'s
 * `computePosition` instead of by hand.
 *
 * Ported near-verbatim from
 * /home/bam/systemsketch/src/chrome/floatingToolbarPlacement.ts:1-343 (read in
 * full for this port, including its own test file at
 * floatingToolbarPlacement.test.ts:1-252). That donor module already replaced
 * hand-rolled math with Floating UI middleware per
 * reports/contextual-toolbar-prior-art-2026-09-07.html — policy unchanged and
 * differentially proven against `src/chrome/selectionMenuPlacement.ts` (the
 * frozen oracle copied verbatim into `floatingToolbar.placement.test.ts`,
 * which sweeps a grid of inputs against it and asserts identical output).
 * See docs/menus/MENU-KIT-DESIGN.md §3.2 ("floatingToolbar.placement.ts") and
 * §5 ("Floating-pill placement math") for why this ports unchanged rather
 * than through the compound-vs-registry split the rest of the kit draws.
 *
 * Two names changed crossing into this trunk, and nothing else: the donor's
 * `placeSelectionMenu` -> `placeFloatingToolbar` and `selectionMenuMaxWidth`
 * -> `floatingToolbarMaxWidth`, to match this file's own name and the L3
 * surface it feeds (`floatingToolbar.tsx`). Everything the names still
 * describe stays literally "selection" on purpose — `SelectionMenuSide`, the
 * `SelectionMenuPlacement*` input/result types, the `SELECTION_*`
 * constants — because that is what the math measures (the selection's
 * bounding box), not what it draws.
 *
 * `overlayInset` also lost its default. The donor's 5px was measured against
 * tldraw's own selection handles (see `SELECTION_OVERLAY_INSET` below) — the
 * exact canvas-specific fact a host-agnostic core must not assume on a host's
 * behalf. Every host now states its own (docs/menus/MENU-KIT-DESIGN.md §4:
 * "overlayInset now REQUIRED (its 5px default was measured against tldraw's
 * handles)"). `SELECTION_OVERLAY_INSET` still ships as tldraw's own measured
 * value, for a host that wants it verbatim or as a documented reference point
 * for measuring its own.
 *
 * The function is PURE: rects in, coordinates out. It does no measuring
 * itself — the host measures (ResizeObserver / getBoundingClientRect) and
 * calls this, which is what makes it legal in the core (see CLAUDE.md, "The
 * one rule the design rests on").
 *
 * The FigJam-measured policy this module reproduces has four semantics stock
 * Floating UI middleware (`flip`, `shift`, `autoPlacement`) cannot express on
 * their own, so each one is written here as its own named middleware:
 *
 *   1. `figjamVerticalPlacement` — above -> pinned -> below, in that order:
 *      flip below only when the gap above the overlay is too small, but PIN
 *      at the top margin when the overlay's own top edge is off-screen
 *      (scrolled inside a region taller than the viewport), because falling
 *      through to "below" in that case would clamp the menu against the
 *      bottom obstacle, far from the sliver of selection actually in view.
 *      Stock `flip` only ever swaps between two placements by detecting
 *      clipping-boundary overflow; it has no third "pinned" outcome.
 *   2. Visible-slice centring is folded into the synthetic reference rect
 *      handed to `computePosition` (see below) rather than written as a
 *      middleware, since it only changes *what* the reference measures, not
 *      how placement responds to it — Floating UI's own centring math
 *      (`computeCoordsFromPlacement`) does the rest for free.
 *   3. `clampToViewportMargins` — x clamped into
 *      `[MARGIN, viewport.w - menu.w - MARGIN]`, the min winning when the
 *      range inverts. This is `shift`-shaped but `shift`'s clamp boundary is
 *      the clipping rect, not this fixed margin, and `shift` never lets the
 *      "min wins on inversion" rule apply — it can leave the floating element
 *      hanging past a boundary narrower than itself.
 *   4. `clampToObstacleFloor` — y floored above `bottomObstacleTop` (the
 *      bottom tool belt) via `[MARGIN, floor - MARGIN - menu.h]`. Same shape
 *      as (3) on the other axis; kept separate because it reads a different
 *      obstacle (a host-supplied floor, not the viewport edge).
 *
 * Everything else — the initial "top" placement, the visible-slice centring,
 * and the `offset` gap — is expressed as an ordinary synthetic reference rect
 * plus the stock `offset` middleware, so `computePosition` really is doing
 * the arithmetic, not just being called for form. See the reference/floating
 * rect construction in `placeFloatingToolbar` for how that mapping works.
 */

import { computePosition, offset, type Middleware, type Platform } from "@floating-ui/core";

/** Clearance between the menu and the selection overlay. Measured: 16px. */
export const SELECTION_MENU_GAP = 16;

/**
 * Inset kept clear at the top, left and right edges of the viewport. Measured:
 * 20px. tldraw's own primitive uses 16; FigJam's slightly larger margin is what
 * keeps a clamped menu from touching the floating title and share bars.
 */
export const SELECTION_MENU_MARGIN = 20;

/**
 * How far the selection chrome is drawn outside the shape's bounding box.
 *
 * FigJam reads as 40px above a shape because it draws mid-edge grab dots ~20px
 * outside the box and then leaves the 16px gap above *those*. tldraw draws its
 * handles on the box corners instead, so the equivalent stand-off is just the
 * handle's own half-size: measured at 5px in the running app, where a selected
 * 240x140 rectangle at (700, 380) paints selection blue from (695, 375) to
 * (944, 524). Keeping the gap measured from the overlay is what makes the
 * 16px constant mean the same thing in both apps.
 *
 * No longer a default anywhere in this file (see the module header) — a host
 * that runs on tldraw passes this value verbatim; any other host measures its
 * own equivalent and passes that instead.
 */
export const SELECTION_OVERLAY_INSET = 5;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type SelectionMenuSide = "above" | "below" | "pinned";

export interface SelectionMenuPlacementInput {
  /** The selection's bounding box in viewport space. */
  selection: Rect;
  /** The rendered menu's measured size. Never scaled by the camera. */
  menu: Size;
  /** The editor container's size. */
  viewport: Size;
  /**
   * Top edge of any chrome the menu must stay above, in viewport space —
   * e.g. a host's bottom toolbar. Defaults to the bottom of the viewport.
   */
  bottomObstacleTop?: number;
  /**
   * How far the selection chrome is drawn outside the selection's own
   * bounding box, in viewport pixels. Host-measured, no default — see
   * {@link SELECTION_OVERLAY_INSET} for tldraw's own value and the module
   * header for why this core does not assume it.
   */
  overlayInset: number;
}

export interface SelectionMenuPlacement {
  x: number;
  y: number;
  /** Which side of the selection the menu ended up on, for styling and tests. */
  side: SelectionMenuSide;
}

function clamp(value: number, min: number, max: number): number {
  // A menu wider or taller than its safe area would invert the range; pinning
  // to `min` keeps it on screen instead of flinging it off the far edge.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Whether the selection is close enough to the viewport to be worth annotating.
 *
 * FigJam drops the menu once the selection leaves the screen. Testing for
 * *intersection* rather than for the selection's midpoint — which is what
 * tldraw's primitive (`TldrawUiContextualToolbar`) does — matters here,
 * because an Expanded Block routinely fills the whole viewport with its
 * centre far outside it. This is a pure predicate over the two rects, so it
 * needs no positioning engine at all; it is reproduced verbatim from
 * `selectionMenuPlacement.ts`, which remains its spec.
 */
export function isSelectionOnScreen(selection: Rect, viewport: Size): boolean {
  return (
    selection.x < viewport.w
    && selection.y < viewport.h
    && selection.x + selection.w > 0
    && selection.y + selection.h > 0
  );
}

/**
 * Floor under {@link floatingToolbarMaxWidth} so a tiny viewport still leaves
 * the pill wide enough to read as one control, rather than folding to a
 * sliver.
 */
export const SELECTION_MENU_MIN_WIDTH = 160;

/**
 * The pill's own width budget, in real (unscaled) viewport pixels — mirrors
 * whatever `max-width` the host's own toolbar CSS declares (SystemSketch's
 * was `.systemsketch-selection-menu__bar`), so this stays unit-testable
 * without a DOM, the same reasoning `isSelectionOnScreen` above documents
 * for itself.
 *
 * Codex code review round 1 (2026-09-07, on the donor) caught a selection
 * needing ~935px of controls — three selected shapes with the full
 * appearance + opacity + arrange + align/distribute + wrap cluster all
 * rendering at once — pinned at a fixed `x` in a ~900px-wide viewport with no
 * wrapping or scroll: `clampToViewportMargins` only ever clamps the pill's
 * *position*, never its *size*, so once `menu.w > viewport.w - 2 *
 * SELECTION_MENU_MARGIN` the inverted clamp range pins `x` to
 * `SELECTION_MENU_MARGIN` while the pill keeps its full unclamped width —
 * the rightmost buttons land off-screen.
 *
 * Round 2 caught two problems with that first fix, both now folded into this
 * formula: an `overflow-x: auto` scrollbar made the bar a scroll container,
 * and tldraw's `usePassThroughWheelEvents` refuses to redispatch a wheel
 * through ANY scrollable descendant — canvas panning silently stopped
 * working while hovering an overflowed pill. The donor's CSS wraps instead
 * (no scroll container, so that hook never trips); a host with a similar
 * wheel-redispatch hook needs the same wrap-never-scroll rule (see
 * `controlStrip.tsx`'s own WHY). Separately, the donor's CSS `max-width` sat
 * inside a `scale(--systemsketch-interface-scale)` transform, so a cap
 * written in raw `100vw` re-inflates by the scale factor once painted —
 * correct at the 100% default, wrong at a higher ceiling. Dividing by
 * `scale` before the transform re-multiplies it cancels that out, which is
 * why this function takes `scale` as a parameter instead of assuming 1.
 */
export function floatingToolbarMaxWidth(viewport: Size, scale = 1): number {
  // Codex round 4 (on the donor): the floor has to divide by scale too, not
  // just the viewport term — a floor left in raw local pixels re-inflates by
  // `scale` once the transform paints it (160px floor at 160% scale painted
  // at 256px, not 160px), the exact bug this whole formula exists to prevent
  // for the viewport term. `max(a, b) / s === max(a / s, b / s)` for s > 0,
  // so dividing the whole expression is equivalent to flooring in painted
  // pixels directly.
  return Math.max(SELECTION_MENU_MIN_WIDTH, viewport.w - 2 * SELECTION_MENU_MARGIN) / scale;
}

/**
 * A synthetic Floating UI platform with no DOM behind it.
 *
 * `computePosition` only ever calls `getElementRects` (always) and
 * `isRTL`/`getDimensions`/`getClippingRect` when a middleware asks for them
 * (via `detectOverflow` or directly) — none of the middleware below need
 * those, but they are implemented anyway so a future `arrow` or `size`
 * middleware (mentioned as the intended extension point) composes without
 * having to touch the platform. `reference` and `floating` are plain
 * `{x,y,width,height}` / `{width,height}` descriptors, not DOM nodes.
 */
function makeSyntheticPlatform(viewport: Size): Platform {
  return {
    getElementRects: async ({ reference, floating }) => ({
      reference: reference as { x: number; y: number; width: number; height: number },
      floating: { x: 0, y: 0, ...(floating as { width: number; height: number }) },
    }),
    getDimensions: async (element) => element as { width: number; height: number },
    getClippingRect: async () => ({ x: 0, y: 0, width: viewport.w, height: viewport.h }),
    isRTL: async () => false,
  };
}

/**
 * Decides above / pinned / below, exactly per the FigJam policy.
 *
 * At the point this middleware runs, `state.y` already reflects the "above"
 * placement plus the {@link SELECTION_MENU_GAP} gap (the initial `top`
 * placement from `computeCoordsFromPlacement`, offset by the stock `offset`
 * middleware ordered before this one) — i.e. exactly the oracle's `aboveY`.
 * `state.rects.reference` carries the overlay rect (inset selection) this
 * module constructs, so `reference.y` is `overlayTop` and
 * `reference.y + reference.height` is `overlayBottom`.
 */
function figjamVerticalPlacement(): Middleware {
  return {
    name: "figjamVerticalPlacement",
    async fn(state) {
      const { y, rects } = state;
      const overlayTop = rects.reference.y;
      const overlayBottom = rects.reference.y + rects.reference.height;

      let side: SelectionMenuSide;
      let nextY: number;
      if (y >= SELECTION_MENU_MARGIN) {
        side = "above";
        nextY = y;
      } else if (overlayTop < 0) {
        // The selection's top edge is above the viewport too — we're scrolled
        // inside a region taller than the screen, so there is no "above" to
        // flip to. Pin near the top instead of falling through to "below",
        // which would otherwise clamp the menu down against the bottom
        // obstacle, far from the only part of the selection actually in view.
        side = "pinned";
        nextY = SELECTION_MENU_MARGIN;
      } else {
        side = "below";
        nextY = overlayBottom + SELECTION_MENU_GAP;
      }

      return { y: nextY, data: { side } };
    },
  };
}

/** Clamps x into the viewport's safe area, min winning when it inverts. */
function clampToViewportMargins(viewport: Size, menu: Size): Middleware {
  return {
    name: "clampToViewportMargins",
    async fn(state) {
      return {
        x: clamp(
          state.x,
          SELECTION_MENU_MARGIN,
          viewport.w - menu.w - SELECTION_MENU_MARGIN,
        ),
      };
    },
  };
}

/** Floors y above `bottomObstacleTop` (or the viewport bottom), same shape as above. */
function clampToObstacleFloor(viewport: Size, menu: Size, bottomObstacleTop: number | undefined): Middleware {
  return {
    name: "clampToObstacleFloor",
    async fn(state) {
      const floor = bottomObstacleTop ?? viewport.h;
      return {
        y: clamp(
          state.y,
          SELECTION_MENU_MARGIN,
          floor - SELECTION_MENU_MARGIN - menu.h,
        ),
      };
    },
  };
}

/**
 * Centre on the selection, offset above it, flip below when there is no room,
 * pin to the top margin when even the selection's top edge is off-screen,
 * then clamp into the safe area — in that order.
 *
 * Neither reference implementation covers a selection bigger than the
 * viewport: stock tldraw's `TldrawUiContextualToolbar` (and the rich text
 * toolbar built on top of it — same primitive, no extra logic) clamps on the
 * *full* selection's true centre with no visible-portion centring and no
 * top-pin branch; Excalidraw has no floating selection-following toolbar at
 * all — its Stats panel is CSS-docked (`position: absolute; top: 60px`), not
 * computed from the selection. Both branches below are FigJam's behaviour
 * (Miro's is the same shape), added on top of what neither library does.
 *
 * The engine is `@floating-ui/core`'s `computePosition`; the policy is the
 * host's own, expressed as the middleware above plus the synthetic reference
 * rect built here. `computePosition` resolves in a microtask (no real async
 * work happens — the synthetic platform's methods are `async` only to
 * satisfy Floating UI's `Platform` interface), so callers awaiting this still
 * see it settle before paint.
 */
export async function placeFloatingToolbar({
  selection,
  menu,
  viewport,
  bottomObstacleTop,
  overlayInset,
}: SelectionMenuPlacementInput): Promise<SelectionMenuPlacement> {
  const overlayTop = selection.y - overlayInset;
  const overlayBottom = selection.y + selection.h + overlayInset;

  // A selection wider than the viewport has a true centre that can land
  // anywhere — including nowhere near what the user can actually see.
  // Centring on the visible slice instead is what makes an Expanded Block
  // wider than the screen still get a usefully-placed menu. This is folded
  // into the synthetic reference rect below (zero-width, positioned at the
  // desired centre) rather than into a middleware, since Floating UI's own
  // `top`-placement centring math already does the rest once the reference
  // rect's centre is right.
  const centreX = selection.w > viewport.w
    ? (Math.max(selection.x, 0) + Math.min(selection.x + selection.w, viewport.w)) / 2
    : selection.x + selection.w / 2;

  const reference = {
    x: centreX,
    y: overlayTop,
    width: 0,
    height: overlayBottom - overlayTop,
  };
  const floating = { width: menu.w, height: menu.h };

  const { x, y, middlewareData } = await computePosition(reference, floating, {
    platform: makeSyntheticPlatform(viewport),
    placement: "top",
    middleware: [
      offset({ mainAxis: SELECTION_MENU_GAP }),
      figjamVerticalPlacement(),
      clampToViewportMargins(viewport, menu),
      clampToObstacleFloor(viewport, menu, bottomObstacleTop),
    ],
  });

  const side = (middlewareData.figjamVerticalPlacement?.side as SelectionMenuSide | undefined) ?? "above";

  return { x: Math.round(x), y: Math.round(y), side };
}
