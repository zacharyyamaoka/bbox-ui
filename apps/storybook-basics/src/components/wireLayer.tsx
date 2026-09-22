"use client";

// src/components/wireLayer.tsx — `WireLayer`: paints a `Wire[]` as `Trace`s
// between two Blocks' real, measured Port dots (docs/BLOCK-PORT-EDGES-PLAN.md
// §5, phase B1). `WireLayerProps` is the frozen contract the plan declared
// before this file existed, so B2's async gallery could code against it
// while this lane was still building it.
//
// WireLayer never invents a point. It resolves each `WireEnd` to a rendered
// dot — `[data-port-id]` inside `[data-block-id]`, falling back to a
// collapsed stand-in dot whose `data-collapsed-ports` names the id (the same
// dot a Block flips to in simple view — no wire data changes, only
// measurement) — reads its centre with `getBoundingClientRect` (app-level
// measurement, the same D8 legality `blockPort.tsx`'s own band-measuring
// already relies on), and hands the two points to `Trace`. An end that
// cannot be found — a wire into a child whose block is not expanded — is
// skipped, not guessed at, and its wire id is stamped onto the layer's own
// `data-unresolved-wires`, matching the donor's rule that only expanded
// blocks can show children.
//
// WHY the layer paints ABOVE every Block (D-B1, reversing the donor's
// `keepConnectionsAtBottom`): a wire attaches to a dot that already sits on
// a wall painting above the block's own card (`blockPort.tsx`'s own D-B1
// note) — a wire painting under the block would have its whole approach to
// that dot swallowed by the card. `pointer-events: none` on the SVG root
// keeps the layer from stealing drag/click from anything under it; `Trace`'s
// own `interactive` hit path is exactly the opt-back-in a host that wants
// one would reach for, left off here on purpose.
//
// ADDED (2026-09-19, lane `fix-edges`): the layer RESOLVES each wire's
// routing against `DEFAULT_TRACE_ROUTING` (`elbow`) instead of forwarding
// `undefined`, and it no longer applies `fanWires`' perpendicular spread to
// anything. Both are Zach's 2026-09-19 ruling — "by default elbow arrows
// should always be used" and "the port only should have 1 connection point
// in the center" — and both are asserted in `EdgeDefaults.stories.tsx`.
//
// ADDED (docs/CONTROL-FLOW-PLAN.md lane D): keep-outs and badges. For a
// wire whose `routing` is `"elbow"`, the layer measures every structural box
// in the fixture once per pass — a region's frame, an arm's row, a block's
// card — and hands the router the ones this wire is NOT part of, which is
// Zach's rule ("data cables that aren't flowing through the branch should
// actively avoid the branch — bypass by going above or below it") turned
// into two numbers per box. Nothing else changes: a wire with any other
// routing is handed exactly the props it was handed before this landed, and
// the badge sibling below is not rendered at all when no wire carries one.
//
// WHY the layer, and not the story, collects the obstacles: `elbow/` is a
// verbatim port whose donor read live tldraw shapes and deliberately left
// its collector behind (`elbow/traceContract.ts`: "there is no obstacle
// COLLECTOR here, by design"). The collector belongs wherever the real
// boxes are measured, and that is here — the one place that already reads
// the rendered DOM and already owns the container's coordinate space.
//
// WHY there is no polarity prop anywhere here (the plan's "8-vs-4"
// resolution): a rail's own `data-edge` attribute already says everything a
// terminal spec needs, because `BlockSide` ("top"|"right"|"bottom"|"left")
// is already the exact same union as `TraceDir` — `from` leaves along the
// FROM port's own wall, `to` arrives travelling AGAINST the TO port's wall
// (`OPPOSITE_DIR`).
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { ElbowRect } from "./elbow/index";
import type { BlockSide } from "./port.layout";
import { portDotRingRadiusPx, usePortVariant } from "../skin/portVariants";
import { Trace, traceLinecapOf, traceRingGapPx, traceRouteEnd, traceRouteStart } from "./trace";
import { TraceBadge } from "./traceBadge";
import { DEFAULT_TRACE_ROUTING, OPPOSITE_DIR, type Point, type TraceDir, type TraceRouting, type TraceTerminalSpec } from "./trace.layout";
import { keepOutsFor, type KeepOutRect, type Wire, type WireEnd } from "./wiring";

/* ------------------------------------------------------------------ */
/* The frozen surface (plan §5)                                        */
/* ------------------------------------------------------------------ */

export interface WireLayerProps {
  wires: Wire[];
  /** The fixture element whose coordinate space the layer fills; the layer
   *  is an absolutely-positioned SVG inset 0 inside it, rendered LAST. */
  containerRef: RefObject<HTMLElement | null>;
  /** Re-measure signal — bump when items/views change. */
  layoutKey?: unknown;
  /**
   * The polyline each wire was DRAWN on, in the container's space, reported
   * by `Trace` itself (sampled for a curve) — the geometry this layer
   * already reads back for its pills, handed on. Added for the region views'
   * wall-crossing markers (`regionViews.layout.ts`'s `wallCrossings`): one
   * derivation of where a cable runs, read back, never re-routed by the
   * caller. Called only when a wire's route actually moved.
   *
   * `null` when a wire this layer had reported STOPS being drawn — it went
   * unresolved (an end lost its dot) or left `wires` altogether. A caller
   * that caches polylines by id must drop the entry: otherwise a derived
   * mark (a wall-crossing circle) freezes on a path nobody paints any more
   * (audit of 7fbf22c, 2026-09-22).
   */
  onWireGeometry?(wireId: string, points: readonly Point[] | null): void;
}

/* ------------------------------------------------------------------ */
/* Resolving a WireEnd to a dot, and a dot to a terminal spec           */
/* ------------------------------------------------------------------ */

/** `[data-port-id]` inside `[data-block-id]` first; a collapsed stand-in dot
 *  whose `data-collapsed-ports` list contains the id otherwise. Both
 *  attributes are stamped by `blockPort.tsx`'s rail fill, never by this
 *  file — `WireLayer` only reads DOM another component already wrote.
 *
 *  WHY every candidate is ownership-checked (`closest("[data-block-id]")
 *  === block`) instead of taking `block.querySelector`'s first match: a
 *  MEMBER rendered inside an expanded Block stamps its own nested
 *  `[data-block-id]`, and a member can legally reuse a port id its parent
 *  also has (`proc`'s own `in` and its member `kid`'s own `in`, both valid,
 *  both distinct dots). A bare descendant query has no way to prefer the
 *  block's OWN dot over a member's, and resolves to whichever is first in
 *  document order — silently wrong, not unresolved, so nothing here ever
 *  flagged it. `reactFlowHost.tsx`'s `dotOwnedBy` already reads this
 *  correctly (nearest `data-block-id` ancestor decides); this is the same
 *  rule, so the two hosts' resolution genuinely agrees, matching what that
 *  file's own comment already claimed. Measured 2026-09-18: an edge into
 *  `proc/in` painted onto `kid`'s dot instead, with
 *  `data-unresolved-wires` still reading `""` — see
 *  `WireLayerOwnership.stories.tsx`. */
function resolveDot(container: HTMLElement, end: WireEnd): HTMLElement | null {
  const block = container.querySelector<HTMLElement>(`[data-block-id="${end.blockId}"]`);
  if (!block) return null;
  for (const candidate of block.querySelectorAll<HTMLElement>(`[data-port-id="${end.portId}"]`)) {
    if (candidate.closest("[data-block-id]") === block) return candidate;
  }
  for (const collapsed of block.querySelectorAll<HTMLElement>("[data-collapsed-ports]")) {
    if (collapsed.closest("[data-block-id]") !== block) continue;
    const members = (collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").map((id) => id.trim());
    if (members.includes(end.portId)) return collapsed;
  }
  return null;
}

/** The `BlockSide` a resolved dot's own rail is mounted on. A straight read,
 *  not a lookup table — `BlockSide` and `TraceDir` are already the same four
 *  strings, so the rail's own `data-edge` attribute IS the face normal. */
function railEdgeOf(dot: HTMLElement): BlockSide | null {
  const edge = dot.closest<HTMLElement>('[data-slot="block-port-rail"]')?.getAttribute("data-edge");
  return edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : null;
}

/** The painted dot a resolved end draws — the `[data-slot="port-dot"]`
 *  inside a labelled rail item, or the resolved element itself when it IS
 *  the dot (a collapsed stand-in wraps a bare `Port`, so it has one too). */
function paintedDotOf(resolved: HTMLElement): Element {
  return resolved.querySelector('[data-slot="port-dot"]') ?? resolved;
}

/**
 * The coordinate space every measured point and box is expressed in: the
 * client-px origin to subtract, then the scale to divide back out.
 *
 * WHY a scale at all, when the layer itself only ever uses 1: the React
 * Flow host routes its edges through this same file (`resolveWires`, below)
 * and its nodes sit under the viewport's `scale(zoom)` transform, so a
 * client-px box there is `zoom` times the flow-space box its edge is drawn
 * in. Dividing the zoom out HERE is what lets both hosts share one
 * derivation instead of the React Flow host re-deriving routes it does not
 * own. At `scale: 1` every division is the identity, so the layer's own
 * numbers are exactly the numbers it produced before this existed.
 */
export interface WireSpace {
  left: number;
  top: number;
  scale: number;
}

/** The layer's own space: the container's padding-box origin, unscaled. */
function containerSpace(container: HTMLElement): WireSpace {
  const rect = container.getBoundingClientRect();
  return { left: rect.left, top: rect.top, scale: 1 };
}

function centreOf(dot: HTMLElement, space: WireSpace): { x: number; y: number } {
  const rect = dot.getBoundingClientRect();
  return { x: (rect.left + rect.width / 2 - space.left) / space.scale, y: (rect.top + rect.height / 2 - space.top) / space.scale };
}

/** One measured box in the container's own coordinate space — the same
 *  subtraction `centreOf` above does, over a whole rect instead of a dot. */
function boxOf(element: HTMLElement, space: WireSpace): ElbowRect {
  const rect = element.getBoundingClientRect();
  return { x: (rect.left - space.left) / space.scale, y: (rect.top - space.top) / space.scale, w: rect.width / space.scale, h: rect.height / space.scale };
}

/**
 * Every structural box in the fixture, keyed by the id that stamped it.
 * One pass, shared by every elbow wire — `keepOutsFor` then subtracts each
 * wire's own ends and containers from this one list.
 *
 * WHY a REGION contributes its frame and never its corner card, although
 * both carry the same id: the corner card is the region's INTERFACE
 * ("everything is a block" — the card is a real Block, with the region's
 * own `data-block-id`), while the frame is its SCOPE. A cable bypassing a
 * loop has to clear the loop, not squeeze between the corner card and the
 * body underneath it. Keyed by id with the frame written first, so the
 * block pass below cannot overwrite it with the card's much smaller box.
 */
function keepOutRectsOf(container: HTMLElement, space: WireSpace): KeepOutRect[] {
  const rects: KeepOutRect[] = [];
  const seen = new Set<string>();
  const add = (id: string | null, element: HTMLElement) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    rects.push({ id, ...boxOf(element, space) });
  };
  for (const frame of container.querySelectorAll<HTMLElement>('[data-slot="region-frame"][data-region-id]')) {
    add(frame.getAttribute("data-region-id"), frame);
  }
  // An OPAQUE region has no frame — its root wraps only the card — so the
  // root's own box is the honest keep-out for that id.
  for (const region of container.querySelectorAll<HTMLElement>("[data-region-id]")) {
    add(region.getAttribute("data-region-id"), region);
  }
  for (const arm of container.querySelectorAll<HTMLElement>('[data-slot="region-arm"][data-arm-id]')) {
    add(arm.getAttribute("data-arm-id"), arm);
  }
  for (const block of container.querySelectorAll<HTMLElement>("[data-block-id]")) {
    add(block.getAttribute("data-block-id"), block);
  }
  return rects;
}

export interface ResolvedWire {
  wire: Wire;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  /** The wire's own routing, or {@link DEFAULT_TRACE_ROUTING} — resolved
   *  HERE and not left to `Trace`'s own default, because the layer has to
   *  know the answer one step earlier than `Trace` does: it is what decides
   *  whether this pass collects keep-outs at all. Leaving `undefined` to
   *  fall through to `Trace` drew an elbow with an EMPTY obstacle list, so
   *  a defaulted cable ignored every region frame on the board while an
   *  explicitly-elbow one respected them — two behaviours for one picture. */
  routing: TraceRouting;
  /** Elbow only, and `undefined` for every other routing so `Trace` is
   *  handed the identical prop set it was handed before lane D. */
  obstacles?: ElbowRect[];
  fromBox?: ElbowRect | null;
  toBox?: ElbowRect | null;
}

export interface ResolvedWires {
  resolved: ResolvedWire[];
  unresolvedIds: string[];
}

const EMPTY_STATE: ResolvedWires = { resolved: [], unresolvedIds: [] };

/**
 * Every wire resolved to its two terminal specs, its routing, and — for an
 * elbow — its keep-outs and endpoint boxes: everything `Trace` needs, read
 * off the rendered DOM under `container`, in `space` (default: the
 * container's own, unscaled).
 *
 * Exported for the React Flow host (`hosts/reactFlowHost.tsx`'s kit edge),
 * which hands its viewport element and zoom as `container`/`space` and
 * paints each result through {@link ResolvedWireTrace}. One derivation,
 * two hosts — so a cable routes identically on the static DOM canvas and
 * on its draggable React Flow twin (docs/peps/0005).
 */
export function resolveWires(container: HTMLElement, wires: readonly Wire[], space: WireSpace = containerSpace(container)): ResolvedWires {
  const resolved: ResolvedWire[] = [];
  const unresolvedIds: string[] = [];
  // Measured lazily: a fixture with no elbow wire at all pays nothing, and
  // a fixture with twenty pays once.
  let rects: KeepOutRect[] | null = null;

  wires.forEach((wire) => {
    const fromDot = resolveDot(container, wire.from);
    const toDot = resolveDot(container, wire.to);
    const fromEdge = fromDot ? railEdgeOf(fromDot) : null;
    const toEdge = toDot ? railEdgeOf(toDot) : null;
    if (!fromDot || !toDot || !fromEdge || !toEdge) {
      unresolvedIds.push(wire.id);
      return;
    }
    // ONE ATTACH POINT, and it is the dot's measured centre — no per-cable
    // offset, ever. Zach, 2026-09-19: "edges should always leave from the
    // center of the port… The port only should have 1 connection point in
    // the center. Instead you should show the producer circle that has the
    // number for the number of arrows intersecting at that port."
    // So `fanWires`' perpendicular spread is no longer applied to paint
    // anywhere (it survives in `wiring.ts` as the GROUPING the producer
    // count is derived from — the fact stays, only its expression moved
    // from geometry to a badge). Two cables sharing a pair therefore draw
    // on top of each other on the stub; that overlap is the accepted cost
    // of the rule, not an oversight.
    //
    // The route then starts and ends ON each dot's painted ring, pulled back
    // HERE by that dot's own measured radius (`gap={0}` below). Zach,
    // 2026-09-22: "make the trace end exactly at the port … right now there
    // is this spacing which is not desirable!" — the spacing was `Trace`'s
    // default 16px `TRACE_TERMINAL_GAP`, sized for its own r=9 glyph plus a
    // chevron, landing ~10px short of a real 5.5-6px dot. Per END rather
    // than one `gap` for both, because the two dots need not match (a
    // collapsed stand-in, an `md` function port, a pinned variant).
    const from: TraceTerminalSpec = traceRouteStart(
      { ...centreOf(fromDot, space), dir: fromEdge as TraceDir },
      // Per the wire's own cap: a butt-capped async dash ends ON the ring,
      // a round cap half a stroke short of it (`traceRingGapPx`'s doc).
      traceRingGapPx(portDotRingRadiusPx(paintedDotOf(fromDot)), undefined, traceLinecapOf(wire.variant)),
    );
    const to: TraceTerminalSpec = traceRouteEnd(
      { ...centreOf(toDot, space), dir: OPPOSITE_DIR[toEdge as TraceDir] },
      traceRingGapPx(portDotRingRadiusPx(paintedDotOf(toDot)), undefined, traceLinecapOf(wire.variant)),
    );
    const routing = wire.routing ?? DEFAULT_TRACE_ROUTING;
    if (routing !== "elbow") {
      resolved.push({ wire, from, to, routing });
      return;
    }
    rects ??= keepOutRectsOf(container, space);
    // WHY the endpoint boxes are the `[data-block-id]` roots and not the
    // same rects the keep-out list carries: the router treats them
    // differently on purpose (`elbow/collisionRouting.ts`'s
    // `routeClearsInput` — the first and last leg may cross their OWN card
    // while leaving through the bound port, no later segment may re-enter
    // it), and that asymmetry is what makes a self-loop leave its block,
    // travel around the outside and come back in on the far wall instead
    // of cutting straight across the card it belongs to. A region end
    // resolves to its corner card here, which is correct for the same
    // reason: the dot is ON the card, so the card is the box the first leg
    // has to escape — the frame is already in the keep-out list above.
    const fromBlock = fromDot.closest<HTMLElement>("[data-block-id]");
    const toBlock = toDot.closest<HTMLElement>("[data-block-id]");
    resolved.push({
      wire,
      from,
      to,
      routing,
      obstacles: keepOutsFor(wire, rects),
      fromBox: fromBlock ? boxOf(fromBlock, space) : null,
      toBox: toBlock ? boxOf(toBlock, space) : null,
    });
  });

  return { resolved, unresolvedIds };
}

/** Same polyline? A badge only needs re-anchoring when the route actually
 *  moved, and `Trace` reports its geometry on every re-route — including
 *  the ones that land on identical numbers after a no-op re-measure. */
function samePoints(a: readonly Point[] | undefined, b: readonly Point[]): boolean {
  return a !== undefined && a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

/* ------------------------------------------------------------------ */
/* One resolved wire, painted — shared by every host that routes here   */
/* ------------------------------------------------------------------ */

export interface ResolvedWireTraceProps {
  route: ResolvedWire;
  /** The polyline `Trace` actually drew, in the route's own space. */
  onGeometry?(wireId: string, points: readonly Point[] | null): void;
}

/**
 * The exact `Trace` the layer paints for one {@link ResolvedWire}. Split out
 * of `WireLayer`'s own render so the React Flow host's custom edge paints
 * the SAME element with the SAME props — ring-flush ends (`gap={0}` over
 * the route's own pulled-back terminals), no terminal glyphs, the kit's
 * `markerEnd` default — rather than a second copy that drifts.
 */
export function ResolvedWireTrace({ route, onGeometry }: ResolvedWireTraceProps) {
  const { wire, from, to, routing, obstacles, fromBox, toBox } = route;
  return (
    // `id` is destructured out of both `Trace` and `TraceBody` (it feeds
    // the MARKER's own id, `safeElementId("bbox-trace-head", id)`) and
    // never lands on either `<g>` as a DOM attribute — so a wrapping
    // group is the only way a story can find ONE wire's rendered trace
    // among its siblings. Purely additive: `Trace` itself is untouched.
    //
    // `data-wire-from` states, in the DOM, which port a wire LEFT.
    // That is what lets an assertion about a control MARK be negative
    // and still be checkable — "no wire originates at `<block>/break`"
    // (`controlFlow.acceptance.ts`'s `expectControlMark`) — because a
    // mark is a badge on the block and never an endpoint, and the only
    // honest way to prove an absence is to enumerate what IS there.
    <g data-wire-id={wire.id} data-wire-from={`${wire.from.blockId}/${wire.from.portId}`}>
      <Trace
        id={wire.id}
        from={from}
        to={to}
        routing={routing}
        variant={wire.variant ?? "data"}
        color={wire.color}
        markerEnd={wire.markerEnd}
        terminals={false}
        gap={0}
        obstacles={obstacles}
        fromBox={fromBox}
        toBox={toBox}
        onGeometry={(geometry) => onGeometry?.(wire.id, geometry.points)}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* WireLayer                                                            */
/* ------------------------------------------------------------------ */

export function WireLayer({ wires, containerRef, layoutKey, onWireGeometry }: WireLayerProps) {
  const [state, setState] = useState<ResolvedWires>(EMPTY_STATE);
  // The port style in force, subscribed through the SAME store every `Port`
  // re-renders from — so a live switch commits the new dots and re-runs the
  // measurement below in one pass. Without it the ring pull-back stayed at
  // the OLD variant's radius until something else moved (2026-09-22 audit).
  const portVariantId = usePortVariant().id;
  // In a ref so a caller's inline arrow does not re-identify
  // `reportGeometry` (which would re-render every `Trace`).
  const onWireGeometryRef = useRef(onWireGeometry);
  onWireGeometryRef.current = onWireGeometry;
  const reportedRef = useRef<Record<string, readonly Point[]>>({});
  // The polyline each badged wire rides, reported by `Trace` itself rather
  // than re-routed here — one derivation, read back (the same rule
  // `trace.tsx` states for its own `sides`). Kept OUT of `state` on
  // purpose: writing it there would give `state.resolved` a new identity on
  // every geometry report, `Trace` would see fresh `obstacles`/`fromBox`
  // objects, re-route, report again, and the layer would never settle.
  const [badgePoints, setBadgePoints] = useState<Record<string, readonly Point[]>>({});

  const reportGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    if (!points || points.length < 2) return;
    setBadgePoints((previous) => (samePoints(previous[wireId], points) ? previous : { ...previous, [wireId]: points }));
    // Outside the updater (React may run an updater twice): its own
    // last-seen map, the same "only when the route moved" guard.
    if (!samePoints(reportedRef.current[wireId], points)) {
      reportedRef.current[wireId] = points;
      onWireGeometryRef.current?.(wireId, points);
    }
  }, []);

  // Retract every reported polyline whose wire is no longer drawn. After the
  // children's own layout effects on purpose: a wire resolved in this commit
  // has already reported through its `Trace`, so it is never retracted here.
  useLayoutEffect(() => {
    const drawn = new Set(state.resolved.map(({ wire }) => wire.id));
    for (const wireId of Object.keys(reportedRef.current)) {
      if (drawn.has(wireId)) continue;
      delete reportedRef.current[wireId];
      onWireGeometryRef.current?.(wireId, null);
    }
  }, [state]);

  // …and every one of them when the layer itself goes (re-judge of d97f5ec):
  // a caller that caches polylines by id — the wall-crossing glue — can
  // outlive a conditionally-mounted layer, and would otherwise keep every
  // last route of a layer that no longer exists.
  useLayoutEffect(
    () => () => {
      for (const wireId of Object.keys(reportedRef.current)) onWireGeometryRef.current?.(wireId, null);
      reportedRef.current = {};
    },
    [],
  );

  useLayoutEffect(() => {
    let cancelled = false;
    let frame: number | null = null;
    let observer: ResizeObserver | null = null;

    // Two F1-class races stack here (`BlockPortLane.stories.tsx` names the
    // first for the multi-line lane, and the same reasoning extends to the
    // second):
    //
    //  1. `containerRef` is owned by WHOEVER renders the fixture element
    //     (a story's own bench div, say) and WireLayer only reads it — a
    //     CHILD's layout effect can run before its PARENT's host ref has
    //     actually attached, so `containerRef.current` can be `null` on
    //     this very first pass even though the div is about to exist.
    //  2. Once the container itself exists, a `BlockPort`'s own rails (and
    //     every `[data-port-id]`/`[data-collapsed-ports]` dot on them)
    //     STILL do not exist on that same commit — they wait for
    //     `useBlockBands`'s own layout effect to measure the Block first,
    //     landing one render pass later. A `ResizeObserver` on the
    //     container does not catch it: adding position:absolute rails does
    //     not change the container's own box.
    //
    // `attach` retries every frame until the ref is real, then measures
    // immediately AND schedules one more deferred pass for (2), on top of
    // the steady-state `ResizeObserver`.
    const attach = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        frame = requestAnimationFrame(attach);
        return;
      }
      const measure = () => setState(resolveWires(container, wires));
      measure();
      frame = requestAnimationFrame(measure);
      observer = new ResizeObserver(measure);
      observer.observe(container);
    };
    attach();

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // `wires` and `layoutKey` ARE the re-measure signal (plan §5): a caller
    // bumps `layoutKey` on anything that can move a dot without resizing the
    // container itself — a Block's view flipping between simple/port/
    // expanded, say, which changes where dots sit but not necessarily the
    // fixture's own outer box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, wires, layoutKey, portVariantId]);

  const badged = state.resolved.filter(({ wire }) => wire.badge !== undefined && badgePoints[wire.id]);

  return (
    <>
      <svg
        data-slot="wire-layer"
        data-unresolved-wires={state.unresolvedIds.join(",")}
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      >
        {state.resolved.map((route) => (
          <ResolvedWireTrace key={route.wire.id} route={route} onGeometry={reportGeometry} />
        ))}
      </svg>
      {/* WHY the pills live in a DOM sibling of the svg rather than inside
          it: `TraceBadge` renders the stock shadcn `Badge`, a Tailwind-styled
          `<span>` (`traceBadge.tsx`'s own header — "WHY DOM and not SVG"), so
          it has to be laid out by CSS, not by SVG user space. Its contract is
          already "an absolutely-positioned sibling of the svg, whose `points`
          are read in the offsetParent's padding box" — this element IS that
          offsetParent, inset to the same box the svg fills, so the polyline
          `Trace` reports needs no conversion at all.

          Rendered only when something is actually badged: a fixture with no
          pills keeps the DOM it had before lane D, down to the node count
          every existing story's `getBoundingClientRect` reads. */}
      {badged.length > 0 && (
        <div data-slot="wire-badges" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {badged.map(({ wire }) => (
            // WHY the OPAQUE stock variant (`TraceBadge`'s own default)
            // rather than the see-through `outline` the lane brief named:
            // the pill sits ON the cable it describes, so a transparent one
            // is read THROUGH by that cable — measured on `BadgeWithSeed`,
            // where the delayed variant's dots ran between the characters
            // of "z⁻¹ = estimate()". An opaque chip occludes the line the
            // same way `trace.crossing.ts`'s casing occludes a crossing
            // cable. It has to come from the stock Badge's own vocabulary
            // and not from a backdrop written here: `skin.test.ts`'s S4
            // coverage list holds this file to "paints nothing of its own —
            // no border, background, box-shadow or stroke", and it is right
            // to.
            <div key={wire.id} data-wire-id={wire.id}>
              <TraceBadge points={badgePoints[wire.id]} t={0.5} value={wire.badge!} size="sm" variant="secondary" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
