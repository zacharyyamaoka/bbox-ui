"use client";

// src/components/traceEditor.tsx — ADDED, no donor as code. Wraps `Trace`
// (props-in/DOM-out per that file's own header) with the one thing it
// deliberately never does: pointers. docs/TRACE-CONTROL-POINTS-PLAN.md D4.
//
// The interaction MODEL below is ported from SystemSketch, read-only at
// /home/bam/systemsketch rev `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/blocks/connections/ConnectionShapeUtil.tsx:556-631` `getHandles`
//     — the virtual/vertex + `grow:` idea `trace.handles.ts` (D3) mirrors.
//   • `src/blocks/connections/ConnectionShapeUtil.tsx:647-760`
//     `onHandleDrag`, specifically the `activeRailDrag` base-capture rule:
//     "one drag grows exactly one rail and keeps adjusting it, rather than
//     inserting a fresh rail on every pointer move." The virtual-handle
//     insert gesture below (`DragState.kind === "virtual"`) is that rule,
//     ported to a plain DOM pointer handler instead of a tldraw shape util
//     — `dragRef.current.base` is `activeRailDrag`'s captured base, re-
//     applied on every move rather than accumulated.
//   • `src/connectorControlVisibility.ts` — the padded-rectangle reveal
//     policy D4 simplifies to a hit-stroke test; see the comment on
//     `active` below for why the simplification is honest, not a gap.
//   • `src/blocks/connections/elbowAuthoredRoute.ts:124` `simplify` — the
//     general shape of "drag a vertex back onto the line and it collapses,
//     which is how you delete it". Restated here as a distance-to-segment
//     threshold (`TRACE_BEND_COLLAPSE_PX`) rather than exact axis-aligned
//     collinearity, because a `TraceBend` chord is not axis-aligned the way
//     an elbow's rails are.
//
// WHAT CHANGED, exhaustively: everything is re-expressed through this
// repo's own contracts (`TraceBend`, `TraceHandle`, `TraceRouteRequest`)
// rather than a tldraw `TLHandle`/shape-prop update — there is no shape, no
// editor, no `IndexKey`, no pill handle (a different concern). The reveal
// policy drops FigJam's zoom-padded rectangle for a plain hit-stroke test,
// because a Storybook gallery has no camera zoom to compensate for. The
// donor splits terminal handles (always visible) from interior ones
// (hover-gated); here BOTH follow one reveal policy, because a tldraw
// selection is a different thing from proximity and this component has
// only proximity — two policies here would be ceremony, not fidelity.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { HIT_REGION_FILL, HIT_REGION_LINE } from "./hitRegion";
import { traceBendFrom, traceBendPoint, type TraceBend } from "./trace.bends";
import { traceHandles, type TraceHandle } from "./trace.handles";
import type { Point, TraceTerminalSpec } from "./trace.layout";
import {
  Trace,
  traceGeometry,
  type TraceGeometry,
  type TraceRouteProps,
  type TraceRouteRequest,
} from "./trace";

export interface TraceEditorProps extends Omit<TraceRouteProps, "bends" | "onGeometry"> {
  /** Controlled. Omit and pass `defaultBends` for uncontrolled. */
  bends?: readonly TraceBend[];
  defaultBends?: readonly TraceBend[];
  onBendsChange?(bends: TraceBend[]): void;
  /** Fired whenever a terminal drag moves `from`/`to`. Terminal position
   * itself is UNCONTROLLED here (seeded once from the initial `from`/`to`
   * props, like a `defaultValue`) — there is no matching `defaultFrom`/
   * `defaultTo` pair the way there is for `bends`/`defaultBends`, so a real
   * two-way controlled binding is not what the plan asks for; this callback
   * is the informational half of that, for a caller that wants to observe
   * or persist the result. */
  onTerminalsChange?(next: { from: TraceTerminalSpec; to: TraceTerminalSpec }): void;
  /** Terminals become undraggable. Default false — Zach: "in the full case
   *  we can also move the start and end points". A trace welded to a real
   *  Port passes true. */
  lockEndpoints?: boolean;
  /** Interior control points become undraggable (read-only display). */
  lockBends?: boolean;
  /** Force handles on/off; omit for the hover-or-selected policy. */
  revealed?: boolean;
  /** Overrides BOTH the bend (default 4) and virtual (default 3) handle
   * radius with one number — there is exactly one knob here, not two. */
  handleRadius?: number;
  /**
   * The invisible grab circle over each TERMINAL, px radius. Defaults to
   * `TERMINAL_HANDLE_HIT_RADIUS` (13) — deliberately wider than the drawn
   * glyph (`TRACE_TERMINAL_RADIUS`, 9). Scene-space like every number
   * here; a host wanting a screen-constant grab divides by its zoom.
   */
  terminalHitRadius?: number;
  onGeometry?: TraceRouteProps["onGeometry"];
}

const DEFAULT_BEND_HANDLE_RADIUS = 4;
const DEFAULT_VIRTUAL_HANDLE_RADIUS = 3;
/** A touch/click target a bit larger than `TRACE_TERMINAL_RADIUS` so a
 * terminal is easy to grab without drawing a second, redundant glyph on top
 * of the one `Trace` already paints there. */
const TERMINAL_HANDLE_HIT_RADIUS = 13;

/** Drag a bend within this many px of the chord joining its neighbours and
 * it is deleted — the inverse of dragging a virtual handle out. Mirrors the
 * donor's `simplify` (`elbowAuthoredRoute.ts:124`), restated as a distance
 * threshold because this bend model is not axis-aligned. */
export const TRACE_BEND_COLLAPSE_PX = 4;

type DragState =
  | { kind: "terminal"; end: "from" | "to" }
  | { kind: "bend"; index: number }
  // `base` is the bends array captured at pointer-down, BEFORE this
  // gesture's insertion — every subsequent move re-applies against it
  // (the donor's `activeRailDrag` rule), so one drag grows exactly one
  // bend instead of inserting a fresh one on every pointermove.
  | { kind: "virtual"; index: number; base: readonly TraceBend[] };

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  return Math.hypot(p.x - qx, p.y - qy);
}

/**
 * client (screen) coordinates -> the SVG's own user units, via the real
 * CTM. Deliberately NOT `getBoundingClientRect` arithmetic (D4's
 * "Coordinates" section): a `viewBox` that does not match the element's
 * pixel size — which every gallery here uses — makes a rect-based
 * conversion drift, while `getScreenCTM().inverse()` is exact at any zoom
 * or viewBox.
 */
function clientToLocalPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/**
 * `Trace` with pointers. The only component in this app that owns them —
 * `Trace` itself stays props-in/DOM-out (its own file header's promise).
 */
export function TraceEditor({
  bends: controlledBends,
  defaultBends,
  onBendsChange,
  onTerminalsChange,
  lockEndpoints = false,
  lockBends = false,
  revealed,
  handleRadius,
  terminalHitRadius = TERMINAL_HANDLE_HIT_RADIUS,
  onGeometry,
  from: fromProp,
  to: toProp,
  routing = "curved",
  ...rest
}: TraceEditorProps) {
  /* ---------------------------- bends state ---------------------------- */
  const [uncontrolledBends, setUncontrolledBends] = useState<readonly TraceBend[]>(
    () => defaultBends ?? [],
  );
  const bendsControlled = controlledBends !== undefined;
  const bends = bendsControlled ? controlledBends : uncontrolledBends;
  const setBends = useCallback(
    (next: readonly TraceBend[]) => {
      if (!bendsControlled) setUncontrolledBends(next);
      onBendsChange?.(next as TraceBend[]);
    },
    [bendsControlled, onBendsChange],
  );

  /* -------------------------- terminals state --------------------------- */
  // Seeded once, like `defaultValue` — see `onTerminalsChange`'s own doc
  // comment above for why this is not a real controlled/uncontrolled pair.
  const [from, setFrom] = useState<TraceTerminalSpec>(fromProp);
  const [to, setTo] = useState<TraceTerminalSpec>(toProp);

  /* ----------------------------- geometry -------------------------------- */
  // Computed synchronously (a pure function, no DOM) so handle positions are
  // NEVER a render behind the drawn path — unlike `onGeometry`, which
  // `Trace` only fires from a `useLayoutEffect` after mount (it exists to
  // carry a MEASURED curve length off the real DOM, which this component
  // does not need for handle placement: bends only apply to `straight`,
  // which `routeTrace` resolves fully with no browser involved). The real
  // `onGeometry` prop is forwarded to `Trace` unmodified, below, so a caller
  // still gets the measured value for whatever routing they asked for.
  const geometry = useMemo<TraceGeometry>(() => {
    const request: TraceRouteRequest = {
      from,
      to,
      routing,
      gap: rest.gap,
      curve: rest.curve,
      slantT: rest.slantT,
      bends: routing === "straight" ? bends : undefined,
      pins: rest.pins,
      obstacles: rest.obstacles,
      fromBox: rest.fromBox,
      toBox: rest.toBox,
      elbowOptions: rest.elbowOptions,
    };
    return traceGeometry(request);
    // Mirrors `Trace`'s own useMemo deps (this file's donor for the
    // pattern): scalars for the endpoints/curve/slantT so an inline
    // `from={{...}}` does not defeat memoization, object identity for the
    // elbow-only collections since they have no fixed shape to spread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    from.x, from.y, from.dir,
    to.x, to.y, to.dir,
    routing, rest.gap,
    rest.curve?.dx, rest.curve?.dy, rest.slantT,
    bends,
    rest.pins, rest.obstacles, rest.fromBox, rest.toBox, rest.elbowOptions,
  ]);

  /* ------------------------------ handles -------------------------------- */
  // `bends` is a `straight`-only concept (`trace.routing.ts`'s own doc: "not
  // an error, not a warning — ignored"), so every other routing offers
  // terminal handles ONLY. This is what the `AllRoutings` story's caption
  // means by "truthful, not a gap": a virtual dot on a `slanted` trace would
  // promise a drag that `routeTrace` would silently throw away.
  const handles = useMemo<TraceHandle[]>(() => {
    if (routing !== "straight") {
      return [
        { id: "start", kind: "terminal", x: geometry.start.x, y: geometry.start.y, index: 0 },
        { id: "end", kind: "terminal", x: geometry.end.x, y: geometry.end.y, index: 0 },
      ];
    }
    return traceHandles(geometry.points ?? [geometry.start, geometry.end]);
  }, [routing, geometry]);

  /* --------------------------- reveal policy ------------------------------ */
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  // `revealed ?? (hovered || selected)`: hovered/selected are attached to
  // this component's OWN outer <g> (below), not `Trace`'s inner one, so
  // moving from the hit path onto a handle circle never fires a spurious
  // pointerleave — both are descendants of the same subtree either way.
  const active = revealed ?? (hovered || selected);

  const rootRef = useRef<SVGGElement | null>(null);

  // Selected on a pointer-down that lands on the trace itself (its visible
  // line OR its invisible hit path — either can be topmost depending on
  // exactly where the pixel falls); cleared by Escape, or by a pointer-down
  // anywhere OUTSIDE this editor's own subtree. A pointer-down that lands on
  // a HANDLE, or anywhere else inside this subtree, is a no-op here — the
  // handle's own onPointerDown owns that gesture (see below).
  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) {
        const targetEl = event.target as Element;
        if (targetEl.closest('[data-slot="trace-line"], [data-slot="trace-hit"]')) {
          setSelected(true);
        }
        return;
      }
      setSelected(false);
    }
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(false);
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, []);

  /* -------------------------------- drag ---------------------------------- */
  // WHY `window` listeners driven by a `dragPointerId` STATE, rather than
  // `onPointerMove`/`onPointerUp` on the handle circle directly, even though
  // `setPointerCapture` is taken below: this repo already hit the reason,
  // in `traceBadge.tsx` ("capture is best-effort here... a drag whose only
  // move listener sits on the badge would silently stop tracking the
  // instant capture is unavailable"). A 3-4px virtual/bend dot is an easy
  // target to outrun with a real cursor; `window` tracks the gesture with
  // or without capture, so there is one code path instead of two that can
  // disagree. It is also what makes a SYNTHETIC `PointerEvent` in a play
  // function work at all: `setPointerCapture` throws `NotFoundError` for a
  // pointerId the browser has no active pointer for (same file's own note)
  // — harmless here because the window listeners never depended on it.
  const [dragPointerId, setDragPointerId] = useState<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragElRef = useRef<{ svg: SVGSVGElement; target: Element } | null>(null);

  // Fresh-on-every-render box so the window listeners (attached once per
  // gesture, not once per render) never read a value from the render that
  // started the drag — same technique, same reason, as `traceBadge.tsx`'s
  // own `latest` ref.
  const latestRef = useRef({ from, to, bends, geometryStart: geometry.start, geometryEnd: geometry.end });
  latestRef.current = { from, to, bends, geometryStart: geometry.start, geometryEnd: geometry.end };

  useEffect(() => {
    if (dragPointerId === null) return;

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return;
      const drag = dragStateRef.current;
      const svg = dragElRef.current?.svg;
      if (!drag || !svg) return;
      const cursor = clientToLocalPoint(svg, event.clientX, event.clientY);
      const { from: liveFrom, to: liveTo, bends: liveBends, geometryStart, geometryEnd } = latestRef.current;

      if (drag.kind === "terminal") {
        // Only x/y move; `dir` is preserved (D4's "Drag" section).
        if (drag.end === "from") {
          const next: TraceTerminalSpec = { ...liveFrom, x: cursor.x, y: cursor.y };
          setFrom(next);
          onTerminalsChange?.({ from: next, to: liveTo });
        } else {
          const next: TraceTerminalSpec = { ...liveTo, x: cursor.x, y: cursor.y };
          setTo(next);
          onTerminalsChange?.({ from: liveFrom, to: next });
        }
        return;
      }

      const bend = traceBendFrom(cursor, geometryStart, geometryEnd);
      if (drag.kind === "bend") {
        setBends(liveBends.map((existing, i) => (i === drag.index ? bend : existing)));
        return;
      }

      // virtual: re-apply against the BASE captured at pointer-down (the
      // donor's `activeRailDrag` rule) — every move of this gesture inserts
      // exactly one bend at `drag.index`, never accumulates a second one.
      setBends([...drag.base.slice(0, drag.index), bend, ...drag.base.slice(drag.index)]);
    };

    const handleEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return;
      const drag = dragStateRef.current;
      dragStateRef.current = null;
      setDragPointerId(null);

      if (drag && drag.kind !== "terminal") {
        // Collapse: a bend now within `TRACE_BEND_COLLAPSE_PX` of the
        // straight segment joining its two neighbours is deleted — the
        // inverse of the virtual-insert gesture, and therefore how a bend
        // is removed by dragging it back onto the line.
        const { bends: liveBends, geometryStart, geometryEnd } = latestRef.current;
        const points = [
          geometryStart,
          ...liveBends.map((bend) => traceBendPoint(bend, geometryStart, geometryEnd)),
          geometryEnd,
        ];
        const survivors = liveBends.filter((_, i) => {
          const prev = points[i];
          const next = points[i + 2];
          return distanceToSegment(points[i + 1], prev, next) > TRACE_BEND_COLLAPSE_PX;
        });
        if (survivors.length !== liveBends.length) setBends(survivors);
      }

      const el = dragElRef.current;
      dragElRef.current = null;
      try {
        if (el && el.target.hasPointerCapture(dragPointerId)) el.target.releasePointerCapture(dragPointerId);
      } catch {
        // Best-effort, same reason as the pointerdown capture attempt below.
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [dragPointerId, onTerminalsChange, setBends]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>, handle: TraceHandle) => {
      if (handle.kind === "terminal" && lockEndpoints) return;
      if (handle.kind !== "terminal" && lockBends) return;
      event.preventDefault();
      event.stopPropagation();
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Best-effort — throws `NotFoundError` for a synthetic
        // `PointerEvent`'s pointerId in a play-function test
        // (`traceBadge.tsx`'s own note). The window listeners above work
        // with or without it.
      }
      setSelected(true);
      dragElRef.current = { svg, target: event.currentTarget };
      if (handle.kind === "terminal") {
        dragStateRef.current = { kind: "terminal", end: handle.id === "start" ? "from" : "to" };
      } else if (handle.kind === "bend") {
        dragStateRef.current = { kind: "bend", index: handle.index };
      } else {
        dragStateRef.current = { kind: "virtual", index: handle.index, base: bends };
      }
      setDragPointerId(event.pointerId);
    },
    [lockEndpoints, lockBends, bends],
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGCircleElement>, handle: TraceHandle) => {
      if (handle.kind !== "bend" || lockBends) return;
      event.preventDefault();
      event.stopPropagation();
      setBends(bends.filter((_, i) => i !== handle.index));
    },
    [bends, lockBends, setBends],
  );

  const cursor = lockEndpoints && lockBends ? "default" : dragPointerId !== null ? "grabbing" : "grab";

  return (
    <g
      data-slot="trace-editor"
      ref={rootRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Trace
        {...rest}
        from={from}
        to={to}
        routing={routing}
        bends={routing === "straight" ? bends : undefined}
        onGeometry={onGeometry}
        interactive
      />
      {active
        ? handles.map((handle) => {
            const locked = handle.kind === "terminal" ? lockEndpoints : lockBends;
            const isTerminal = handle.kind === "terminal";
            const radius = isTerminal
              ? terminalHitRadius
              : (handleRadius ??
                (handle.kind === "virtual" ? DEFAULT_VIRTUAL_HANDLE_RADIUS : DEFAULT_BEND_HANDLE_RADIUS));
            // WHY the paint circle below shares `handle`/`radius` with the
            // real one instead of measuring anything: region and target are
            // the same numbers by construction, so the overlay cannot drift
            // from the hit-testing it claims to show.
            const hitPaint = rest.showHitRegion ? (
              <circle
                data-slot="trace-handle-hit-region"
                aria-hidden
                cx={handle.x}
                cy={handle.y}
                r={radius}
                fill={HIT_REGION_FILL}
                stroke={HIT_REGION_LINE}
                strokeWidth={1}
                strokeDasharray="3 3"
                style={{ pointerEvents: "none" }}
              />
            ) : null;
            return (
              <Fragment key={handle.id}>
              <circle
                data-slot="trace-handle"
                data-handle-kind={handle.kind}
                data-handle-id={handle.id}
                data-handle-locked={locked || undefined}
                cx={handle.x}
                cy={handle.y}
                r={radius}
                fill={
                  isTerminal
                    ? "transparent"
                    : handle.kind === "bend"
                      ? "var(--bbox-primary, var(--primary))"
                      : "var(--background)"
                }
                stroke={isTerminal ? "none" : handle.kind === "bend" ? "var(--background)" : "var(--muted-foreground)"}
                strokeWidth={handle.kind === "bend" ? 1.5 : 1}
                style={{
                  cursor: locked ? "default" : cursor,
                  touchAction: "none",
                  pointerEvents: isTerminal ? "all" : "auto",
                }}
                onPointerDown={(event) => handlePointerDown(event, handle)}
                onDoubleClick={(event) => handleDoubleClick(event, handle)}
              />
              {hitPaint}
              </Fragment>
            );
          })
        : null}
    </g>
  );
}
