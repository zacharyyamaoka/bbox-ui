// src/chrome/overlay.tsx — the one `components.InFrontOfTheCanvas` slot,
// fanned out to whichever kits brought something to paint there, plus THIS
// app's editor chrome.
//
// WHY a fan-out rather than a list in App.tsx: L3 paints a wire's in-flight
// terminal and L4 mounts the chrome bar and the floating toolbar. Both arrive
// through their own directory; neither should have to edit App.tsx to be seen.
import { useCallback, useId, useRef, useState } from "react";
import { useEditor, usePassThroughWheelEvents } from "tldraw";

import { KITS } from "../shapes/registry";
import { SystemSketchChromeBar } from "./chromeBar";
import { SystemSketchDevTools } from "./devtools";
import { FloatingSelectionToolbar } from "./floatingToolbar";
import { SystemSketchPanel } from "./panels";
import { useProblems } from "./problems";
import { SystemSketchStatusStrip, type ChromePanel } from "./statusStrip";

export function Overlay() {
  return (
    <>
      {KITS.map((kit, index) => (kit.Overlay ? <kit.Overlay key={index} /> : null))}
      <SystemSketchChrome />
    </>
  );
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
      <SystemSketchPanel open={open} onClose={close} problems={problems} id={panelId} />
      {/* Quick switcher, dev panel and recorder: all three portal to
          `document.body` through their own stock Dialog/Popover, so this
          component paints nothing here itself — it only needs to be
          mounted, the same as `kit.Overlay` above. */}
      <SystemSketchDevTools devPanelOpen={devPanelOpen} onDevPanelOpenChange={setDevPanelOpen} />
      {/*
        Bottom-RIGHT, clear of the dock's bottom-centre column — and lifted
        48px so it clears tldraw's LICENCE WATERMARK.
        Measured in the running app at 1400x900: the watermark
        (`.tl-watermark_SEE-LICENSE`) occupies x 1296-1396, y 860-896, and it
        sits at `--tl-layer-watermark: 248` — BELOW `.tl-canvas__in-front`'s
        250, so this chrome paints over it. tldraw's own CSS says the
        watermark "sits above that content so it can't be occluded"; the
        content it means is canvas content, and a host's own chrome can still
        cover it. Covering a licensing element is not something to do by
        accident, so the strip is parked above it. At `bottom-3` it measured
        y 846-888 and covered the watermark outright.
      */}
      <div className="pointer-events-auto absolute right-2 bottom-12">
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
