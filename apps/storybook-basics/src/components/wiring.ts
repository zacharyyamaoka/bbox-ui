// src/components/wiring.ts — `WireLayer`'s paint vocabulary: what a wire
// LOOKS like between two rendered dots, plus how N wires sharing one
// endpoint pair fan apart so they are visibly N (`fanWires`, D-B3).
//
// This file used to be a third thing as well: the connection RECORD, with
// its own derivation (`wiredPortKeys`). That role is absorbed — the record
// is `scene.ts`'s `SceneEdge` (source/target/sourceHandle/targetHandle,
// React Flow's own vocabulary), the derivation is `scene.ts`'s
// `wiredPorts`, and the item-state mapping moved to the adapter
// (`sceneWires.ts`'s `withWiredState`). Deleted here, deliberately:
// `wireEndKey`, `wiredPortKeys`, `withWiredState` — so there is exactly
// ONE model and this module cannot quietly grow back into a second one.
//
// What remains is view-kit only, and this file still imports NOTHING from
// `src/scene/` — `Wire` is a paint instruction a host DERIVES from a scene
// (`sceneWires.ts`), never a record a host authors as its source of truth.
// `WireLayer` (a component) imports this module, and the components-never-
// import-the-scene wall holds precisely because the scene types stay out
// of here, even transitively.
//
// The permission-free stance is unchanged (Zach, 2026-09-17: "draw as many
// wires as you want... even multiple wires between the same two ports") —
// nothing here validates; everything is derivation over whatever list it
// is handed.

import type { TraceMarkerEnd, TraceRouting, TraceVariant } from "./trace.layout";

/* ------------------------------------------------------------------ */
/* The paint instruction                                               */
/* ------------------------------------------------------------------ */

export interface WireEnd {
  blockId: string;
  portId: string;
}

export interface Wire {
  id: string;
  /** The initiating end — the arrowhead points AT `to` (`Trace`'s own
   *  default `markerEnd: "arrow"`). A scene edge's source/target map to
   *  from/to with the arrow direction preserved (`sceneWires.ts`). */
  from: WireEnd;
  to: WireEnd;
  /** Default `"data"`; the async gallery passes `"async"` (D-B6's reading
   *  of the donor's "new wires default to async", `asyncRegionModel.ts`). */
  variant?: TraceVariant;
  /** Default is `Trace`'s own default (`"curved"`). */
  routing?: TraceRouting;
  /** Default is `Trace`'s own default (`"arrow"`). */
  markerEnd?: TraceMarkerEnd;
  color?: string;
  /**
   * Block/region/arm ids this wire is ALLOWED to pass through — the
   * containers its two ends live inside (a host derives it from
   * `ancestorsOf`; `sceneWires.ts`). `WireLayer` treats every other
   * measured box as a keep-out when `routing === "elbow"`: that is the
   * whole of "cables that do not flow through a region must route around
   * it — bypass above or below" (docs/CONTROL-FLOW-PLAN.md, lane D).
   */
  through?: readonly string[];
  /** Text of a pill riding the wire (`TraceBadge`): `z⁻¹` on a delayed
   *  cable, `mut` on an effect cable. Absent = no pill. */
  badge?: string;
}

/* ------------------------------------------------------------------ */
/* Keep-outs (lane D) — CONTRACT STUB, frozen by wiring.test.ts         */
/* ------------------------------------------------------------------ */

/** A measured box a wire may have to avoid, keyed by the id that stamped it
 *  (`data-block-id`, `data-region-id` or `data-arm-id`). Container-local px. */
export interface KeepOutRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The obstacles ONE wire routes around: every rect except its own two
 * endpoint blocks and everything in `through`. Input order, always a new
 * array, `{x, y, w, h}` only (an `ElbowRect`) — the endpoint boxes travel
 * separately as the router's `fromBox`/`toBox`.
 */
export function keepOutsFor(
  wire: Pick<Wire, "from" | "to" | "through">,
  rects: readonly KeepOutRect[],
): { x: number; y: number; w: number; h: number }[] {
  // WHY the exclusion set is exactly "my two ends plus `through`", and
  // nothing cleverer: bypass means AVOID EVERYTHING EXCEPT what I am part
  // of. A cable into a block sitting in a branch's arm may enter that
  // region's frame and that one arm — both are in `through`, because both
  // are ancestors of an end — and it may not enter a SIBLING arm, which is
  // not. That is DRAKON's "an arm is entered only from the shared area"
  // made mechanical: the rule is a set membership over measured boxes, not
  // a special case per container kind, so a region, an arm and a plain
  // block are all treated identically here and nothing has to know which
  // is which. The tempting alternative — "skip any rect that CONTAINS an
  // endpoint" — reads equivalent and is not: a sibling arm that happens to
  // overlap an endpoint's box geometrically would be silently entered,
  // and a container the wire genuinely crosses but whose measured rect has
  // not settled yet would be silently kept out.
  const mine = new Set<string>([wire.from.blockId, wire.to.blockId, ...(wire.through ?? [])]);
  // A NEW array of NEW `{x, y, w, h}` objects, in `rects`' own order: the
  // id is the collector's bookkeeping, not the router's vocabulary
  // (`ElbowRoutingObstacle` has no id), and a caller that got the input
  // array back could mutate one layer's measurements from another's.
  return rects
    .filter((rect) => !mine.has(rect.id))
    .map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/* ------------------------------------------------------------------ */
/* Duplicate fan (D-B3)                                                */
/* ------------------------------------------------------------------ */

/** Perpendicular spread between duplicate wires sharing one endpoint pair —
 *  otherwise "two wires between the same two ports" draws as one line drawn
 *  twice and the gallery shows nothing. */
export const DUPLICATE_FAN_PX = 14;

/** Unordered: a wire and a same-pair wire drawn the other way (`a→b` beside
 *  `b→a`) still fan against each other — the visible fact is "N wires
 *  between these two dots", not which end either one calls `from`. The same
 *  rule the scene kit's `duplicateEdges` lint applies, restated over the
 *  paint vocabulary, so the lint and the drawing can never disagree about
 *  what counts as a duplicate. */
function unorderedPairKey(a: WireEnd, b: WireEnd): string {
  const ka = `${a.blockId}/${a.portId}`;
  const kb = `${b.blockId}/${b.portId}`;
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export interface WireFan {
  /** This wire's 0-based rank among the others sharing its endpoint pair. */
  index: number;
  /** How many wires share this endpoint pair, this one included. */
  count: number;
  /** The `curve` offset `Trace` already understands (`trace.routing.ts`'s
   *  `TraceCurve`) — `{dx: 0, dy: ...}` per plan §5, centred on 0 so a lone
   *  wire between a pair fans by nothing at all. */
  offset: { dx: number; dy: number };
}

/** One `WireFan` per wire, in `wires`' own order, so `WireLayer` can zip it
 *  straight back onto the same array instead of re-grouping a second time. */
export function fanWires(wires: readonly Wire[]): WireFan[] {
  const idsByPair = new Map<string, string[]>();
  for (const wire of wires) {
    const key = unorderedPairKey(wire.from, wire.to);
    const ids = idsByPair.get(key);
    if (ids) ids.push(wire.id);
    else idsByPair.set(key, [wire.id]);
  }
  const rankById = new Map<string, { index: number; count: number }>();
  for (const ids of idsByPair.values()) {
    ids.forEach((id, index) => rankById.set(id, { index, count: ids.length }));
  }
  return wires.map((wire) => {
    const rank = rankById.get(wire.id)!;
    const dy = (rank.index - (rank.count - 1) / 2) * DUPLICATE_FAN_PX;
    return { index: rank.index, count: rank.count, offset: { dx: 0, dy } };
  });
}
