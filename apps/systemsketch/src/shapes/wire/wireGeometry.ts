// src/shapes/wire/wireGeometry.ts — where a wire's two ends ARE, and what
// polyline runs between them. Pure over the editor: reads records, writes
// none.
//
// Lifted from apps/storybook-basics/src/hosts/tldrawHost.tsx:440-486 (the
// `WireOverlay`'s `endPoint` resolution and its `from`/`to` terminal specs).
// What changed in the move, and why:
//   - the donor resolves an anchor out of a React-state `anchors` map keyed
//     by node id; here the anchor is a PERSISTED PROP of the target shape
//     (`props.anchors`, written back by `shared/measure.ts`), because in this
//     app the tldraw store IS the document (plan §1.1-B);
//   - the donor walks `ancestorsOf` to find the top-level shape a member's
//     dot was measured under. Here every node is its own shape, so a binding's
//     `toId` IS the shape that owns the anchor and no walk is needed. When L5
//     lands members drawn inside an expanded block, that walk comes back —
//     it belongs here, in one function, not spread over the callers.
//
// The donor's two rules travel unchanged: an anchor is a GEOMETRY POINT, not
// a DOM element (tldraw paints in page space, where no DOM element of the
// shape exists at paint time), and the side fallback is
// `anchor.side ?? (x < w/2 ? "left" : "right")`.

import { Vec, type Editor, type TLShape, type TLShapeId } from "tldraw";

import { pinElbowSegment, removePin, routeElbow, type ElbowAxis, type ElbowPin, type ElbowRouteInput } from "@trunk/components/elbow";
import { elbowInputFromTerminals } from "@trunk/components/elbow/traceContract";
import { traceGeometry, traceRouteEnd, traceRouteStart } from "@trunk/components/trace";
import { traceHitPolyline } from "@trunk/components/trace.hit";
import { OPPOSITE_DIR, type Point, type TraceDir, type TraceRouting, type TraceTerminalSpec } from "@trunk/components/trace.layout";

import { WIRE_BINDING_TYPE } from "../types";
import type { WireBinding } from "./WireBindingUtil";
import type { WireShape } from "./WireShapeUtil";

/**
 * How far the painted line stops short of a dot's measured centre, at each
 * end.
 *
 * DEVIATION from the trunk's own `TRACE_TERMINAL_GAP` (16px,
 * `@trunk/components/trace.tsx:617`), and the only one in this file. The
 * trunk's default is sized for `Trace`'s own terminal GLYPHS — it draws a
 * circle at each end and the gap is the room that circle needs. Here the
 * glyph is a REAL `Port` dot rendered by the block (`terminals={false}` in
 * `WireFace`), 12px across in the `md` default (`PORT_DIAMETERS`,
 * `@trunk/components/port.layout.ts:44`), so the room needed is that dot's
 * 6px radius and its rings — not 16px.
 *
 * It is also the number `src/wiring.smoke.test.tsx` measures: that test
 * requires the painted path's first and last points to land within 14px of
 * the real dots' screen centres, and 16px does not fit inside 14px. 8px
 * clears the dot by 2px and leaves 6px of headroom.
 *
 * Since 2026-09-19 that headroom is spent on nothing: the duplicate fan
 * that used to push a terminal ±7px perpendicular is gone (Zach: "The port
 * only should have 1 connection point in the center"), so every cable's
 * painted end is exactly 8px from its dot's centre ALONG THE WALL NORMAL
 * and zero px across it. `src/fixes.smoke.test.tsx` measures that zero.
 */
export const WIRE_TERMINAL_GAP = 8;

/** A shape that carries measured dot centres — `ss-block` and `ss-port` both
 *  do, and nothing else in the vocabulary does. Read structurally rather than
 *  by shape type so this file never grows a per-kind branch. */
interface MeasuredAnchors {
  w?: number;
  anchors?: readonly { portId: string; x: number; y: number; side: TraceDir | null }[];
}

export interface WireEnds {
  from: TraceTerminalSpec | null;
  to: TraceTerminalSpec | null;
}

/** The dominant-axis direction from `a` to `b`. Used only for a LOOSE
 *  terminal, where there is no wall to read a normal off: mid-drag the honest
 *  tangent is "the way this cable is actually heading". */
export function directionTowards(a: Point, b: Point): TraceDir {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/**
 * One port dot as a terminal spec, in PAGE space, or `null` when it cannot be
 * resolved — the target has gone, or its dot has not been measured yet.
 * `null` is "skipped, not guessed at" (the donor's `unresolvedIds` channel):
 * inventing a position for an unmeasured dot is how a cable ends up painted
 * somewhere nobody put it.
 *
 * Page space rather than any wire's own space, because two callers need it
 * and only one of them has a wire: `boundTerminal` below projects it into the
 * wire, and the press-drag gesture paints an in-flight cable that has no
 * record at all (`wireGesture.ts`).
 */
export function portTerminal(editor: Editor, targetId: TLShapeId, portId: string, terminal: "start" | "end"): TraceTerminalSpec | null {
  const target: TLShape | undefined = editor.getShape(targetId);
  if (!target) return null;
  const props = target.props as MeasuredAnchors;
  const anchor = props.anchors?.find((candidate) => candidate.portId === portId);
  if (!anchor) return null;
  const transform = editor.getShapePageTransform(target.id);
  if (!transform) return null;
  const page = transform.applyToPoint({ x: anchor.x, y: anchor.y });
  const side: TraceDir = anchor.side ?? (anchor.x < (props.w ?? 0) / 2 ? "left" : "right");
  // Donor tldrawHost.tsx:476-479: the `from` end LEAVES along its wall
  // normal; the `to` end ARRIVES travelling the opposite way, so its flow
  // tangent is the wall's opposite. Getting this backwards draws routes that
  // look plausible left-to-right and loop absurdly everywhere else
  // (`@trunk/components/elbow/traceContract.ts:41-50`).
  return { x: page.x, y: page.y, dir: terminal === "start" ? side : OPPOSITE_DIR[side] };
}

/**
 * One bound terminal of `wire`, in the WIRE's own space, or `null` when the
 * terminal has no binding or `portTerminal` could not resolve it.
 */
function boundTerminal(editor: Editor, wire: WireShape, terminal: "start" | "end"): TraceTerminalSpec | null {
  const binding = editor
    .getBindingsFromShape<WireBinding>(wire.id, WIRE_BINDING_TYPE)
    .find((candidate) => candidate.props.terminal === terminal);
  if (!binding) return null;
  const page = portTerminal(editor, binding.toId, binding.props.portId, terminal);
  if (!page) return null;
  // WHY the projection goes page -> wire space even though this lane keeps
  // every wire at x=0, y=0 on the page (so the two frames are the same):
  // stating the transform is what makes the claim checkable instead of
  // assumed. The day a wire is ever parented to a frame, this line is already
  // right and only `createWire`'s parenting has to change.
  const local = editor.getPointInShapeSpace(wire.id, page);
  return { x: local.x, y: local.y, dir: page.dir };
}

/** Both bound terminals, `null` where a terminal is loose or unresolvable. */
export function resolveWireEnds(editor: Editor, wire: WireShape): WireEnds {
  return { from: boundTerminal(editor, wire, "start"), to: boundTerminal(editor, wire, "end") };
}

/**
 * Both terminals, with `props.start` / `props.end` standing in for whichever
 * one is loose — tldraw's own arrow pattern, and the reason those two props
 * exist at all (plan §3: "read only for a terminal that has no binding").
 * Always total, so paint and geometry never have to branch on "did it
 * resolve".
 */
export function wireTerminals(editor: Editor, wire: WireShape): { from: TraceTerminalSpec; to: TraceTerminalSpec } {
  const bound = resolveWireEnds(editor, wire);
  const startPoint: Point = bound.from ?? wire.props.start;
  const endPoint: Point = bound.to ?? wire.props.end;
  return {
    from: bound.from ?? { ...wire.props.start, dir: directionTowards(startPoint, endPoint) },
    to: bound.to ?? { ...wire.props.end, dir: directionTowards(startPoint, endPoint) },
  };
}

/**
 * The polyline a wire occupies: the trunk's own router, asked for the same
 * route the paint will take.
 *
 * WHY the trunk's `traceGeometry` rather than a second elbow route written
 * here (the lane brief's fallback option): `@trunk/components/elbow/` already
 * exposes the pure router, and `traceGeometry` is the ONE dispatch that turns
 * a routing KIND into geometry (`trace.tsx`'s own P6 header). A second copy
 * is how hit geometry and paint start to disagree about where the cable is.
 *
 * PAINT AND HIT NOW AGREE FOR ALL FOUR ROUTINGS. Two things used to make them
 * differ and both are gone:
 *   - the duplicate FAN moved the PAINT of a duplicate wire by up to ±7px
 *     perpendicular while the hit polyline stayed put. Retired 2026-09-19 (see
 *     this file's own `WIRE_TERMINAL_GAP` note).
 *   - a `curved` wire has no vertices (a cubic HAS none, and `traceGeometry`
 *     says so by returning `points: null` rather than inventing some), so this
 *     function used to fall back to `[geometry.start, geometry.end]` — the
 *     CHORD. On the default cubic that is tens of px from the drawn bow at its
 *     middle, so a press on the visible curve landed on empty canvas. Fixed by
 *     `traceHitPolyline`, which flattens the SAME cubic that is painted (P-003;
 *     `@trunk/components/trace.hit.ts` and its test measure the agreement
 *     against the `d` string rather than against a second control-point
 *     derivation).
 *
 * `curve` is not passed because `ss-wire` has no bend to pass — `WireShapeProps`
 * carries no `curve`, so every curved cable here is the default cubic. `pins`
 * IS passed, and is read by exactly one branch: `traceGeometryBetween`'s
 * `routing === "elbow"` arm hands it to the router, and the three direct
 * routings ignore it (`trace.routing.ts`'s `TraceRouteOptions`). So a cable
 * authored as an elbow and then switched to `curved` keeps its pins in the
 * record, unread, and gets them back when it is switched home — which is the
 * behaviour you want from a routing PICKER and the reason the pins are not
 * cleared on a routing change.
 */
export function wireRoutePoints(from: TraceTerminalSpec, to: TraceTerminalSpec, routing: TraceRouting, pins: readonly ElbowPin[] = []): Vec[] {
  const geometry = traceGeometry({ from, to, routing, gap: WIRE_TERMINAL_GAP, pins });
  const points = traceHitPolyline(geometry);
  // `Polyline2d` needs at least two vertices; a degenerate route (both ends
  // on one point) would otherwise throw inside the engine's segment walk.
  if (points.length < 2) return [new Vec(from.x, from.y), new Vec(to.x, to.y)];
  return points.map((point) => new Vec(point.x, point.y));
}

/* ------------------------------------------------------------------ *
 * P-028 — the AUTHORED half of an elbow route.
 *
 * Everything below is assembly, not geometry: the math is the trunk's
 * `@trunk/components/elbow` (`routeElbow`, `createPin`/`mergePin`/
 * `resolvePin`), ported verbatim there from SystemSketch. This file's whole
 * job is to hand that router the SAME input the paint is built from, because
 * the moment the handle frame and the paint frame differ by even the terminal
 * gap, a dragged pin lands somewhere the user did not put it.
 * ------------------------------------------------------------------ */

/**
 * The router input behind a wire's painted elbow route — the pulled-back
 * terminals, the sides derived once, and the wire's persisted pins.
 *
 * WHY the pull-back is restated here instead of being skipped: `traceGeometry`
 * routes between `traceRouteStart(from, gap)` and `traceRouteEnd(to, gap)`,
 * NOT between the dot centres (`trace.tsx`'s own `TraceGeometry.start/end`
 * doc: "the terminals pulled back by `gap`"). A pin is a fraction in the frame
 * spanned by the route's two ENDPOINTS (`elbowPins.ts`'s `resolvePin`), so
 * building it from the un-pulled-back centres would shift every pin by
 * `WIRE_TERMINAL_GAP` worth of span — small, systematic, and invisible until a
 * block is dragged and the error scales.
 */
export function wireElbowInput(from: TraceTerminalSpec, to: TraceTerminalSpec, pins: readonly ElbowPin[]): ElbowRouteInput {
  return elbowInputFromTerminals({
    from: traceRouteStart(from, WIRE_TERMINAL_GAP),
    to: traceRouteEnd(to, WIRE_TERMINAL_GAP),
    pins,
  });
}

/** One draggable interior segment of an elbow route. `index` addresses the
 *  AUTO route's segment list, which is the index space a pin lives in
 *  (`elbowRouter.ts`'s `routeElbow` header: "pin indices always address the
 *  *auto* route, never the pinned output"). */
export interface WireRouteSegment {
  index: number;
  axis: ElbowAxis;
  /** Midpoint of the segment AS DRAWN, in the wire's own space. */
  x: number;
  y: number;
  /** True when a pin already governs this segment — i.e. the user authored
   *  it. Drives the handle's look and what a double-click does. */
  pinned: boolean;
}

/**
 * The interior segments of a wire's elbow route, as grab targets.
 *
 * Two routes are computed, and the reason is the index space. The pin index
 * must come from the AUTO route (see `WireRouteSegment.index`), but the handle
 * has to sit where the cable is actually DRAWN, which is the pinned route. In
 * the ordinary case — one pin moving one rail — the two polylines have the
 * same segment count and the same axes, so the pinned midpoint is the honest
 * position for the auto index.
 *
 * When they DISAGREE (a pin collapsed a corner, so `dedupe`/`enforceOrthogonal`
 * returned fewer points) the pinned route's segment `i` is no longer the auto
 * route's segment `i`, and using it would put a handle on a segment that
 * re-pins a different rail. So the guard below falls back to the auto
 * midpoint: a handle that may sit off the drawn cable is a cosmetic defect,
 * while a handle that re-pins the wrong rail is a correctness one.
 */
export function wireRouteSegments(from: TraceTerminalSpec, to: TraceTerminalSpec, pins: readonly ElbowPin[]): WireRouteSegment[] {
  const input = wireElbowInput(from, to, pins);
  const auto = routeElbow({ ...input, pins: [] });
  const drawn = pins.length === 0 ? auto : routeElbow(input);
  const congruent =
    drawn.segments.length === auto.segments.length &&
    auto.segments.every((segment, at) => drawn.segments[at].index === segment.index && drawn.segments[at].axis === segment.axis);
  return auto.segments
    .filter((segment) => segment.pinnable)
    .map((segment) => {
      const shown = congruent ? (drawn.segments.find((candidate) => candidate.index === segment.index) ?? segment) : segment;
      return {
        index: segment.index,
        axis: segment.axis,
        x: shown.midpoint.x,
        y: shown.midpoint.y,
        pinned: pins.some((pin) => pin.index === segment.index),
      };
    });
}

/**
 * A drag of segment `index` to `pointer` (wire space) as the whole new pin
 * list, or `null` when that segment cannot be pinned — which is the trunk's
 * own `pinElbowSegment` contract, re-exposed with this wire's frame already
 * applied so no caller has to remember the gap.
 *
 * Deliberately NOT a wrapper that falls back to "the old list": `null` means
 * "nothing happened", and `WireShapeUtil.onHandleDrag` turns that into no
 * shape update at all rather than an identical write per pointer move.
 */
export function wirePinnedRoute(
  from: TraceTerminalSpec,
  to: TraceTerminalSpec,
  pins: readonly ElbowPin[],
  index: number,
  pointer: Point,
): ElbowPin[] | null {
  return pinElbowSegment(wireElbowInput(from, to, pins), index, pointer);
}

/**
 * The same segment released back to AUTOMATIC: the pin list without the pin
 * on `index`, or `null` when there was none to drop — so a caller can tell
 * "un-authored it" from "nothing to do" without comparing arrays.
 *
 * This is the whole of auto ↔ authored in one direction. The other direction
 * is `wirePinnedRoute`; there is no third "routeMode" flag, and deliberately
 * so: a mode field and a pin list can disagree, and then the picture and the
 * badge that describes it are two answers to one question. `pins.length > 0`
 * IS the mode.
 */
export function wireAutomaticRoute(pins: readonly ElbowPin[], index: number): ElbowPin[] | null {
  if (!pins.some((pin) => pin.index === index)) return null;
  return removePin(pins, index);
}

/*
 * RETIRED 2026-09-19 — `wireFanOffset` and `fannedTerminal`.
 *
 * They computed a duplicate cable's perpendicular spread (`fanWires`'
 * offset, applied to the terminal because the elbow router ignores `curve`)
 * so that "two wires between the same two ports" drew as visibly two. Zach
 * saw the result on a real board and ruled it out: "very bad. edges should
 * always leave from the center of the port. I don't like how you have 3
 * edges coming out from different parts of the port… The port only should
 * have 1 connection point in the center. Instead you should show the
 * producer circle that has the number for the number of arrows intersecting
 * at that port." (`docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md`,
 * `Pasted image 20260919115137.png` / `…115156.png`.)
 *
 * Deleted rather than left unused, so nothing can quietly wire them back in:
 * the QUESTION they answered ("how many cables meet at this dot") is still
 * live and still derived from the trunk's `fanWires`, but its answer is now
 * a NUMBER on the port, not a displacement of the cable. Restoring a
 * per-cable offset here would put two disagreeing expressions of one fact on
 * the same board.
 */
