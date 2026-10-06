// src/chrome/overlay.tsx — the one `components.InFrontOfTheCanvas` slot,
// fanned out to whichever kits brought something to paint there, plus THIS
// app's editor chrome.
//
// Since B-SHELL-P1 this file is the SLOT ADAPTER for the host-less shell
// (docs/lanes/finish-B-SHELL-P1.md §4.2, `overlay.tsx` row): it mounts
// `@trunk/shell/BboxShell` here, over tldraw's own canvas (`background={null}`
// — the engine paints the board behind the shell), hands it this editor's
// `HostPort` (`./tldrawHostPort.ts`), and fills its windows layer with the
// shell's windows plus this app's host-supplied content. It keeps what only a
// tldraw host needs: the kits' overlays, `usePassThroughWheelEvents`, and the
// corner placement against tldraw's licence watermark.
//
// WHY a fan-out rather than a list in App.tsx: L3 paints a wire's in-flight
// terminal and L4 mounts the chrome bar and the floating toolbar. Both arrive
// through their own directory; neither should have to edit App.tsx to be seen.
import { useCallback, useId, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useEditor, usePassThroughWheelEvents } from "tldraw";

import { BboxShell } from "@trunk/shell/BboxShell";
import { useShellPanel } from "@trunk/shell/shellPanelRail";

import {
  CORNER_INSET,
  cornerClusterForm,
  placeCornerCluster,
  watermarkCoverRect,
  type CornerClusterForm,
  type CornerPlacement,
  type CornerRect,
  type WatermarkCoverRect,
} from "./cornerClusterForm";
import { useForceCornerPlacement } from "./ShareMenu/cornerPlacementHost";
import { KITS } from "../shapes/registry";
import { SystemSketchChromeBar } from "./TitleBar";
import { SystemSketchDevTools } from "./DevMenu";
import { FloatingSelectionToolbar } from "./ContextualPopupMenu";
import { FocusLens } from "./FocusLens";
import { useInspectorFollowsSelection } from "./inspectorFollowsSelection";
import { SystemSketchPanel } from "./panels";
import { useProblems } from "./problems";
import { SystemSketchStatusStrip } from "./statusStrip";
import { VariantSwitch } from "./DevMenu";
import { tldrawHostPortFor } from "./tldrawHostPort";

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

// The pure half lives in `./cornerClusterForm` so the node unit project can
// load it without tldraw; re-exported here because `corner.smoke.test.tsx`
// imports it from this path.
export {
  CORNER_INSET,
  cornerClusterForm,
  placeCornerCluster,
  watermarkCoverRect,
  type CornerClusterForm,
  type CornerPlacement,
  type CornerPlacementKind,
  type CornerRect,
  type WatermarkCoverRect,
} from "./cornerClusterForm";

/** tldraw's own class for it (LicenseManager.mjs:351) — read, never styled. */
const LICENCE_WATERMARK = ".tl-watermark_SEE-LICENSE";
const DOCK = '[data-slot="tool-dock"]';

function rectOf(el: Element): CornerRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/**
 * The stacked form of the strip: one `[data-slot="status-strip"]`, two rows —
 * the leading launchers (grid · frames · problems) over the readout and the
 * trailing launchers (zoom · dev · help). Cells stay 36x40; nothing is hidden
 * and nothing leaves the strip. Active only while the wrapper carries
 * `data-corner-form="stacked"` (`cornerClusterForm`).
 *
 * WHY the selectors read the trunk's own `data-slot`s and `role`, never its
 * class names, and why this lives here and not in the trunk: the stacked form
 * is app-side styling of a trunk part, not a trunk prop. The column count is
 * `--shell-strip-columns`, set by the shell's strip
 * (`@trunk/shell/shellStatusStrip`) from the `items` array it already builds, so the 3 | readout | 2 split follows one array and a new item
 * updates one place. The separator that sits before the readout is hidden
 * because the readout starts row 2 (`col-start-1`), where that hairline would
 * otherwise dangle at the end of row 1.
 */
const STACKED_STRIP_CLASS = [
  "[&[data-corner-form=stacked]_[data-slot=status-strip]]:grid",
  "[&[data-corner-form=stacked]_[data-slot=status-strip]]:[grid-template-columns:repeat(var(--shell-strip-columns),auto)]",
  "[&[data-corner-form=stacked]_[data-slot=status-strip]]:justify-items-center",
  "[&[data-corner-form=stacked]_[data-slot=status-strip]]:items-center",
  "[&[data-corner-form=stacked]_[data-slot=status-strip]>[role=separator]:has(+[data-slot=status-strip-readout])]:hidden",
  "[&[data-corner-form=stacked]_[data-slot=status-strip]>[data-slot=status-strip-readout]]:col-start-1",
].join(" ");

/** What `useCornerPlacement` hands back: the cluster's own position, and,
 *  only when the forced opt-in AND a watermark are both live, the separate
 *  patch that covers it — see `watermarkCoverRect`'s header for why these
 *  are two independent rectangles rather than one. */
export interface CornerPlacementState {
  placement: CornerPlacement;
  watermarkCover: WatermarkCoverRect | null;
  /** The form the cluster is RENDERED in (`cornerClusterForm`). */
  form: CornerClusterForm;
}

const INITIAL_CORNER_PLACEMENT: CornerPlacementState = {
  placement: { right: CORNER_INSET, bottom: CORNER_INSET, placement: "corner" },
  watermarkCover: null,
  form: "row",
};

function sameCornerPlacementState(a: CornerPlacementState, b: CornerPlacementState): boolean {
  if (a.form !== b.form) return false;
  if (a.placement.right !== b.placement.right || a.placement.bottom !== b.placement.bottom || a.placement.placement !== b.placement.placement) {
    return false;
  }
  if (a.watermarkCover === b.watermarkCover) return true;
  if (a.watermarkCover === null || b.watermarkCover === null) return false;
  return (
    a.watermarkCover.right === b.watermarkCover.right &&
    a.watermarkCover.bottom === b.watermarkCover.bottom &&
    a.watermarkCover.width === b.watermarkCover.width &&
    a.watermarkCover.height === b.watermarkCover.height
  );
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
function useCornerPlacement(cluster: RefObject<HTMLDivElement | null>): CornerPlacementState {
  const editor = useEditor();
  const [state, setState] = useState<CornerPlacementState>(INITIAL_CORNER_PLACEMENT);
  // Zach, 2026-09-22: the watermark-avoidance rule above stays the default,
  // but he wants an explicit, WARNED opt-out — "in settings have a toggle
  // that allows you to place it correctly in the corner... Please only do
  // this if you are using it for development." Forcing `watermark: null`
  // below is that opt-out: it is the user's own choice to let the corner
  // cluster cover the licence notice, made through the red-warned Settings
  // switch (`./ShareMenu/appSettings.tsx`), never a default this file picks
  // for them. `placeCornerCluster` itself is untouched — passing no watermark
  // already makes it return the flush "corner" placement, IDENTICAL to the
  // licensed default, which is what keeps the cluster's own spacing
  // consistent with the rest of the chrome (see `watermarkCoverRect`'s
  // header for why full coverage is a SEPARATE concern from this).
  const forceCorner = useForceCornerPlacement();
  // The form actually on screen (set in a layout effect below, after the DOM
  // has it), the single-row size cached while the row was rendered, and the
  // live `measure` so the form effect can run it once a new form has painted.
  const renderedForm = useRef<CornerClusterForm>("row");
  const rowSize = useRef<{ width: number; height: number } | null>(null);
  const measureRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const container = editor.getContainer();
    let watermark: Element | null = null;
    let dock: Element | null = null;

    const measure = () => {
      const el = cluster.current;
      if (!el) return;
      const containerRect = rectOf(container);
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const watermarkRect = forceCorner ? null : watermark ? rectOf(watermark) : null;
      const obstacles = dock ? [rectOf(dock)] : [];
      // The row's size is only ever read while the ROW is what is rendered.
      // The stacked box always fits, so deciding the form from it would flip
      // back to `row`, re-measure the row, flip to `stacked`... forever.
      if (renderedForm.current === "row") rowSize.current = size;
      const wanted = cornerClusterForm({ container: containerRect, row: rowSize.current ?? size, watermark: watermarkRect, obstacles });
      if (wanted !== renderedForm.current) {
        // WHY only the FORM is committed here, and the placement is kept: the
        // placement below is computed from the box that is on screen, and the
        // box on screen is still the OLD form. `data-corner-placement` must
        // never publish a placement computed for the form it is not
        // rendering. At 720 a row lifted over the dock ALSO reports
        // "above-licence" (28px above the licence text), which is exactly the
        // value `corner.smoke` waits for before it measures once — a lifted
        // row that is ever committed turns into a flaky 28. The placement is
        // computed in the measure that the layout effect below runs once the
        // new form has rendered.
        setState((current) => (current.form === wanted ? current : { ...current, form: wanted }));
        return;
      }
      const placement = placeCornerCluster({ container: containerRect, cluster: size, watermark: watermarkRect, obstacles });
      // The cover patch only exists to hide the watermark when the cluster's
      // OWN placement above has stopped avoiding it — so it never renders
      // for the default (watermark-avoidance) path, only the forced one.
      const watermarkCover = forceCorner && watermark ? watermarkCoverRect(containerRect, rectOf(watermark)) : null;
      const next: CornerPlacementState = { placement, watermarkCover, form: wanted };
      setState((current) => (sameCornerPlacementState(current, next) ? current : next));
    };
    measureRef.current = measure;

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

  // Place once the new form has RENDERED. Declared after the observer effect
  // so `measureRef` is live; a change of form changes the cluster's box, which
  // the ResizeObserver also reports, and by then `renderedForm` is current.
  useLayoutEffect(() => {
    renderedForm.current = state.form;
    measureRef.current();
  }, [state.form]);

  return state;
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
  // One port per editor, shared with the dock in tldraw's `Toolbar` slot.
  const port = tldrawHostPortFor(editor);

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

  return (
    <div ref={chrome} className="ss-chrome pointer-events-none absolute inset-0 z-[1]">
      {/* The shell over tldraw's canvas. Its root and windows layer do not
          hit-test (A1.4 pass-through, `shellLift.smoke.test.tsx`); every
          window below opts back in itself. */}
      <BboxShell port={port} background={null}>
        <StudioWindows />
      </BboxShell>
    </div>
  );
}

/**
 * The windows the shell shows on this host, with this host's content in them.
 * Mounted INSIDE `BboxShell`, so every window and every host reader here sees
 * the port through the shell's context.
 */
function StudioWindows() {
  const editor = useEditor();
  const panelId = useId();
  const problems = useProblems(editor);
  // The dev panel's own boolean, deliberately separate from the rail — see
  // `statusStrip.tsx`'s `devPanelOpen` doc for why a third rail surface
  // would be the wrong shape for a modal dialog.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const toggleDevPanel = useCallback(() => setDevPanelOpen((current) => !current), []);

  // The rail's one-at-a-time state is the shell's. A click on an inspectable
  // object opens the Inspector; deselecting closes it again only when that
  // click is what opened it. The policy and its WHYs live in
  // `./inspectorFollowsSelection.ts`; every user-driven rail change hands the
  // rail back to the user by clearing its provenance (`onUserChange`).
  const follows = useRef<MutableRefObject<boolean> | null>(null);
  const panel = useShellPanel({
    onUserChange: () => {
      if (follows.current) follows.current.current = false;
    },
  });
  follows.current = useInspectorFollowsSelection(editor, panel.open, panel.setOpen);

  const corner = useRef<HTMLDivElement>(null);
  const { placement, watermarkCover, form } = useCornerPlacement(corner);

  return (
    <>
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
      <SystemSketchPanel open={panel.open} onClose={panel.close} onSurfaceChange={panel.switchSurface} problems={problems} id={panelId} />
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
      {/*
        The forced-corner opt-in's own patch (Zach, 2026-09-22): "just like
        put a little small rectangle that has the same color of the canvas
        over the sliver? so then you are free to place the menu freely." A
        SEPARATE element from the corner cluster below, on purpose — its
        position comes from where the watermark itself measures
        (`watermarkCoverRect`), never from the cluster's own `right`/`bottom`,
        so the cluster keeps the plain `CORNER_INSET` every other piece of
        chrome uses and this alone absorbs the geometry mismatch between that
        fixed inset and wherever tldraw happens to put its watermark.

        RENDERED BEFORE the cluster on purpose, not after: a sibling later in
        this same stacking context paints ON TOP of one earlier at equal
        z-index, and the cluster's own box already overlaps most of this
        patch's box (that overlap is exactly why the cluster alone left a
        sliver showing in the first place). Painted after the cluster, this
        flat square patch sat ON TOP of the pill's own rounded corner — a
        visibly different shade squaring off a corner that should have stayed
        round. Painted BEFORE it instead, the cluster's real chrome covers it
        again wherever the two overlap, and only the genuine gap between the
        cluster's edge and the watermark's own edge is left showing through —
        which is the only part of this patch that ever needed to be visible.

        `pointer-events` stays at this element's inherited `none` (the
        `.ss-chrome` root's default, never opted into `-auto` here) so a
        click still reaches the real watermark link underneath — this hides
        the licence notice from VIEW, which is already the ToS violation the
        red Settings warning names; it does not need to also block the one
        way out of it. `--tl-color-background` is tldraw's own theme-aware
        variable (read, never guessed — `@tldraw/editor` editor.css's
        `.tl-background` rule), so this patch matches light and dark alike
        without this file tracking the theme itself.
      */}
      {watermarkCover && (
        <div
          aria-hidden="true"
          data-slot="watermark-cover"
          className="absolute"
          style={{
            right: watermarkCover.right,
            bottom: watermarkCover.bottom,
            width: watermarkCover.width,
            height: watermarkCover.height,
            background: "var(--tl-color-background)",
          }}
        />
      )}
      <div
        ref={corner}
        className={`pointer-events-auto absolute flex items-end gap-2 ${STACKED_STRIP_CLASS}`}
        style={{ right: placement.right, bottom: placement.bottom }}
        data-corner-placement={placement.placement}
        data-corner-form={form}
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
          open={panel.open}
          onToggle={panel.toggle}
          problemCount={problems.total}
          panelId={panelId}
          devPanelOpen={devPanelOpen}
          onToggleDevPanel={toggleDevPanel}
        />
      </div>
    </>
  );
}
