// src/shapes/wire/WireFace.tsx — what an `ss-wire` looks like: the trunk's
// own `Trace`, painted between the REAL dots.
//
// Nothing is drawn here. The JSX below is the donor's, copied in shape from
// apps/storybook-basics/src/hosts/tldrawHost.tsx:497-510 (the `WireOverlay`'s
// `<Trace … terminals={false}/>` inside an `overflow: visible`, 1×1,
// `pointerEvents: none` svg) — "the host owns the geometry, the core owns the
// paint".
//
// TWO DIFFERENCES from the donor, both forced by where this paints:
//
//  1. The donor paints every wire in ONE svg mounted through
//     `components.OnTheCanvas`, which sits inside `.tl-html-layer` and gets
//     page coordinates for free. Here each wire is its own SHAPE, so the
//     paint lives in that shape's own `HTMLContainer` and the test can ask
//     `[data-shape-id="<wire>"] [data-slot="trace-line"]` for it — which is
//     what `src/wiring.smoke.test.tsx` does. Being a shape is also what gives
//     a wire an id, a z-order, an undo history and a selection for free
//     (plan §1.3), instead of a second parallel record type.
//
//  2. WHY every wire stays at x=0, y=0: with the shape at the page origin and
//     no rotation, SHAPE SPACE IS PAGE SPACE — so a bound anchor (projected
//     into page space through its own block's transform) and a LOOSE end
//     (`props.start`/`props.end`) are numbers in one frame, and the svg's
//     user units are that same frame. Give the wire a position instead and
//     every one of those three has to be re-based on every drag, for no gain:
//     a cable has no position of its own, it has two ends.
import { HTMLContainer, useEditor, useValue } from "tldraw";

import { Trace } from "@trunk/components/trace";
import { usePortVariant } from "@trunk/skin/portVariants";

import { diffMarkPaint } from "../shared/diffMark";

import { directionTowards, wireTerminalGap, wireTerminals } from "./wireGeometry";
import { wireDrag } from "./wireGesture";
import { wireTunnelState } from "./wireTunnel";
import type { WireShape } from "./WireShapeUtil";

export function WireFace({ shape }: { shape: WireShape }) {
  const editor = useEditor();
  // Subscribed, not read once: the port style is an `<html>` attribute the
  // variant pill flips live, and the cable's end has to follow the ring of
  // the dot now painted (`wireTerminalGap`).
  const portVariant = usePortVariant();

  // WHY `useValue` and not `shape.props` alone: a wire's two ends live in
  // OTHER shapes' records (their measured `anchors` and their page
  // transforms), so the paint has to be reactive to records this component
  // was never handed. `useValue` subscribes to exactly what the derivation
  // reads — which is how a mid-drag block moves its wire live with no DOM
  // read and no write back to the wire (`src/wiring.smoke.test.tsx`: the
  // painted endpoint follows a moved block by >60px).
  const painted = useValue(
    "ss-wire terminals",
    () => {
      const live = editor.getShape<WireShape>(shape.id);
      if (!live) return null;
      const { from, to } = wireTerminals(editor, live);
      return {
        // ONE ATTACH POINT PER PORT, and it is the dot's measured centre.
        // Zach, 2026-09-19, on three cables leaving one `pose` dot at three
        // stacked offsets: "very bad. edges should always leave from the
        // center of the port… The port only should have 1 connection point
        // in the center. Instead you should show the producer circle that
        // has the number for the number of arrows intersecting at that
        // port." So the duplicate FAN that used to move these two terminals
        // ±7px perpendicular is gone, and so is the `curve` that spread the
        // direct routings by the same amount. Two cables between the same
        // two dots now draw on top of each other; that overlap is the rule
        // working, not a defect, and the count is what a badge will say.
        from,
        to,
        variant: live.props.variant,
        routing: live.props.routing,
        // P-028. The authored corners, handed straight through. `Trace` is
        // the ONE dispatch that turns a routing kind into geometry
        // (`trace.tsx`'s P6 header), and `WireShapeUtil.getGeometry` asks it
        // the same question with the same `pins` — which is what keeps the
        // hit corridor on the cable the user can see, exactly as it already
        // does for the four routings.
        pins: live.props.pins,
        // `color: ""` is the schema's "unset" (a `T.string` cannot be null
        // without changing the persisted contract), and `Trace` reads an
        // absent `color` as its own default. Passing the empty string through
        // would paint `stroke: ""`, i.e. nothing.
        color: live.props.color || undefined,
        // P-035. The comparison mark, as PAINT rather than as a layer.
        //
        // WHY a cable takes its mark on its own stroke while a block takes a
        // wash and a ring: `docs/INVALID-STATES-PLAN.md` §6 puts "cable
        // backdrops" on the DIAGNOSTIC side of the channel split and leaves
        // the diff lane "the fill/wash/chip/typography channels". A line has
        // no fill, so its stroke IS its fill channel — and a backdrop behind
        // the run would be the one treatment §6 forbids here, because it is
        // the treatment reserved for the axis that has to remain visible AT
        // THE SAME TIME on a cable that is both changed and broken.
        diff: live.props.diff,
        // P-023. The four-state answer, assembled in `./wireTunnel.ts` from
        // two document props and two runtime facts, and DECIDED by the
        // trunk's own `tunnelDisplayState`. It is read inside this `useValue`
        // so that focusing a layer, hovering a block, or selecting a cable
        // repaints every affected cable with no record write anywhere — the
        // donor's rule that focus "never mutates or dirties the board".
        //
        // `Trace` does the rest: it already supplies the points a `hidden`
        // tunnel needs (sampling a curve off the mounted path), shortens the
        // drawn `d` to the two mouths, and paints the vias.
        tunnel: wireTunnelState(editor, live),
      };
    },
    [editor, shape.id],
  );

  if (!painted) return null;

  return (
    <HTMLContainer style={{ overflow: "visible", pointerEvents: "none" }}>
      <svg
        data-slot="wire-layer"
        style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}
      >
        <g data-wire-id={shape.id} data-ss-diff={painted.diff === "normal" ? undefined : painted.diff}>
          <Trace
            id={shape.id}
            from={painted.from}
            to={painted.to}
            routing={painted.routing}
            pins={painted.pins}
            variant={painted.variant}
            // The mark wins over the authored colour while it is on, and the
            // authored colour comes straight back when it is taken off — the
            // mark is a LENS, not an edit. `props.color` is untouched either
            // way, which is what makes "take the diff lens off" a style write
            // and not a colour restore.
            color={diffMarkPaint(painted.diff)?.ink ?? painted.color}
            // The dots are REAL `Port`s rendered by the blocks at each end,
            // so `Trace` must not draw its own terminal glyphs on top of
            // them — the donor passes the same `false` for the same reason.
            // `gap` follows from that: see `wireTerminalGap`'s own doc for
            // why the dot's own ring replaces the trunk's glyph-sized 16.
            terminals={false}
            gap={wireTerminalGap(portVariant.id)}
            tunnel={painted.tunnel}
          />
        </g>
      </svg>
    </HTMLContainer>
  );
}

/**
 * The cable being dragged, before it is a record.
 *
 * Painted through this kit's `Overlay` rather than as a provisional shape —
 * `./wireGesture.ts`'s header carries the measurement that forced that, and
 * the short version is that tldraw orders the shapes layer by shape ID, so a
 * shape created mid-gesture renumbers its siblings in the DOM.
 *
 * WHY this works in SCREEN space while `WireFace` works in page space:
 * `components.InFrontOfTheCanvas` mounts OUTSIDE `.tl-html-layer`
 * (@tldraw/editor's DefaultCanvas — `.tl-canvas__in-front` is a sibling of
 * `.tl-canvas`, `position: absolute; inset: 0`), so it carries no camera
 * transform. `editor.pageToScreen` is the conversion, and it is exact at any
 * zoom; what does NOT scale is the 2px stroke and the ~7px terminal gap, which
 * stay constant screen px while the board's own cables scale with it. For an
 * in-flight preview that is arguably the right answer — the line you are
 * dragging stays legible zoomed out — and it is stated here rather than
 * discovered later.
 */
export function InFlightWire() {
  const editor = useEditor();
  const portVariant = usePortVariant();

  const painted = useValue(
    "ss-wire in flight",
    () => {
      const drag = wireDrag(editor).get();
      if (!drag) return null;
      const origin = editor.getContainer().getBoundingClientRect();
      const toScreen = (point: { x: number; y: number }) => {
        const screen = editor.pageToScreen(point);
        return { x: screen.x - origin.left, y: screen.y - origin.top };
      };
      const from = { ...toScreen(drag.anchor), dir: drag.anchor.dir };
      const at = toScreen(drag.pointer);
      // The loose end has no wall to read a normal off, so its honest flow
      // tangent is the way the cable is actually heading — the same rule
      // `wireTerminals` applies to a loose `props.end`.
      return { from, to: { x: at.x, y: at.y, dir: directionTowards(from, at) } };
    },
    [editor],
  );

  if (!painted) return null;

  return (
    <svg
      data-slot="wire-in-flight"
      style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}
    >
      <Trace
        id="ss-wire-in-flight"
        from={painted.from}
        to={painted.to}
        // Everything a new cable is born as (plan §3's defaults), so the
        // preview is the thing that lands and not a stand-in for it.
        routing="elbow"
        variant="data"
        terminals={false}
        gap={wireTerminalGap(portVariant.id)}
      />
    </svg>
  );
}
