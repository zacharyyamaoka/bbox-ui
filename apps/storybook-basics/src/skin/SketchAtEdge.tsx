// src/skin/SketchAtEdge.tsx — the React shell around the boundary pass.
//
// WHY: seam governed by docs/peps/0001-sketch-skin-at-the-boundary.md.
// The `LIMITS` block below is that record's "what we give up" section kept
// next to the code that causes it; keep the two in step.
//
// PROVENANCE: ours, ad hoc. The "observe, re-run, guard against your own
// mutations" arrangement is the standard MutationObserver idiom; no
// specific implementation was read for it. The geometry it drives is
// `./sketchPath` (fully cited in its own header, from tldraw 5.3.2), and
// the architectural split is the one /home/bam/systemsketch already uses
// (`src/inspector/inspectorModel.ts:742` — hand-drawn is a host-renderer
// prop, never core geometry).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  SKETCH_AT_EDGE_CSS,
  applySketchAtEdge,
  type SketchPassStats,
} from "./sketchAtEdge";

/**
 * Wrap a subtree and draw it by hand.
 *
 * This is the "final rerender at the edges" Zach asked for, made literal:
 * the children render exactly as they would with no skin at all — crisp
 * geometry, no sketch imports, no hidden twins — and then this component
 * reads the resulting DOM back and adds the drawn layer on top.
 *
 * WHY the transform is driven from a `useLayoutEffect` and not from render:
 * it needs measured pixels, which do not exist until after layout. That is
 * also the one structural cost of the whole design, and it is worth naming
 * precisely rather than burying: a transform that runs after layout is one
 * frame behind the geometry it transforms. See `LIMITS` below.
 */
export interface SketchAtEdgeProps {
  children: ReactNode;
  /**
   * Whether to draw. `false` renders children untouched — which is the
   * real proof the core is independent of the skin: turning the skin off
   * is not a code path in the core, it is this boolean at the edge.
   */
  active?: boolean;
  /**
   * Hide the crisp originals once the drawn layer exists.
   *
   * WHY this is separable and defaults to ON: with it OFF you see the crisp
   * geometry and its drawn twin at the same time, which is exactly the
   * comparison capture the `SkinAtTheEdges` story needs in order to prove
   * the two agree. In production you always want it ON.
   */
  suppressCrisp?: boolean;
  /** Called after each pass with what it did — the test seam. */
  onPass?: (stats: SketchPassStats) => void;
}

/**
 * THE HONEST LIMITS of a boundary transform, stated here because the
 * alternative is that they get discovered later and read as bugs.
 *
 * Both follow from the same fact — a pass that runs after the frame cannot
 * be inside it — so neither is fixable by a better implementation. They are
 * the price of the ruling, not of this code.
 *
 *   1. IN-FLIGHT GEOMETRY trails by one frame. While a Trace is being
 *      dragged or a Block resized, the crisp geometry updates in React's
 *      commit and the drawn twin updates in the effect that follows it. At
 *      60fps that is ~16ms of the twin being one step stale. The previous
 *      in-core design had no such gap: it computed the sketch DURING the
 *      same render. Mitigation, and what production should do: show crisp
 *      while a gesture is live and re-draw on gesture end — which is what
 *      tldraw itself does, and cheaper than sketching 60 paths a second.
 *   2. FIRST PAINT is crisp. The pass cannot run on the server and cannot
 *      run before hydration, so server-rendered HTML paints crisp for one
 *      frame and then swaps. The in-core design shipped the sketched twin
 *      in the SSR output, so it was correct in the very first painted
 *      frame. This is a FOUC-class artifact, one frame, invisible in a
 *      client-only app like Storybook but real in `apps/docs`.
 *
 * Neither affects a static canvas, which is what this repo's components
 * are looked at in ~all of the time.
 */
export const LIMITS = {
  inFlightGeometryTrailsOneFrame: true,
  firstPaintIsCrisp: true,
} as const;

let styleInjected = false;

function ensureStyle(): void {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.dataset.bboxSketchAtEdge = "true";
  el.textContent = SKETCH_AT_EDGE_CSS;
  document.head.appendChild(el);
  styleInjected = true;
}

export function SketchAtEdge({
  children,
  active = true,
  suppressCrisp = true,
  onPass,
}: SketchAtEdgeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (active) ensureStyle();
  }, [active]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !active) return;

    // WHY a re-entrancy flag rather than disconnect/reconnect around each
    // pass: the pass APPENDS nodes, so it necessarily trips the very
    // observer that scheduled it. Disconnecting leaves a window in which a
    // real mutation is missed; a flag plus `takeRecords()` (which drains
    // the queue our own writes just filled) closes the loop without
    // dropping anything.
    let applying = false;
    let frame = 0;

    const run = () => {
      if (applying) return;
      applying = true;
      try {
        const stats = applySketchAtEdge(host);
        onPass?.(stats);
      } finally {
        observer.takeRecords();
        applying = false;
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        run();
      });
    };

    const observer = new MutationObserver(schedule);

    run();
    setReady(true);

    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      // Only the attributes that can change a drawn shape. Watching
      // everything would re-run the pass on every unrelated data-* flip.
      attributeFilter: ["d", "style", "class", "width", "height"],
    });

    // A Block that hugs its content changes size without any attribute
    // changing — the core never writes its measured height anywhere,
    // which is the whole reason it had to fake one.
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    for (const el of host.querySelectorAll('[data-slot="block"]')) resize.observe(el);

    return () => {
      observer.disconnect();
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, children, onPass]);

  return (
    <div
      ref={hostRef}
      // `display: contents` so the wrapper adds no box of its own — the
      // same reason `.storybook/preview.tsx:68-82` uses it for the skin
      // attribute: a wrapper with a box would move every existing story's
      // `getBoundingClientRect` measurement.
      style={{ display: "contents" }}
      {...(active ? { "data-bbox-sketch-active": "" } : {})}
      // WHY suppression waits on `ready`: hiding the crisp layer before the
      // first pass has drawn anything would paint one frame of NOTHING,
      // which is worse than the one frame of crisp that LIMITS #2 describes.
      {...(active && suppressCrisp && ready ? { "data-bbox-sketch-suppress": "" } : {})}
    >
      {children}
    </div>
  );
}
