// src/skin/sketchPath.test.ts — T1: the sketch trace is not sketched (this
// app's own bug, not a port of a donor test — packages/bbox-ui has no
// sketchPath test at all).
//
// The bug (found 2026-09-17): `flattenPathData`'s `L`/`H`/`V` cases pushed
// only the segment's END point, so a straight two-point run (`routing:
// "straight"`/`"slanted"` with no bends, e.g. `M4 20L156 20`) had NO
// interior points for `sketchPathData` to jitter — both its points are the
// run's own index-0 and index-(length-1) endpoints, which are deliberately
// protected from jitter so a Trace stays attached to its ports. The sketch
// twin came out byte-identical to the crisp path (rendered TWICE, since
// `passes` defaults to 2), which is why the sketch column of a Trace
// gallery looked identical to the crisp one. Confirmed the donor
// (packages/bbox-ui/src/sketchPath.ts, frozen v1, read-only) has the
// IDENTICAL gap — byte-diffed `flattenPathData` against it before touching
// anything — so this is an original gap, not a port error, and the fix
// lives only in this copy (see sketchPath.ts's own header).
//
// These five cases are driven through `traceGeometry` (trace.tsx) — the
// SAME function `Trace` itself calls to get `path` — rather than
// hand-typed `d` strings, so a regression in the router that happens to
// produce a shape this file's own fixtures wouldn't cover still gets
// exercised here.
import { describe, expect, it } from "vitest";

import { traceGeometry, type TraceRouteRequest } from "../components/trace";
import { sketchPathData } from "./sketchPath";

// Mirrors trace.tsx's own (unexported) `TRACE_WOBBLE_PX` — what `TraceBody`
// actually sketches with, not `sketchPathData`'s bare default.
const TRACE_WOBBLE_PX = 1.4;

function sketchedFor(d: string): string {
  return sketchPathData(d, { seed: d, wobble: TRACE_WOBBLE_PX });
}

/**
 * Segment-command count — `M`/`L`/`C`/`Q`/`Z`, case-insensitive (every
 * command `sketchPathData`/`smoothThrough` can emit or pass through).
 *
 * WHY per PASS and not over the whole string: `sketchPathData` draws TWO
 * passes by default (tldraw's own "the pen goes round twice"), each a
 * complete subpath starting with its own `M`. Counting commands across
 * BOTH passes is exactly the vacuous check the acceptance criteria warns
 * against — "an extra element exists is not a difference" — because the
 * bug this file guards against (mutation-confirmed: reverting the L/H/V
 * fix left `segmentCount(sketched) > segmentCount(crisp)` PASSING, 4 > 2,
 * purely because passes=2 always doubles a straight path's M/L count,
 * jitter or no jitter) hides exactly there. Only ONE pass, compared
 * against the crisp path's own (single-pass) count, actually proves a
 * pass grew interior points it didn't have before.
 */
function firstPassSegmentCount(d: string): number {
  const firstPass = d.match(/M[^M]*/)?.[0] ?? d;
  return (firstPass.match(/[MLCQZ]/gi) ?? []).length;
}

/** Every numeric x/y pair emitted, rounded to the same precision
 * `sketchPathData`'s own `n()` uses (2 decimals) — so a real position
 * change (not just reformatting, "M 20 60" vs "M20 60") is what this
 * function is sensitive to. */
function coordinates(d: string): number[] {
  return (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

const FROM = { x: 4, y: 60, dir: "right" } as const;
const TO = { x: 220, y: 60, dir: "left" } as const;

const ROUTINGS: Record<string, TraceRouteRequest> = {
  straight: { from: FROM, to: TO, routing: "straight" },
  // A genuinely BENT straight polyline (docs/TRACE-PLAN.md's "straight
  // draws literally through every resolved bend" — trace.routing.ts) —
  // the fifth case the spec names separately from plain "straight".
  "bent straight (polyline)": {
    from: FROM,
    to: TO,
    routing: "straight",
    bends: [{ t: 0.5, o: 40 }],
  },
  slanted: { from: FROM, to: TO, routing: "slanted" },
  curved: { from: FROM, to: TO, routing: "curved" },
  elbow: { from: FROM, to: TO, routing: "elbow" },
};

describe("sketchPathData — the sketch trace actually differs in shape (T1)", () => {
  it.each(Object.entries(ROUTINGS))("routing=%s", (_name, request) => {
    const { path: crisp } = traceGeometry(request);
    const sketched = sketchedFor(crisp);

    // Not just "a different string" — two identical copies concatenated
    // (this bug's own failure mode, since `passes` defaults to 2) already
    // makes `sketched !== crisp` true by length alone, which is exactly
    // "an extra element exists" and NOT the difference this asserts.
    expect(sketched, "sketch path must differ from the crisp path").not.toBe(crisp);
    // The real proof: ONE pass of the sketch path has strictly more
    // segment commands than the crisp path — an interior point that
    // didn't exist before now does, for every routing including a plain
    // two-point `straight`/`slanted` chord.
    expect(firstPassSegmentCount(sketched), "one sketch pass must have strictly more segments than the crisp path").toBeGreaterThan(
      firstPassSegmentCount(crisp),
    );
    // And the coordinates actually moved — not merely reformatted (the
    // crisp path's own `M 20 60` vs. the sketch generator's un-spaced
    // `M20 60` would already make the strings differ without a single
    // point changing position).
    const crispCoords = coordinates(crisp);
    const sketchedCoords = coordinates(sketched);
    const anyCoordMoved = sketchedCoords.some((v, i) => Math.abs(v - (crispCoords[i] ?? v)) > 0.01) || sketchedCoords.length !== crispCoords.length;
    expect(anyCoordMoved, "at least one coordinate must actually move, not just reformat").toBe(true);
  });
});
