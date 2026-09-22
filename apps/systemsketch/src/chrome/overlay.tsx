// src/chrome/overlay.tsx — the one `components.InFrontOfTheCanvas` slot,
// fanned out to whichever kits brought something to paint there, plus THIS
// app's editor chrome.
//
// WHY a fan-out rather than a list in App.tsx: L3 paints a wire's in-flight
// terminal and L4 mounts the chrome bar and the floating toolbar. Both arrive
// through their own directory; neither should have to edit App.tsx to be seen.
import { useCallback, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useEditor, usePassThroughWheelEvents } from "tldraw";

import { useForceCornerPlacement } from "./ShareMenu/cornerPlacementHost";
import { KITS } from "../shapes/registry";
import { SystemSketchChromeBar } from "./TitleBar";
import { SystemSketchDevTools } from "./DevMenu";
import { FloatingSelectionToolbar } from "./ContextualPopupMenu";
import { FocusLens } from "./FocusLens";
import { SystemSketchPanel } from "./panels";
import { useProblems } from "./problems";
import { SystemSketchStatusStrip, type ChromePanel } from "./statusStrip";
import { VariantSwitch } from "./DevMenu";

export function Overlay() {
  return (
    <>
      {KITS.map((kit, index) => (kit.Overlay ? <kit.Overlay key={index} /> : null))}
      <SystemSketchChrome />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The bottom-right corner                                             */
/* ------------------------------------------------------------------ */

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
 * you please... cover that"). `useCornerPlacement` gets this placement by
 * calling `placeCornerCluster` with NO watermark, so it always lands at the
 * plain `CORNER_INSET` (8px) — but tldraw sits its own watermark closer to
 * the true corner than that (measured ~4px at 1400x900 desktop), so the
 * cluster's flush-8px box does not fully CONTAIN the watermark's box, and a
 * sliver of its right/bottom edge — the tail of a letter — pokes out past
 * the cluster. This is not a case for `placeCornerCluster` itself: that
 * function's whole job is deciding whether to sit beside/above the
 * watermark, and it is still exactly right for that, untouched. This is the
 * one extra step the FORCED path alone needs: once the cluster is already
 * sitting over the watermark on purpose, shrink the offset just enough that
 * the cluster's own edge reaches (or passes) the watermark's edge, so
 * covering it is actually complete rather than "mostly".
 *
 * Only ever tightens (`Math.min` against the placement already chosen),
 * never loosens it past what `placeCornerCluster` returned, and floors at 0
 * so a watermark somehow flush against the corner cannot push the offset
 * negative.
 */
export function hugWatermark(placement: CornerPlacement, container: CornerRect, watermark: CornerRect): CornerPlacement {
  return {
    ...placement,
    right: Math.max(0, Math.min(placement.right, container.right - watermark.right)),
    bottom: Math.max(0, Math.min(placement.bottom, container.bottom - watermark.bottom)),
  };
}

/** tldraw's own class for it (LicenseManager.mjs:351) — read, never styled. */
const LICENCE_WATERMARK = ".tl-watermark_SEE-LICENSE";
const DOCK = '[data-slot="tool-dock"]';

function rectOf(el: Element): CornerRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/**
 * `placeCornerCluster`, kept live. Measures, never assumes: whether a
 * watermark exists at all (no key → yes; a valid key → no; a
 * "with watermark" key → yes again), where tldraw put it (desktop, the 8px
 * mobile tab under 700px, debug mode's lifted spot) and where the dock is.
 *
 * WHY observers rather than a one-off measure: the watermark mounts AFTER
 * first paint — licence validation is async (LicenseManager.mjs:64) — and
 * swaps shape at the 700px breakpoint. A subtree `childList` observer notices
 * the watermark and the dock arriving or leaving (cheap: two querySelectors,
 * and it re-measures only when either element's identity changes);
 * ResizeObservers and one attribute observer cover every later move.
 */
function useCornerPlacement(cluster: RefObject<HTMLDivElement | null>): CornerPlacement {
  const editor = useEditor();
  const [placement, setPlacement] = useState<CornerPlacement>({ right: CORNER_INSET, bottom: CORNER_INSET, placement: "corner" });
  // Zach, 2026-09-22: the watermark-avoidance rule above stays the default,
  // but he wants an explicit, WARNED opt-out — "in settings have a toggle
  // that allows you to place it correctly in the corner... Please only do
  // this if you are using it for development." Forcing `watermark: null`
  // below is that opt-out: it is the user's own choice to let the corner
  // cluster cover the licence notice, made through the red-warned Settings
  // switch (`./ShareMenu/appSettings.tsx`), never a default this file picks
  // for them. `placeCornerCluster` itself is untouched — passing no watermark
  // already makes it return the flush "corner" placement.
  const forceCorner = useForceCornerPlacement();

  useLayoutEffect(() => {
    const container = editor.getContainer();
    let watermark: Element | null = null;
    let dock: Element | null = null;

    const measure = () => {
      const el = cluster.current;
      if (!el) return;
      const containerRect = rectOf(container);
      const next = placeCornerCluster({
        container: containerRect,
        cluster: { width: el.offsetWidth, height: el.offsetHeight },
        watermark: forceCorner ? null : watermark ? rectOf(watermark) : null,
        obstacles: dock ? [rectOf(dock)] : [],
      });
      // Forced AND a watermark actually exists: `hugWatermark` shrinks the
      // offset (never grows it) so the cluster's own edge fully contains the
      // watermark's, closing the "little piece of the letter showing" gap.
      const settled = forceCorner && watermark ? hugWatermark(next, containerRect, rectOf(watermark)) : next;
      setPlacement((current) =>
        current.right === settled.right && current.bottom === settled.bottom && current.placement === settled.placement
          ? current
          : settled,
      );
    };

    const sizes = new ResizeObserver(measure);
    const watermarkAttributes = new MutationObserver(measure);

    const track = () => {
      const nextWatermark = container.querySelector(LICENCE_WATERMARK);
      const nextDock = container.querySelector(DOCK);
      if (nextWatermark === watermark && nextDock === dock) return false;
      sizes.disconnect();
      watermarkAttributes.disconnect();
      watermark = nextWatermark;
      dock = nextDock;
      sizes.observe(container);
      if (cluster.current) sizes.observe(cluster.current);
      if (watermark) {
        sizes.observe(watermark);
        // `data-debug` / `data-mobile` move or reshape it without a resize.
        watermarkAttributes.observe(watermark, { attributes: true });
      }
      if (dock) sizes.observe(dock);
      return true;
    };

    const arrivals = new MutationObserver(() => {
      if (track()) measure();
    });
    arrivals.observe(container, { childList: true, subtree: true });

    track();
    sizes.observe(container);
    if (cluster.current) sizes.observe(cluster.current);
    measure();

    return () => {
      arrivals.disconnect();
      sizes.disconnect();
      watermarkAttributes.disconnect();
    };
  }, [editor, cluster, forceCorner]);

  return placement;
}

/**
 * Every editor menu this app has, positioned with plain CSS inside the slot
 * tldraw gives us.
 *
 * WHY the `.ss-chrome` class exists at all, and why its z-index is 1:
 *
 *   - The kit ships ZERO z-index by contract (docs/menus/MENU-KIT-DESIGN.md
 *     §4, Universal: "the host owns layering"), so SOMEONE here has to say
 *     what sits above what, and the kit cannot.
 *   - 1 is the smallest value that does the job. tldraw renders this slot in
 *     `.tl-canvas__in-front` — `position: absolute; inset: 0; pointer-events:
 *     none; z-index: var(--tl-layer-canvas-in-front)` = 250 (editor.css:325)
 *     — a sibling AFTER `.tl-canvas`, which declares no z-index of its own
 *     (editor.css:312). So the SHAPES are already beaten by the slot itself;
 *     nothing here has to out-stack `.tl-html-layer`. The only thing z-index
 *     decides is the order INSIDE this slot, where `wireKit.Overlay` paints
 *     the in-flight cable and the edge-drop menu first. 1 puts the chrome
 *     over those and stops.
 *   - It deliberately does NOT try to beat `.tlui-layout` (300, its own
 *     stacking context, tldraw.css:1631): tldraw's toasts and dialogs live
 *     there, and a file-open error has to be able to cover the bar that
 *     raised it.
 *
 * WHY `pointer-events: none` with each surface opting back in: this element
 * covers the entire canvas. Left hit-testable it would swallow every click on
 * the board — the same failure `./dock.tsx` documents from the other side
 * (tldraw's own `.tlui-layout` is `pointer-events: none` for exactly this
 * reason, and every stock panel opts in through its own class).
 */
function SystemSketchChrome() {
  const editor = useEditor();
  const [open, setOpen] = useState<ChromePanel | null>(null);
  const panelId = useId();
  const problems = useProblems(editor);
  // The dev panel's own boolean, deliberately separate from `open`/`toggle`
  // above — see `statusStrip.tsx`'s `devPanelOpen` doc for why a third
  // `ChromePanel` value would be the wrong shape for a modal dialog.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const toggleDevPanel = useCallback(() => setDevPanelOpen((current) => !current), []);

  /**
   * STEP 7 of docs/menus/MENU-KIT-DESIGN.md §4 — "the host attaches wheel
   * pass-through to the ref if its engine needs it". This engine needs it.
   *
   * WHY it is not free: tldraw's wheel listener is attached to `.tl-canvas`
   * itself (@tldraw/editor useGestureEvents.mjs:231, and its own handler is
   * guarded by `elm.contains(event.target)`), while this whole overlay lives
   * in `.tl-canvas__in-front`, a SIBLING of `.tl-canvas` (DefaultCanvas.mjs
   * renders them side by side). A wheel event whose target is any chrome
   * surface therefore bubbles up a branch the camera is not listening on and
   * the board simply stops panning under the cursor — measured before this
   * line existed: wheel over the pill, the chrome bar or the status strip
   * left the camera at {0,0,1} while wheel over bare canvas moved it to
   * {0,-240,1}.
   *
   * WHY the stock hook and not our own re-dispatch: `usePassThroughWheelEvents`
   * is what tldraw's OWN chrome uses for exactly this (DefaultMenuPanel,
   * DefaultStylePanel, TldrawUiContextualToolbar), and it reaches this app
   * through the public `tldraw` entry (`tldraw`'s d.ts ends in `export * from
   * "@tldraw/editor"`), so `src/document/stockBoundary.test.ts` stays happy.
   * It also carries the two behaviours a hand-rolled version would drop: it
   * leaves a genuinely scrollable surface — the frames/problems list — to
   * scroll itself, and it marks its re-dispatched event so it cannot loop.
   *
   * WHY once, here, rather than per surface as tldraw does: every chrome
   * surface this app owns is a descendant of this element, and the canvas is
   * not — bare-canvas wheels bubble up the sibling branch and never reach
   * this listener. One attachment is the whole set.
   */
  const chrome = useRef<HTMLDivElement>(null);
  usePassThroughWheelEvents(chrome);

  const corner = useRef<HTMLDivElement>(null);
  const placement = useCornerPlacement(corner);

  const toggle = useCallback((panel: ChromePanel) => {
    // One at a time: pressing the open one closes it, pressing the other
    // swaps. The kit's `StatusStripItem.active` is already the toggle's
    // `aria-pressed`, so this is the whole policy.
    setOpen((current) => (current === panel ? null : panel));
  }, []);

  const close = useCallback(() => setOpen(null), []);

  return (
    <div ref={chrome} className="ss-chrome pointer-events-none absolute inset-0 z-[1]">
      {/*
        Top-LEFT, and it genuinely covers the canvas underneath: measured in
        the running app at 1400x900 the cluster occupies x 8-416, y 8-50, and
        it is interactive, so a shape drawn there cannot be grabbed. That is
        the same bargain FigJam and Figma make (and the archive's own
        TitleBar made) — chrome floats over the board and you pan out from
        under it — but it is worth stating, because a FIXTURE placed at page
        (40, 40) with the camera at the origin lands underneath it.
        `src/region.smoke.test.tsx`'s re-parenting test is exactly such a
        fixture, and the fix belongs to that fixture, not to this bar.

        MEASURED both ways, 2026-09-19, so this is not an opinion: with the
        bar mounted that test fails at its line 90 — `dragAndDrop` retries the
        whole 30s timeout and gives up, `data-testid="ss-chrome" ...
        intercepts pointer events`. With `<SystemSketchChrome/>` temporarily
        unmounted and nothing else changed, the SAME test fails at its line
        91 instead — `waitFor timed out ... re-parented into the region` — and
        the file's result is identical either way, 4 failed | 1 passed,
        because L5 has not landed. This bar changes that test's failure
        MODE; it does not change its outcome, and it takes nothing green to
        red.

        The one-line fix is the fixture's own coordinates: `x: 40, y: 40` →
        `x: 60, y: 160` at region.smoke.test.tsx:86 — the position the same
        file's wire-target test already uses, clear of this bar (y 8-50), of
        that test's region (x 300-720 / y 120-420) and of the bottom-centre
        dock. It is also the only test in that file passing today, with this
        bar mounted, which is what makes it a measured choice rather than a
        guess.
      */}
      <div className="absolute top-2 left-2">
        <SystemSketchChromeBar />
      </div>
      <FloatingSelectionToolbar />
      {/*
        The propagation focus lens (P-025). Top-CENTRE, and that is NOT where
        the archive put it — its controls rode inside the selection pill
        (`SystemSketchChrome`'s `propagation-focus` item). Moved here for one
        reason: this pill FOLLOWS the selection, and the lens survives the
        selection changing (you pick a seed, then look around), so a control
        that vanishes the moment you click elsewhere cannot be the thing that
        clears the lens. Top-centre is the only edge of this overlay nothing
        else claims — the chrome bar is top-LEFT, the dock bottom-centre, the
        status strip bottom-right.
      */}
      <FocusLens />
      <SystemSketchPanel open={open} onClose={close} onSurfaceChange={setOpen} problems={problems} id={panelId} />
      {/* Quick switcher, dev panel and recorder: all three portal to
          `document.body` through their own stock Dialog/Popover, so this
          component paints nothing here itself — it only needs to be
          mounted, the same as `kit.Overlay` above. */}
      <SystemSketchDevTools devPanelOpen={devPanelOpen} onDevPanelOpenChange={setDevPanelOpen} />
      {/*
        Bottom-RIGHT: truly in the corner whenever tldraw's licence watermark
        lets it be, and immediately beside it when it does not — never over
        it. Zach, 2026-09-19: "please move the right corner menu to be truly
        in the right corner right now its above this text 'get a license for
        production'". The rule, and why the watermark is a wall, is
        `placeCornerCluster` above.

        Measured in the running app at 1400x900 with no licence key (every
        keyless `http:` page, dev and production build alike): the watermark
        occupies x 1296-1396, y 860-896, so the strip lands at x 1136-1288,
        y 850-892 — the corner's own bottom row, 8px left of the licence.
        With a key it drops to x 1240-1392, y 850-892 by itself.
        Replaces a fixed `right-2 bottom-12`, which cleared the watermark by
        floating 48px above it.
      */}
      <div
        ref={corner}
        className="pointer-events-auto absolute flex items-end gap-2"
        style={{ right: placement.right, bottom: placement.bottom }}
        data-corner-placement={placement.placement}
      >
        {/* WHY the temporary variant switch rides INSIDE the measured corner
            row: its own acceptance pins it to the status strip's row, and the
            row as a whole is what `placeCornerCluster` measures against the
            licence watermark and the dock. Kept first so the strip stays the
            piece nearest the corner, and the row is `items-end` so the
            strip's own bottom IS the row's bottom — centring it left a 12px
            gap under the strip at narrow widths, which reads as "not in the
            corner" exactly like the offset Zach objected to. */}
        <VariantSwitch />
        <SystemSketchStatusStrip
          open={open}
          onToggle={toggle}
          problemCount={problems.total}
          panelId={panelId}
          devPanelOpen={devPanelOpen}
          onToggleDevPanel={toggleDevPanel}
        />
      </div>
    </div>
  );
}
