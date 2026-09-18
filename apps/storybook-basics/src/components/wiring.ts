// src/components/wiring.ts — the connection record (docs/BLOCK-PORT-EDGES-PLAN.md
// §5, phase B1).
//
// Group B's actual ask: a wire between two ports on two Blocks, with NOTHING
// validating it. "draw as many wires as you want... even multiple wires
// between the same two ports" (Zach, 2026-09-17) — the donor's own refusal
// machinery (`connectionRules.ts`'s `judgeConnection`) is deliberately not
// ported; its own whiteboard preset already stands every rule down ("Every
// rule stood down", `connectionRules.ts:31-32`), which is the precedent D-B2
// cites. So `Wire` is a plain array element and everything below is
// DERIVATION, never validation: which ports read as wired
// (`wiredPortKeys`/`withWiredState`), and how N wires sharing one endpoint
// pair fan apart so they are visibly N (`fanWires`, D-B3).

import type { PortEdgeItem } from "./portEdge";
import type { TraceMarkerEnd, TraceRouting, TraceVariant } from "./trace.layout";

/* ------------------------------------------------------------------ */
/* The record — minimal by decree (plan §5)                            */
/* ------------------------------------------------------------------ */

export interface WireEnd {
  blockId: string;
  portId: string;
}

export interface Wire {
  id: string;
  /** The initiating end — the arrowhead points AT `to` (`Trace`'s own
   *  default `markerEnd: "arrow"`). */
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
}

/* ------------------------------------------------------------------ */
/* Wired state — DERIVED, never stored (§5)                            */
/* ------------------------------------------------------------------ */

/** `${blockId}/${portId}` — one key shared by a wire's own identity and
 *  `WireLayer`'s DOM resolution, so there is exactly one notion of "which
 *  port" anywhere in Group B. */
export function wireEndKey(end: WireEnd): string {
  return `${end.blockId}/${end.portId}`;
}

/** Every port named by at least one wire, from either end. A duplicate wire
 *  between the same two ports adds nothing new to the set — idempotence,
 *  not a bug `fanWires` needs to fix. */
export function wiredPortKeys(wires: readonly Wire[]): Set<string> {
  const keys = new Set<string>();
  for (const wire of wires) {
    keys.add(wireEndKey(wire.from));
    keys.add(wireEndKey(wire.to));
  }
  return keys;
}

/**
 * `items`, with `state: "wired"` forced onto every member the wire list
 * names, and left alone otherwise — a fixture-authored `valueSet` or
 * `received` survives on an unwired port, but wired always wins when wired
 * (§5: "the donor's own cables also override the row paint"). Feeding the
 * result through `BlockPort`'s `edges[side].items` is the whole mechanism:
 * a collapsed simple-view dot already reads "any member wired" off these
 * same per-item states (`blockPort.tsx`'s `collapsedState`), so nothing
 * downstream needs to know a wire exists at all.
 */
export function withWiredState(items: readonly PortEdgeItem[], blockId: string, wired: ReadonlySet<string>): PortEdgeItem[] {
  return items.map((item) => (wired.has(wireEndKey({ blockId, portId: item.id })) ? { ...item, state: "wired" } : item));
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
 *  between these two dots", not which end either one calls `from`. */
function unorderedPairKey(a: WireEnd, b: WireEnd): string {
  const ka = wireEndKey(a);
  const kb = wireEndKey(b);
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
