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
// WHY there is no polarity prop anywhere here (the plan's "8-vs-4"
// resolution): a rail's own `data-edge` attribute already says everything a
// terminal spec needs, because `BlockSide` ("top"|"right"|"bottom"|"left")
// is already the exact same union as `TraceDir` — `from` leaves along the
// FROM port's own wall, `to` arrives travelling AGAINST the TO port's wall
// (`OPPOSITE_DIR`).
import { useLayoutEffect, useState, type RefObject } from "react";

import type { BlockSide } from "./port.layout";
import { Trace } from "./trace";
import { OPPOSITE_DIR, type TraceDir, type TraceTerminalSpec } from "./trace.layout";
import { fanWires, type Wire, type WireEnd } from "./wiring";

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

function centreOf(dot: HTMLElement, containerRect: DOMRect): { x: number; y: number } {
  const rect = dot.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - containerRect.left, y: rect.top + rect.height / 2 - containerRect.top };
}

interface ResolvedWire {
  wire: Wire;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  curve: { dx: number; dy: number };
}

interface WireLayerState {
  resolved: ResolvedWire[];
  unresolvedIds: string[];
}

const EMPTY_STATE: WireLayerState = { resolved: [], unresolvedIds: [] };

function computeState(container: HTMLElement, wires: readonly Wire[]): WireLayerState {
  const containerRect = container.getBoundingClientRect();
  const fans = fanWires(wires);
  const resolved: ResolvedWire[] = [];
  const unresolvedIds: string[] = [];

  wires.forEach((wire, i) => {
    const fromDot = resolveDot(container, wire.from);
    const toDot = resolveDot(container, wire.to);
    const fromEdge = fromDot ? railEdgeOf(fromDot) : null;
    const toEdge = toDot ? railEdgeOf(toDot) : null;
    if (!fromDot || !toDot || !fromEdge || !toEdge) {
      unresolvedIds.push(wire.id);
      return;
    }
    const from: TraceTerminalSpec = { ...centreOf(fromDot, containerRect), dir: fromEdge as TraceDir };
    const to: TraceTerminalSpec = { ...centreOf(toDot, containerRect), dir: OPPOSITE_DIR[toEdge as TraceDir] };
    resolved.push({ wire, from, to, curve: fans[i].offset });
  });

  return { resolved, unresolvedIds };
}

/* ------------------------------------------------------------------ */
/* WireLayer                                                            */
/* ------------------------------------------------------------------ */

export function WireLayer({ wires, containerRef, layoutKey }: WireLayerProps) {
  const [state, setState] = useState<WireLayerState>(EMPTY_STATE);

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
      const measure = () => setState(computeState(container, wires));
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
  }, [containerRef, wires, layoutKey]);

  return (
    <svg
      data-slot="wire-layer"
      data-unresolved-wires={state.unresolvedIds.join(",")}
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {state.resolved.map(({ wire, from, to, curve }) => (
        // `id` is destructured out of both `Trace` and `TraceBody` (it feeds
        // the MARKER's own id, `safeElementId("bbox-trace-head", id)`) and
        // never lands on either `<g>` as a DOM attribute — so a wrapping
        // group is the only way a story can find ONE wire's rendered trace
        // among its siblings. Purely additive: `Trace` itself is untouched.
        <g key={wire.id} data-wire-id={wire.id}>
          <Trace
            id={wire.id}
            from={from}
            to={to}
            routing={wire.routing}
            variant={wire.variant ?? "data"}
            color={wire.color}
            markerEnd={wire.markerEnd}
            curve={curve}
            terminals={false}
          />
        </g>
      ))}
    </svg>
  );
}
