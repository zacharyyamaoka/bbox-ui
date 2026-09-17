// src/components/trace.handles.ts — ADDED, no donor as code. The MODEL is
// the donor's `virtual`/`vertex` + `grow:` idea, read-only at
// /home/bam/systemsketch rev 10748b8c
// (`src/blocks/connections/ConnectionShapeUtil.tsx:556-631`, `getHandles`):
// two terminals plus a `virtual` handle sitting on the midpoint of every
// segment until dragged, at which point it "grows" into a real vertex. D3
// of docs/TRACE-CONTROL-POINTS-PLAN.md is that idea over this repo's own
// `TraceBend` polyline instead of a tldraw shape's segments.
//
// WHAT CHANGED, exhaustively: there is no `TLHandle`, no `IndexKey`, no
// pill/delay handle (that is a different concern, not this plan's). The
// donor gates an END segment's grow handle on `ELBOW_END_HANDLE_MIN_LENGTH`
// so a stubby leg does not overlap the port dot; the same reason, restated
// here as `minVirtualSegmentPx`, gates EVERY segment (not just the ends) —
// a straight trace has no fixed "end leg" the way an authored elbow route
// does, so the guard has to apply uniformly.
//
// Pure function, no React, no DOM — this is where the derivation is
// unit-tested (`trace.handles.test.ts`); `traceEditor.tsx` is the only
// caller that mounts it.

import type { Point } from "./trace.layout";

export type TraceHandleKind = "terminal" | "bend" | "virtual";

export interface TraceHandle {
  /** `"start"` | `"end"` | `bend:${i}` | `virtual:${i}`. */
  id: string;
  kind: TraceHandleKind;
  x: number;
  y: number;
  /** bend: its index in `bends`. virtual: the index a NEW bend would take
   * (dragging it inserts at exactly this position in the `bends` array —
   * see `trace.routing.ts`'s `TraceRouteOptions.bends` doc for the
   * array-order contract this matches). */
  index: number;
}

/** Donor's `ELBOW_END_HANDLE_MIN_LENGTH` reason, restated: "a stubby end
 * segment leaves no room between the port and the first corner; a handle
 * there would overlap the port dot." */
const DEFAULT_MIN_VIRTUAL_SEGMENT_PX = 24;

/**
 * Given the resolved polyline `[start, ...bends, end]`, the handles a
 * `straight` trace's editor should offer: a `terminal` at each end, a
 * `bend` at every interior vertex, and a `virtual` at the midpoint of every
 * segment long enough to hold one.
 */
export function traceHandles(
  points: readonly Point[],
  options: { minVirtualSegmentPx?: number } = {},
): TraceHandle[] {
  const minVirtualSegmentPx = options.minVirtualSegmentPx ?? DEFAULT_MIN_VIRTUAL_SEGMENT_PX;
  if (points.length < 2) return [];

  const handles: TraceHandle[] = [
    { id: "start", kind: "terminal", x: points[0].x, y: points[0].y, index: 0 },
  ];

  for (let i = 1; i < points.length - 1; i += 1) {
    handles.push({ id: `bend:${i - 1}`, kind: "bend", x: points[i].x, y: points[i].y, index: i - 1 });
  }

  const last = points[points.length - 1];
  handles.push({ id: "end", kind: "terminal", x: last.x, y: last.y, index: 0 });

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
    if (segmentLength < minVirtualSegmentPx) continue;
    handles.push({
      id: `virtual:${i}`,
      kind: "virtual",
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      index: i,
    });
  }

  return handles;
}
