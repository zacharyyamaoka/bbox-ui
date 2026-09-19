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

import { traceGeometry } from "@trunk/components/trace";
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
 * The one place they are ALLOWED to disagree, stated rather than hidden:
 *   - a `curved` wire has no vertices (a cubic HAS none, and `traceGeometry`
 *     says so by returning `points: null` rather than inventing some), so its
 *     hit geometry is the chord between its two terminals — up to a few tens
 *     of px away from the drawn bow at its middle;
 * That is now the ONLY one. The duplicate FAN used to be the second — it
 * moved the PAINT of a duplicate wire by up to ±7px perpendicular while the
 * hit polyline stayed put — and it is gone (see this file's own
 * `WIRE_TERMINAL_GAP` note), so paint and hit agree exactly at both ends of
 * every cable. A curve's chord is a paint-vs-hit difference of a few tens of
 * px in the MIDDLE of a 12px-wide hit stroke, and it cannot move an endpoint.
 */
export function wireRoutePoints(from: TraceTerminalSpec, to: TraceTerminalSpec, routing: TraceRouting): Vec[] {
  const geometry = traceGeometry({ from, to, routing, gap: WIRE_TERMINAL_GAP });
  const points = geometry.points ?? [geometry.start, geometry.end];
  // `Polyline2d` needs at least two vertices; a degenerate route (both ends
  // on one point) would otherwise throw inside the engine's segment walk.
  if (points.length < 2) return [new Vec(from.x, from.y), new Vec(to.x, to.y)];
  return points.map((point) => new Vec(point.x, point.y));
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
