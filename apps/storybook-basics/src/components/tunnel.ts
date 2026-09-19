// src/components/tunnel.ts — ported from SystemSketch, read-only donor at
// /home/bam/systemsketch, revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/blocks/connections/tunnelEdge.ts:1-84` — the whole file:
//     `TUNNEL_STUB_LENGTH`, `TUNNEL_MIN_PATH_LENGTH`, `TunnelDisplayState`,
//     `TunnelDisplayContext`, `tunnelDisplayState`, `TunnelPathPresentation`,
//     `tunnelPathPresentation`, `TunnelVisual`, `tunnelVisualForPoints`.
//     Its module docstring travels verbatim below, as do the per-function
//     WHYs (docs/TRACE-PLAN.md's provenance rule).
//   • `src/blocks/connections/connectionPresentation.ts:78-84,87-104` —
//     `polylineLength` / `pointAtFraction`, which the donor imports. NOT
//     re-ported: this repo already carries both, byte-for-byte equivalent,
//     in `./trace.layout`. Diffed before importing rather than assumed.
//
// WHAT CHANGED in the port, exhaustively — so a future re-sync is a diff
// and not an archaeology exercise:
//
//   1. tldraw's `VecLike` -> the frozen `Point` from `./trace.layout`. The
//      donor used it purely as an {x, y} carrier here (no `.add`, no
//      `.len`), so this is a type substitution, not a behaviour change.
//   2. `TunnelVisual`'s fields were `startVia`/`endVia` in the donor's
//      type but its tldraw renderer reads `tunnelVisual.start` /
//      `.end` (pyblocks `ConnectionShapeUtil.tsx:965-966`). The donor's
//      own TYPE is the one ported; the renderer's spelling was the drifted
//      one. Flagged rather than silently picking a side.
//   3. NOTHING was dropped. Unlike `trace.routing.ts`, this donor file had
//      no Editor lookup and no tldraw import beyond the vector type — it
//      was already pure. `tunnelLayers.ts` is the Editor-bound half, and
//      it went to `src/scene/layers.ts` instead (see that file's header:
//      an Editor is not a thing this repo has, a scene is).
//
// ADDED here, in neither donor, each marked again at its own definition:
//   • `tunnelMouths` and its `polylineSlice` helper — the drawn GEOMETRY of
//     the two stubs, rather than a dash pattern over the full route.
//     This is the one real deviation and it is argued at length at
//     `tunnelMouths` itself. Short version: both donors paint the tunnel by
//     putting `stub hidden stub 0` in `stroke-dasharray`, and in THIS repo
//     `stroke-dasharray` is already spoken for — `traceStrokeStyle`
//     (trace.tsx) uses it for `async`, `delayed` and the marching-ants
//     animation. The donors hit the same collision and resolved it by
//     ternary — pyblocks `ConnectionShapeUtil.tsx:958-963` drops the
//     `pinned` dash whenever a tunnel is active. Shortening the `d`
//     instead leaves the dash channel free, so a tunnelled `async` cable
//     is still visibly async.
//   • `TUNNEL_VIA_RADIUS`, ported by value from pyblocks' CSS
//     (`src/pipeline/index.css:566-570`, `r={4}` at
//     `ConnectionShapeUtil.tsx:966`) so the via is a number a test can
//     assert rather than a stylesheet fact.
//
// Zero imports of a canvas engine, zero DOM, zero React, zero scene:
// points in, points out.

import { pointAtFraction, polylineLength, type Point } from "./trace.layout";

/**
 * PORTED VERBATIM (`tunnelEdge.ts:1-9`), because it is the clearest
 * statement of what a tunnel IS that exists anywhere:
 *
 * A tunnel is still one ordinary connection. Only its idle presentation
 * changes: the long run leaves the surface while a short stub and outlined
 * via remain at both endpoints. Hover and selection preview the complete run
 * without removing those mouths; focusing a layer reveals only that layer and
 * tunnels every other semantic edge.
 */

/** Visible cable between a port and its tunnel via, in page units.
 *  PORTED (`tunnelEdge.ts:16`). */
export const TUNNEL_STUB_LENGTH = 34;

/** Two readable stubs plus a real hidden middle. Shorter cables stay visible.
 *  PORTED (`tunnelEdge.ts:19`). */
export const TUNNEL_MIN_PATH_LENGTH = TUNNEL_STUB_LENGTH * 2 + 16;

/**
 * ADDED (pyblocks `index.css:566-570` + `ConnectionShapeUtil.tsx:966`):
 * the via dot's radius. The donor left this in a stylesheet; here it is a
 * number so `TraceBody` can emit it and a test can measure it.
 */
export const TUNNEL_VIA_RADIUS = 4;

/** PORTED (`tunnelEdge.ts:21`). */
export type TunnelDisplayState = "off" | "hidden" | "preview" | "revealed";

/**
 * PORTED (`tunnelEdge.ts:23-28`).
 *
 * WHY every field is an ARGUMENT rather than something this module reads:
 * `focusedLayer` and `contextFocused` are INTERACTION state, which
 * `ARCHITECTURE.md` makes host-owned ("interaction geometry is host-owned
 * and never travels"). Taking them as parameters is what lets this stay a
 * pure function in the `components` kit — it never learns whether "focused"
 * meant a tldraw selection, a React Flow `selected` flag or a story's
 * `useState`. The donor's own split agrees: membership (`props.tunnel`,
 * `props.tunnelLayer`) lives on the document, focus lives in a view-local
 * atom that "never mutates or dirties the board" (`tunnelLayers.ts:17`).
 */
export interface TunnelDisplayContext {
  /** Is this edge configured as a tunnel at all? Document data. */
  enabled: boolean;
  /** Which layer this edge is on. Document data. `''` means none. */
  layer: string;
  /** Which layer the VIEW is focused on, or null. Host state. */
  focusedLayer: string | null;
  /** Hovered or selected — this edge is the one the pointer is about.
   *  Host state. */
  contextFocused: boolean;
}

/**
 * Resolve the four paint states without changing the semantic connection.
 * Hover/selection previews the complete route but keeps its tunnel mouths.
 * A focused layer alone removes its own mouths and tunnels every other edge.
 *
 * PORTED VERBATIM including this docstring (`tunnelEdge.ts:30-44`). The
 * branch order is load-bearing and is the donor's: a focused layer outranks
 * `enabled`, which is what makes layer focus able to tunnel edges that were
 * never configured as tunnels — the "reveals it and tunnels other edges"
 * half of the feature.
 */
export function tunnelDisplayState(context: TunnelDisplayContext): TunnelDisplayState {
  if (context.focusedLayer) {
    if (context.layer === context.focusedLayer) return "revealed";
    return context.contextFocused ? "preview" : "hidden";
  }
  if (!context.enabled) return "off";
  return context.contextFocused ? "preview" : "hidden";
}

/**
 * Does this display state hide the long run? `hidden` only.
 *
 * ADDED — the donor's renderers spell this inline as
 * `state === 'hidden'` (and pyblocks as the truthiness of `tunnelVisual`).
 * Named here because three call sites need it and because `preview` being
 * NOT-hidden is the single most confusable thing about this feature:
 * preview draws the whole route AND keeps the mouths.
 */
export function tunnelHidesRun(state: TunnelDisplayState): boolean {
  return state === "hidden";
}

/**
 * Does this display state paint the two via dots?
 *
 * ADDED, same reason. `off` and `revealed` have no mouths to mark; `hidden`
 * and `preview` both do — that is the donor's stated contract ("Hover and
 * selection preview the complete run WITHOUT REMOVING those mouths").
 */
export function tunnelShowsVias(state: TunnelDisplayState): boolean {
  return state === "hidden" || state === "preview";
}

/** PORTED (`tunnelEdge.ts:46-51`). */
export interface TunnelPathPresentation {
  /** SVG dash pattern that draws `stub / hidden middle / stub`. */
  dashArray: string;
  /** Arc-length positions of the two visible via dots. */
  viaDistances: readonly [number, number];
}

/**
 * `null` means the route should remain fully visible.
 *
 * PORTED VERBATIM (`tunnelEdge.ts:53-68`).
 *
 * NOTE this repo's own renderer does NOT use `dashArray` — see
 * `tunnelMouths` for why, and this file's header for the collision. It is
 * kept, exported and tested because (a) it is the donor's public contract
 * and the donor's tests are this port's independent oracle, and (b) it
 * remains the right answer for a host that paints one path and has no
 * variant dash to protect. `viaDistances` IS used, by `tunnelMouths`.
 */
export function tunnelPathPresentation(
  pathLength: number,
  revealed: boolean,
): TunnelPathPresentation | null {
  if (revealed || !Number.isFinite(pathLength) || pathLength <= TUNNEL_MIN_PATH_LENGTH) {
    return null;
  }
  const hiddenMiddle = pathLength - TUNNEL_STUB_LENGTH * 2;
  return {
    dashArray: `${TUNNEL_STUB_LENGTH} ${hiddenMiddle} ${TUNNEL_STUB_LENGTH} 0`,
    viaDistances: [TUNNEL_STUB_LENGTH, pathLength - TUNNEL_STUB_LENGTH],
  };
}

/** PORTED (`tunnelEdge.ts:70-74`). See this file's header, change (2), on
 *  the donor's own `startVia`/`start` drift. */
export interface TunnelVisual extends TunnelPathPresentation {
  startVia: Point;
  endVia: Point;
}

/**
 * Resolve the idle stubs and vias on the same routed points the cable paints.
 *
 * PORTED VERBATIM (`tunnelEdge.ts:76-84`).
 */
export function tunnelVisualForPoints(
  points: readonly Point[],
  revealed: boolean,
): TunnelVisual | null {
  const length = polylineLength(points);
  const presentation = tunnelPathPresentation(length, revealed);
  if (!presentation) return null;
  const [startDistance, endDistance] = presentation.viaDistances;
  return {
    ...presentation,
    startVia: pointAtFraction(points, startDistance / length),
    endVia: pointAtFraction(points, endDistance / length),
  };
}

/* ==========================================================================
 * ADDED — the drawn geometry of a tunnel. Nothing below is a port.
 * ========================================================================== */

/**
 * The sub-polyline between two arc-length positions, interior vertices kept.
 *
 * ADDED. Built on the ported `pointAtFraction`/`polylineLength` so a mouth
 * lands on exactly the point the donor's via lands on — the two cannot
 * drift, because the via and the mouth's far end are THE SAME CALL.
 */
function polylineSlice(points: readonly Point[], fromDistance: number, toDistance: number): Point[] {
  const total = polylineLength(points);
  if (total <= 0 || points.length < 2) return points.length ? [points[0]] : [];
  const from = Math.max(0, Math.min(fromDistance, total));
  const to = Math.max(from, Math.min(toDistance, total));
  const sliced: Point[] = [pointAtFraction(points, from / total)];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    travelled += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    // Strictly inside: a vertex sitting exactly on a cut would duplicate
    // the endpoint `pointAtFraction` already produced.
    if (travelled > from && travelled < to) sliced.push(points[index]);
  }
  sliced.push(pointAtFraction(points, to / total));
  return sliced;
}

/** ADDED. The two drawn stubs, plus the vias that terminate them. */
export interface TunnelMouths {
  /** Polyline from the source endpoint to the first via. */
  start: Point[];
  /** Polyline from the second via to the target endpoint. */
  end: Point[];
  startVia: Point;
  endVia: Point;
}

/**
 * The two stubs as REAL POLYLINES, for a renderer that shortens its `d`.
 *
 * WHY this exists rather than just using the donor's `dashArray` — the one
 * deliberate deviation in this port, so it is argued in full:
 *
 *   1. **The dash channel is already occupied here.** `traceStrokeStyle`
 *      (trace.tsx) puts `ASYNC_PACKET_DASHARRAY` on an `async` trace, a
 *      dot pattern on `delayed`, and `DATA_MARCH_DASHARRAY` on an animated
 *      one. An SVG path has exactly one `stroke-dasharray`. Painting the
 *      tunnel with it means a tunnelled async cable silently stops looking
 *      async. Both donors hit this and both lost the same way: pyblocks
 *      `ConnectionShapeUtil.tsx:958-963` is a ternary that drops the
 *      `pinned` dash the moment a tunnel is active. That is not a bug in
 *      the donor — it is what the dash technique costs, paid somewhere
 *      else.
 *   2. **The sketch skin rewrites the path.** The boundary pass's
 *      `sketchTraceD` (`src/skin/sketchAtEdge.ts`, formerly this file's own
 *      `sketchedTracePath` before docs/peps/0001-sketch-skin-at-the-
 *      boundary.md moved it to the edge) jitters interior points, which
 *      CHANGES the arc length; a dash pattern computed from the crisp
 *      length lands in the wrong place on the drawn twin. Slicing geometry
 *      first and sketching each mouth separately is correct by
 *      construction — `flattenPathData` already treats each `M` as a new
 *      run.
 *   3. **It makes the claim measurable.** A dashed tunnel's `d` is
 *      byte-identical to an untunnelled one, so "the long run is hidden"
 *      can only be asserted from a prop. A shortened `d` is measurable on
 *      the mounted element (`getTotalLength()`), which is the difference
 *      between a test and a restatement.
 *
 * What it costs, stated honestly: the renderer needs the route's POINTS,
 * not just its `d`. For `curved` routing those only exist after layout
 * (`Trace` samples them off the mounted path), so a curved tunnel paints
 * its full route for exactly one frame before the mouths appear — the same
 * one-frame cost `Trace` already documents for curve length measurement.
 *
 * Returns `null` on the same conditions as `tunnelPathPresentation`:
 * revealed, non-finite, or too short to have a middle worth hiding.
 */
export function tunnelMouths(points: readonly Point[], revealed: boolean): TunnelMouths | null {
  const visual = tunnelVisualForPoints(points, revealed);
  if (!visual) return null;
  const [startDistance, endDistance] = visual.viaDistances;
  const total = polylineLength(points);
  return {
    start: polylineSlice(points, 0, startDistance),
    end: polylineSlice(points, endDistance, total),
    startVia: visual.startVia,
    endVia: visual.endVia,
  };
}
