"use client";

// src/components/trace.tsx — ported by value from
// `packages/bbox-ui/src/trace.tsx` (`b5b2778`, "Implement the Trace edge
// primitive"), itself ported from SystemSketch's `connectionPresentation.ts`
// / `SlantedArrowBody`. Two hops, stated the way `port.tsx:3-16` models it.
//
// Trace = the paint for a two-ended shape whose PATH a host computes and
// whose ROUTE a host owns interaction for. Trace never derives a point,
// never binds a terminal, never listens for a pointer.
//
// What ported OVER verbatim (pure paint, no schema): `traceStrokeStyle`'s
// dash mechanics, `TraceMarkerDef`'s chevron + `context-stroke`, the
// `delayed`+`splitAtLabel` two-path split, `safeElementId` marker ids.
//
// What's LEFT BEHIND (docs/TRACE-PLAN.md's own strip list — none of it is
// paint): `tone`/`toneOverride`, `PaintToken`/`paintColor`,
// `resolveTraceStrokeColor`'s tone-override subject, `Pill`/`TraceLabel`,
// and `trace.fields.ts` entirely. Cost, stated honestly: no tone escape
// hatch and no inspector provenance; both re-addable. `color?: string`
// (any CSS colour) replaces the governed `strokeColor` field.
//
// DEVIATION from the donor, deliberate (docs/TRACE-PLAN.md D2): `color`
// defaults to `var(--muted-foreground)`, not the donor's `foreground`.
// "Data = plain grey" is this app's base style, and on this app's neutral
// shadcn theme `--foreground` paints near-black.
//
// ADDED here (P1, for later phases): the invisible hit path — a 12px
// transparent sibling with `pointerEvents: "stroke"`, the same convention
// React Flow's `BaseEdge` uses — and the `points` prop.
//
// ADDED here (P6, at the bottom of this file): `traceGeometry` and the
// `Trace` wrapper — two terminal specs plus a `routing` kind in, the whole
// drawn thing out. `TraceBody` above is unchanged and stays the primitive:
// it still never derives a point. `Trace` is the layer that DOES derive
// one, by calling P2's `routeTrace` or P3's `routeElbow` — which is why it
// is a separate export with its own name rather than a fatter `TraceBody`.

import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";

import { cn } from "../lib/utils";
import { diagnosticColorVar, maxDiagnosticSeverity, type Diagnostic } from "./diagnostic";
import { HIT_REGION_STROKE } from "./hitRegion";
import {
  ASYNC_PACKET_DASHARRAY,
  DATA_MARCH_CLASS,
  DATA_MARCH_DASHARRAY,
  DELAY_DOT_GAP_PX,
  DELAY_DOT_PX,
  DIR_VECTOR,
  LABEL_POSITION_DEFAULT,
  PATH_LENGTH_UNITS,
  TRACE_DIRS,
  asyncDashOffsetForLength,
  clampLabelPosition,
  pointAtFraction,
  polylineLength,
  polylinePath,
  safeElementId,
  splitDashArrays,
  type Point,
  type TraceDir,
  type TraceMarkerEnd,
  type TraceRouting,
  type TraceTerminalSpec,
  type TraceVariant,
} from "./trace.layout";
import { routeTrace, type DirectRouting, type TraceCurve } from "./trace.routing";
import type { TraceBend } from "./trace.bends";
import {
  CROSSING_CASING_COLOR,
  CROSSING_CASING_WIDTH,
  casingDashArray,
  type CrossingMark,
} from "./trace.crossing";
import {
  TUNNEL_STUB_LENGTH,
  TUNNEL_VIA_RADIUS,
  tunnelHidesRun,
  tunnelMouths,
  tunnelShowsVias,
  tunnelVisualForPoints,
  type TunnelDisplayState,
} from "./tunnel";
import {
  elbowPath,
  routeElbow,
  type ElbowPin,
  type ElbowRect,
  type ElbowRouteOptions,
  type ElbowRoutingObstacle,
} from "./elbow/index";
import { elbowInputFromTerminals, routePoints } from "./elbow/traceContract";
import { TraceTerminal } from "./traceTerminal";
import { sketchPathData } from "../skin/sketchPath";

/**
 * `style` for the crisp path and for its hand-drawn twin (ported from
 * packages/bbox-ui/src/trace.tsx).
 *
 * WHY both are rendered and CSS picks, rather than the component choosing:
 * it cannot know the active skin. Everywhere else a skin blanks the crisp
 * version by recolouring it (`--bbox-skin-stroke: transparent`), which
 * works because a border can be transparent and still occupy its space. An
 * SVG path has no equivalent — and a Trace's geometry belongs to the HOST
 * (this app's `trace.routing.ts`/`elbow/`), so there is nothing here to
 * re-derive. Paths do not affect layout, so the hidden twin costs only the
 * memoised math.
 *
 * Zach, 2026-09-17 (ported verbatim): "it would be great of course if even
 * the traces can support a more sketchy appearance... perhaps thats just
 * like another styling thing for them. just like async, or animated" — so
 * it is exactly that: orthogonal to `variant`, to `animated` and to the
 * dash cadence.
 */
const CRISP_STYLE = { display: "var(--bbox-skin-crisp, inline)" } as const;
const SKETCH_STYLE = { display: "var(--bbox-skin-outline, none)" } as const;

/** Wobble for a cable. Lower than a Block's: the same absolute wander read
 * across a long curve is a wave, not a drawn line. */
const TRACE_WOBBLE_PX = 1.4;

/**
 * Sketched paths, cached by the geometry that produced them (ported
 * verbatim from the donor — see its own WHY on the module-level `Map`
 * versus `useMemo`: `TraceBody` here is likewise called as a plain
 * function, no hook, so its wobble twin is memoised outside React instead).
 * Bounded because a live drag produces a NEW `d` every frame.
 */
const SKETCH_CACHE = new Map<string, string>();
const SKETCH_CACHE_MAX = 512;

function sketchedTracePath(d: string): string {
  const hit = SKETCH_CACHE.get(d);
  if (hit !== undefined) return hit;
  const out = sketchPathData(d, { seed: d, wobble: TRACE_WOBBLE_PX });
  if (SKETCH_CACHE.size >= SKETCH_CACHE_MAX) {
    const oldest = SKETCH_CACHE.keys().next().value;
    if (oldest !== undefined) SKETCH_CACHE.delete(oldest);
  }
  SKETCH_CACHE.set(d, out);
  return out;
}

/** The transparent hit path's stroke width. Wider than the 2px visible
 * line by design: the line is the thing you SEE, this is the thing you can
 * plausibly double-click. Same trick, same reason, as React Flow's
 * `BaseEdge` interaction path. */
export const TRACE_HIT_STROKE_PX = 12;

// WHY `points` is omitted from the `<g>` props as well as `id`: React's
// `SVGProps` gives EVERY svg element the `points` attribute (typed
// `string`, for `<polyline>`/`<polygon>`), so the `Point[]` prop below is a
// genuine name collision — caught by `tsc`, not papered over with a cast. A
// `<g>` has no `points` attribute to lose.
export interface TraceProps extends Omit<ComponentProps<"g">, "id" | "points"> {
  /**
   * The host's own id for this trace (React Flow's edge `id`, a tldraw
   * shape's `id`) — hex-encoded into the marker's DOM id
   * (`safeElementId("bbox-trace-head", id)`, `trace.layout.ts`) so
   * multiple Trace instances on one page never collide. See that
   * function's own doc comment for three rounds of adversarial review this
   * genuinely needed. Deliberately NOT generated internally (no
   * `useId()`): an id `TraceBody` invents itself would be identity this
   * component doesn't own. Matches SystemSketch's own precedent — its
   * marker id is `systemsketch-slanted-arrowhead-${shape.id}`, derived
   * from the real shape, never generated.
   */
  id: string;
  /** The finished path — a host computes this. Trace never derives its own points. */
  path: string;
  /**
   * Arc length of `path`, for dash-phase math (async centering, the
   * delayed split). NOT the straight endpoint distance — a curve is longer
   * than its chord, which is the report's own warning. The host-agnostic
   * way to get it for a curve is `SVGPathElement.getTotalLength()` on the
   * mounted path.
   */
  length?: number;
  /**
   * The polyline `path` was built from, when the caller HAS exact vertices
   * (every routing but `curved`). Two jobs, neither of them derivation:
   * it supplies `length` when `length` is omitted (removing the
   * chord-vs-arc footgun above at the call site), and it is the array a
   * host hands `TraceBadge` for `fractionNearest`/`pointAtFraction` (P4).
   * `length` wins when both are given.
   */
  points?: readonly Point[];
  variant?: TraceVariant;
  /** Any CSS colour. Replaces the donor's governed `strokeColor` token
   * (see this file's header). The marker inherits it via `context-stroke`,
   * so there is never a second colour derivation. */
  color?: string;
  /** Marching-ants, `variant:"data"` only, opt-in. */
  animated?: boolean;
  /** `variant:"delayed"` only — paints solid up to `labelPosition`, dotted
   * after it, so a label can sit in the seam. */
  splitAtLabel?: boolean;
  /** Where 0..1 along the path the delayed split lands — clamped to
   * 0.05..0.95 regardless of what's passed (`clampLabelPosition`). */
  labelPosition?: number;
  markerEnd?: TraceMarkerEnd;
  strokeWidth?: number;
  vectorEffect?: "non-scaling-stroke";
  /** Mount the invisible 12px hit path. Off by default: a Trace that
   * nothing listens to should not be silently eating pointer events from
   * whatever sits under it. */
  interactive?: boolean;
  /**
   * Tunnel display state — `off` (an ordinary cable), `hidden` (the long
   * run leaves the surface, two stubs and two vias remain), `preview` (the
   * whole route, mouths still marked) or `revealed` (the whole route, no
   * mouths). Resolve it with `tunnelDisplayState` in `./tunnel`, which is
   * where the four-state rule and its provenance live.
   *
   * WHY this arrives RESOLVED rather than as `{selected, hovered, layer}`:
   * three of those four inputs are interaction state, which
   * `ARCHITECTURE.md` makes host-owned. `TraceBody` stays props-in/DOM-out
   * and never learns what "focused" meant here.
   *
   * `hidden` needs `points` — shortening the drawn `d` requires the route's
   * vertices, not just its serialization. Without them the cable paints in
   * full, which is the honest failure (`Trace` supplies them for every
   * routing, sampling a curve's after layout).
   */
  tunnel?: TunnelDisplayState;
  /**
   * How this cable shows it passes OVER another where they cross. `none`
   * (default) or `halo` — a background-coloured casing under this cable's
   * own stroke and over every cable painted before it. See
   * `./trace.crossing` for the research, the 11px calibration, and why the
   * seam is a style name rather than a boolean (so `hop`/`gap` can land
   * later without a rewrite).
   *
   * Defaults to `none` even though the donor's `DEFAULT_CROSSING_MARK` is
   * `halo`: a casing asserts knowledge of the canvas colour, which this
   * component can only guess through a CSS variable. Hosts opt in.
   */
  crossing?: CrossingMark;
  /**
   * The hit path's stroke width in the SVG's own units. Defaults to
   * `TRACE_HIT_STROKE_PX` (12). Scene-space, like every geometry number
   * here: under a host's viewport transform the band scales with zoom
   * (note it does NOT get the `vectorEffect` prop — that keeps the INK
   * screen-constant while the hit band still scales; see the hit-regions
   * stories). A host wanting a screen-constant band divides by its zoom.
   */
  hitStrokePx?: number;
  /**
   * Paint the hit path (translucent stroke) instead of leaving it
   * transparent. Pure paint on the EXISTING hit element — width, cap and
   * hit-testing are identical with this on or off. Only meaningful with
   * `interactive`; a non-interactive Trace HAS no hit band, and painting
   * one would be the decoration this prop exists to avoid.
   */
  showHitRegion?: boolean;
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's Trace row): a
   * translucent backdrop path under the wire, same geometry as the hit
   * path, painted at `max(severity)`. The stroke itself keeps its own
   * variant colour/dash — `data`/`async`/`delayed` stay legible — so the
   * backdrop is the ONLY thing this axis owns here. `info` paints nothing
   * (§5's table). The message rides a hover `Tooltip` on the visible
   * stroke, or a `TraceBadge` in severity dress at `labelPosition` — a
   * host composition, not this file's job.
   */
  diagnostics?: Diagnostic[];
}

export interface TraceStrokeStyle {
  strokeDasharray?: string;
  strokeDashoffset?: number;
  strokeLinecap: "round" | "butt";
  /** Marching-ants class — DATA ONLY, never applied as a side effect by
   * this function. The caller puts it on the rendered element's
   * `className`, never inside `style`. */
  className?: string;
}

/**
 * Pure — no DOM. Dash MECHANICS only (pattern, phase/offset, the
 * marching-ants class NAME), never colour: colour is a plain `color` prop
 * here, resolved nowhere. An adapter calls this directly when assembling
 * React Flow's own `BaseEdge` `style` prop for the single-stroke variants.
 */
export function traceStrokeStyle(
  variant: TraceVariant,
  length: number,
  animated = false,
): TraceStrokeStyle {
  if (variant === "async") {
    return {
      strokeDasharray: ASYNC_PACKET_DASHARRAY,
      strokeDashoffset: asyncDashOffsetForLength(length),
      strokeLinecap: "butt",
    };
  }
  if (variant === "delayed") {
    return {
      strokeDasharray: `${DELAY_DOT_PX} ${DELAY_DOT_GAP_PX}`,
      strokeLinecap: "round",
    };
  }
  const marching = animated;
  return {
    strokeDasharray: marching ? DATA_MARCH_DASHARRAY : undefined,
    strokeLinecap: marching ? "butt" : "round",
    className: marching ? DATA_MARCH_CLASS : undefined,
  };
}

/** Marker geometry lives once, referenced by every variant that draws a
 * head — the open two-stroke chevron `SlantedArrowBody` established.
 * `context-stroke` (a real SVG2 paint keyword; broad Chromium/Firefox
 * support per MDN, NOT YET Safari — there the marker falls back to its own
 * unspecified default stroke rather than erroring, a degraded look, not a
 * broken one) makes it inherit whatever stroke paints the line beside it,
 * so it never needs a second colour derivation or a duplicate marker per
 * colour. */
export function TraceMarkerDef({ id }: { id: string }) {
  return (
    <marker
      data-slot="trace-marker"
      id={id}
      viewBox="0 0 10 10"
      refX="8.5"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto"
      overflow="visible"
    >
      <path
        data-slot="trace-marker-head"
        d="M 1 1 L 9 5 L 1 9"
        fill="none"
        stroke="context-stroke"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

/**
 * The paint — one visible `<path>` for `data`/`async`, two for a `delayed`
 * trace with `splitAtLabel`, plus the optional invisible hit path. Zero
 * imports of any canvas engine.
 */
export function TraceBody({
  id,
  path,
  length,
  points,
  variant = "data",
  color = "var(--muted-foreground)",
  animated = false,
  splitAtLabel = false,
  labelPosition = LABEL_POSITION_DEFAULT,
  markerEnd = "arrow",
  strokeWidth = 2,
  vectorEffect,
  interactive = false,
  tunnel = "off",
  crossing = "none",
  hitStrokePx = TRACE_HIT_STROKE_PX,
  showHitRegion = false,
  diagnostics,
  className,
  ...props
}: TraceProps) {
  const markerId = safeElementId("bbox-trace-head", id);
  const diagnosticSeverity = maxDiagnosticSeverity(diagnostics);
  const hasMarker = markerEnd !== "none";
  const markerAttr = hasMarker ? `url(#${markerId})` : undefined;
  const resolvedLength = length ?? (points ? polylineLength(points) : 0);

  // ---- Tunnel -----------------------------------------------------------
  // `revealed` passes `true` and gets null back — that IS the donor's
  // contract ("`null` means the route should remain fully visible"), so
  // revealed needs no branch of its own here.
  const tunnelVisual =
    tunnel !== "off" && points ? tunnelVisualForPoints(points, tunnel === "revealed") : null;
  // Only `hidden` shortens the path. `preview` keeps the whole route AND
  // the mouths — the single most confusable thing about this feature, which
  // is why it reads as a named predicate rather than a string compare.
  const mouths =
    tunnelVisual && tunnelHidesRun(tunnel) && points ? tunnelMouths(points, false) : null;
  // Two subpaths in ONE `d`, not two elements: the marker then still lands
  // on the target end (a marker-end attaches to the final vertex of the last
  // subpath), the dash channel stays free for the variant, and
  // `flattenPathData` already treats each `M` as a separate sketch run.
  const drawnPath = mouths
    ? `${polylinePath(mouths.start)} ${polylinePath(mouths.end)}`
    : path;
  const drawnLength = mouths ? TUNNEL_STUB_LENGTH * 2 : resolvedLength;
  const showVias = tunnelVisual !== null && tunnelShowsVias(tunnel);

  // ---- Crossing mark ----------------------------------------------------
  // Measured on the DRAWN length, which makes the tunnel case correct for
  // free: two 34px stubs fall under `CROSSING_CASING_MIN_LENGTH`, so a
  // tunnelled cable gets no casing — there is no middle left to protect.
  const casingDash = crossing === "halo" ? casingDashArray(drawnLength) : null;

  const defs = hasMarker ? (
    <defs data-slot="trace-defs">
      <TraceMarkerDef id={markerId} />
    </defs>
  ) : null;

  // Painted FIRST — before the hit path, before this cable's own stroke —
  // because paint order IS the algorithm: the cable drawn later lays its
  // background casing across the one drawn earlier, so the upper line reads
  // as passing over the lower one with no intersection computed anywhere.
  //
  // WHY there is no sketched twin of it, unlike every other path here: the
  // casing is the canvas colour, so it is invisible on its own and exists
  // only to occlude. An 11px stroke swallows the sketch skin's ~1.4px
  // wobble whole, so a second wobbled copy would cost a path and change
  // nothing. `pointerEvents: none` because a wide invisible stroke that ate
  // clicks would be a hit target nobody asked for.
  const casing = casingDash ? (
    <path
      data-slot="trace-casing"
      d={drawnPath}
      fill="none"
      stroke={CROSSING_CASING_COLOR}
      strokeWidth={CROSSING_CASING_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={casingDash}
      style={{ pointerEvents: "none" }}
    />
  ) : null;

  // The honest remainder of a hidden long run: two outlined landing points
  // make "continues elsewhere" distinct from "disconnected".
  const vias = showVias ? (
    <g data-slot="trace-vias" style={{ color: color, pointerEvents: "none" }}>
      <circle
        data-via="start"
        cx={tunnelVisual.startVia.x}
        cy={tunnelVisual.startVia.y}
        r={TUNNEL_VIA_RADIUS}
        fill={CROSSING_CASING_COLOR}
        stroke="currentColor"
        strokeWidth={2}
      />
      <circle
        data-via="end"
        cx={tunnelVisual.endVia.x}
        cy={tunnelVisual.endVia.y}
        r={TUNNEL_VIA_RADIUS}
        fill={CROSSING_CASING_COLOR}
        stroke="currentColor"
        strokeWidth={2}
      />
    </g>
  ) : null;

  // Painted FIRST so the visible line always sits on top of it. It is
  // transparent, not `opacity:0` — a transparent stroke still hit-tests
  // with `pointer-events: stroke`, which is the entire point.
  // WHY `drawnPath` and not `path`: a tunnelled cable's hidden middle is not
  // there, so it must not be hoverable either. Zach's own note on the
  // feature is "hover previews the route with its tunnel mouths" — the mouth
  // is the affordance; a hit target tracing the invisible run would make
  // empty canvas react and would make the preview impossible to escape.
  const hit = interactive ? (
    <path
      data-slot="trace-hit"
      d={drawnPath}
      fill="none"
      stroke={showHitRegion ? HIT_REGION_STROKE : "transparent"}
      strokeWidth={hitStrokePx}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: "stroke" }}
    />
  ) : null;

  // §5's Trace row: a translucent backdrop under the wire, same geometry
  // as the hit path above (`drawnPath`, so a tunnelled cable's backdrop
  // stops at the same mouths the wire itself does), painted at
  // `max(severity)`. `info` paints nothing (§5's own table). The visible
  // stroke's `color`/dash stay whatever the variant already set — this is
  // the ONLY layer the diagnostic axis owns here, never a recoloured line.
  const diagnosticBackdrop =
    diagnosticSeverity && diagnosticSeverity !== "info" ? (
      <path
        data-slot="trace-diagnostic-backdrop"
        aria-hidden
        d={drawnPath}
        fill="none"
        stroke={`color-mix(in srgb, ${diagnosticColorVar(diagnosticSeverity)} 30%, transparent)`}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
    ) : null;

  // Seeded from the geometry itself, so a cable keeps its own wander while
  // it sits still and re-draws honestly when it moves. Sketched from the
  // DRAWN path, so a tunnelled cable's two mouths each wobble as their own
  // run rather than the skin re-deriving a route that is no longer painted.
  const sketched = sketchedTracePath(drawnPath);

  // A hidden middle has no label seam to split at — `splitAtLabel` puts the
  // solid/dotted boundary at `labelPosition` along the FULL route, which is
  // exactly the stretch that has left the surface. So a tunnelled `delayed`
  // trace falls through to the single-path branch and keeps its dots; it
  // does not silently draw a split across two 34px stubs.
  if (variant === "delayed" && splitAtLabel && !mouths) {
    const dash = splitDashArrays(resolvedLength, clampLabelPosition(labelPosition));
    const splitSegment = {
      pathLength: PATH_LENGTH_UNITS,
      fill: "none",
      stroke: color,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeWidth,
      vectorEffect,
    };
    return (
      <g
        data-slot="trace"
        data-variant={variant}
        data-split="true"
        data-tunnel={tunnel}
        data-crossing={crossing}
        data-diagnostic={diagnosticSeverity}
        className={cn(className)}
        {...props}
      >
        {defs}
        {diagnosticBackdrop}
        {casing}
        {hit}
        <path {...splitSegment} data-slot="trace-line" data-trace-segment="before" d={path} strokeDasharray={dash.before} style={CRISP_STYLE} />
        <path {...splitSegment} data-slot="trace-line" data-trace-segment="before" data-sketch="true" d={sketched} strokeDasharray={dash.before} style={SKETCH_STYLE} />
        <path {...splitSegment} data-slot="trace-line" data-trace-segment="after" d={path} strokeDasharray={dash.after} markerEnd={markerAttr} style={CRISP_STYLE} />
        <path {...splitSegment} data-slot="trace-line" data-trace-segment="after" data-sketch="true" d={sketched} strokeDasharray={dash.after} markerEnd={markerAttr} style={SKETCH_STYLE} />
        {vias}
      </g>
    );
  }

  // WHY `drawnLength` and not `resolvedLength`: the dash phase has to
  // describe the path that is actually painted. A tunnelled cable draws two
  // 34px stubs, and 34 is well under one async cadence (74px) — fed the
  // full route length, `asyncDashOffsetForLength` returns 0, both stubs
  // land inside the 56px carrier, and an async cable silently renders
  // solid. Caught by LOOKING at the capture, not by a test: every
  // attribute-level assertion passed. Fed the drawn length instead, the
  // short-run branch that already exists for exactly this case centres one
  // gap-packet-gap mark in each mouth. Identical to `resolvedLength`
  // whenever nothing is tunnelled.
  //
  // It is ONE MOUTH's length, not both: `asyncDashOffsetForLength`'s
  // contract is "centre a mark in a run of this length", and SVG restarts
  // the dash pattern at each subpath — so the run it phases is a single
  // stub, twice, not their sum.
  const dashStyle = traceStrokeStyle(variant, mouths ? TUNNEL_STUB_LENGTH : drawnLength, animated);
  const segment = {
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: dashStyle.strokeLinecap,
    strokeLinejoin: "round" as const,
    strokeDasharray: dashStyle.strokeDasharray,
    strokeDashoffset: dashStyle.strokeDashoffset,
    vectorEffect,
    className: dashStyle.className,
    markerEnd: markerAttr,
  };
  return (
    <g
      data-slot="trace"
      data-variant={variant}
      data-animated={animated || undefined}
      data-tunnel={tunnel}
      data-crossing={crossing}
      data-diagnostic={diagnosticSeverity}
      className={cn(className)}
      {...props}
    >
      {defs}
      {diagnosticBackdrop}
      {casing}
      {hit}
      <path {...segment} data-slot="trace-line" data-trace-segment="whole" d={drawnPath} style={CRISP_STYLE} />
      <path {...segment} data-slot="trace-line" data-trace-segment="whole" data-sketch="true" d={sketched} style={SKETCH_STYLE} />
      {vias}
    </g>
  );
}

/* ==========================================================================
 * Trace — the wrapper (docs/TRACE-PLAN.md P6)
 *
 * `TraceBody` above is props-in, DOM-out and derives nothing. `Trace` is the
 * one place in this app allowed to derive: it takes the two frozen
 * `TraceTerminalSpec`s and a `routing` kind, asks P2 (`routeTrace`) or P3
 * (`routeElbow`) for the geometry, and paints the line plus the two terminal
 * glyphs. Everything below is net-new; nothing here is a port.
 * ========================================================================== */

/**
 * How far short of a terminal's CENTRE the wire stops, along the flow.
 *
 * WHY the wire cannot simply end at `{x, y}`: the glyph's disc is opaque
 * (deliberately — see `traceTerminal.tsx`) with r=9, and the chevron marker
 * reaches ~12px back from the path's end. A wire drawn to the exact centre
 * therefore loses BOTH its arrowhead and its last 9px under the disc.
 *
 * `TraceElbow.stories.tsx` computes the identical pull-back inline
 * (`routeStart`/`routeEnd`, `TERMINAL_GAP = 16`) because it was written
 * before this wrapper existed. That file is another lane's and is left
 * alone; the two agreeing is asserted in `TracePolarity.stories.tsx` rather
 * than assumed, so the duplication cannot drift silently.
 */
export const TRACE_TERMINAL_GAP = 16;

/** How many points a curved route is sampled into when a caller asks for a
 * polyline (`onGeometry`). A Bezier genuinely has no vertices — this is a
 * SAMPLE, and it is named one. */
export const TRACE_CURVE_SAMPLES = 64;

/** Everything `Trace` needs to compute a route, with no React in sight — so
 * a play function can ask for the same geometry the component drew without
 * rendering anything. */
export interface TraceRouteRequest {
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  routing: TraceRouting;
  /** Pull-back at each end; defaults to {@link TRACE_TERMINAL_GAP}. */
  gap?: number;
  /** `straight` / `curved`: the dragged centre control point. */
  curve?: TraceCurve | null;
  /** `slanted`: where along the departure axis the bend sits, 0..1. */
  slantT?: number | null;
  /** `straight` only: N intermediate control points, chord-relative
   * (docs/TRACE-CONTROL-POINTS-PLAN.md D1/D2). Ignored by every other
   * routing — see `trace.routing.ts`'s `TraceRouteOptions.bends`. */
  bends?: readonly TraceBend[] | null;
  /** `elbow`: persisted bends. */
  pins?: readonly ElbowPin[];
  /** `elbow`: keep-outs. A story fixture IS this list. */
  obstacles?: readonly ElbowRoutingObstacle[];
  fromBox?: ElbowRect | null;
  toBox?: ElbowRect | null;
  elbowOptions?: Partial<ElbowRouteOptions>;
}

export interface TraceGeometry {
  routing: TraceRouting;
  /** The SVG `d` handed to `TraceBody`. */
  path: string;
  /**
   * Exact vertices, or `null` for a curve — a cubic HAS no vertices, and
   * `routeTrace` already says so rather than inventing some. A caller that
   * needs a polyline for a curve gets a SAMPLED one from `onGeometry`,
   * measured off the mounted `SVGPathElement`, and it is labelled `sampled`.
   */
  points: Point[] | null;
  /**
   * Arc length. Exact for `straight`/`slanted`. For `elbow` this is the
   * ROUTE's length, which slightly overstates the DRAWN length because
   * `elbowPath` rounds every corner (a rounded corner is shorter than the
   * two half-segments it replaces — at most `(2 - pi/2) * r` ≈ 3.4px per
   * corner at r=8). Stated rather than silently accepted: it moves an async
   * dash phase by a few pixels and nothing else. `0` for an unmeasured
   * curve, replaced by the real `getTotalLength()` once mounted.
   */
  length: number;
  /** The exit sides the ROUTER was actually given — one derivation, read
   * back rather than recomputed (see the elbow branch's note). */
  sides: { start: TraceDir; end: TraceDir };
  /** Where a centre control point sits for this routing. */
  waypoint: Point;
  /** The route's real endpoints: the terminals pulled back by `gap`. */
  start: TraceTerminalSpec;
  end: TraceTerminalSpec;
}

/** The route's start: `gap` along the flow, out of the glyph. */
export function traceRouteStart(from: TraceTerminalSpec, gap: number): TraceTerminalSpec {
  return {
    x: from.x + DIR_VECTOR[from.dir].x * gap,
    y: from.y + DIR_VECTOR[from.dir].y * gap,
    dir: from.dir,
  };
}

/**
 * The route's end: `gap` BEHIND the target, measured along the direction of
 * travel, so the arrowhead sits in the gap pointing at the glyph. For
 * `dir: "left"` that puts the wire's last point to the RIGHT of the
 * terminal — the wrap-around case, not a sign error.
 */
export function traceRouteEnd(to: TraceTerminalSpec, gap: number): TraceTerminalSpec {
  return {
    x: to.x - DIR_VECTOR[to.dir].x * gap,
    y: to.y - DIR_VECTOR[to.dir].y * gap,
    dir: to.dir,
  };
}

/**
 * The one dispatch that spans both routing lanes. Pure: no React, no DOM.
 *
 * WHY it lives here and not in `trace.routing.ts`: that module's header
 * states, and enforces with its `DirectRouting` type, that a 450-line
 * geometry file has no business importing 2,500 lines of A*. The wrapper is
 * the seam where the two legitimately meet, so the import weight lands on
 * the component that actually needs both.
 */
export function traceGeometry(request: TraceRouteRequest): TraceGeometry {
  const gap = request.gap ?? TRACE_TERMINAL_GAP;
  return traceGeometryBetween(
    traceRouteStart(request.from, gap),
    traceRouteEnd(request.to, gap),
    request,
  );
}

/**
 * The routing half on its own, over endpoints that are ALREADY pulled back.
 *
 * WHY this is a separate function and not an implementation detail inlined
 * into `traceGeometry`: the gap pull-back consumes `dir` too — moving the
 * endpoint 16px along the flow — so a naive "permute `to.dir` and see if the
 * path changes" test answers TRUE for every routing, `straight` included,
 * because the endpoint moved. Measured before it was believed (2026-09-17):
 * with the pull-back folded in, `straight` reported `readsTo = true`, which
 * flatly contradicts docs/TRACE-PLAN.md's "straight is tangent-blind
 * everywhere" and would have shipped a gallery captioning a plain chord as
 * tangent-aware. `traceReadsTangent` therefore pulls back ONCE with the
 * request's real dirs and permutes only the `dir` the ROUTER sees, which is
 * the question actually being asked.
 */
export function traceGeometryBetween(
  start: TraceTerminalSpec,
  end: TraceTerminalSpec,
  request: Omit<TraceRouteRequest, "from" | "to" | "gap">,
): TraceGeometry {
  if (request.routing === "elbow") {
    const input = elbowInputFromTerminals({
      from: start,
      to: end,
      ...(request.obstacles ? { obstacles: request.obstacles } : {}),
      fromBox: request.fromBox ?? null,
      toBox: request.toBox ?? null,
      ...(request.pins ? { pins: request.pins } : {}),
      ...(request.elbowOptions ? { options: request.elbowOptions } : {}),
    });
    const route = routeElbow(input);
    const points = routePoints(route);
    return {
      routing: "elbow",
      path: elbowPath(route),
      points,
      length: polylineLength(points),
      // Read back off the input the ROUTER was actually given, never
      // re-derived from the terminals. Mutation testing (2026-09-17) found
      // why that distinction has teeth: an earlier version computed `sides`
      // here with its own `traceSideOf` call, and breaking THAT copy —
      // dropping the `OPPOSITE_DIR` flip at the `to` end — changed nothing
      // anyone could observe, because the router had already derived the
      // real sides inside `elbowInputFromTerminals`. A second derivation of
      // one number is how the two stop agreeing; there is now only one.
      sides: { start: input.start.side, end: input.end.side },
      // The middle of the polyline: for an elbow the "centre control point"
      // is a PIN, not an offset, so the honest waypoint is just the route's
      // own midpoint rather than a number a pin could be read back out of.
      // Shared with `straight`'s own polyline midpoint (D2 of
      // docs/TRACE-CONTROL-POINTS-PLAN.md) via `trace.layout.ts`'s
      // `pointAtFraction` — this file used to carry a second, near-identical
      // restatement of that same arc-length walk (`pointAtPolylineFraction`
      // below), which is exactly the kind of drift the plan calls out: "do
      // not invent a second rule." One function now serves both branches.
      waypoint: pointAtFraction(points, 0.5),
      start,
      end,
    };
  }

  const route = routeTrace(request.routing as DirectRouting, start, end, {
    curve: request.curve ?? null,
    slantT: request.slantT ?? null,
    bends: request.bends ?? null,
  });
  return {
    routing: route.routing,
    path: route.path,
    points: route.points,
    length: route.points ? polylineLength(route.points) : 0,
    sides: route.sides,
    waypoint: route.waypoint,
    start,
    end,
  };
}

/**
 * Does `routing` actually READ the flow tangent at `end`, for THIS request?
 *
 * MEASURED, never tabled. `trace.routing.ts` defines "blind" falsifiably —
 * "the returned geometry is INVARIANT under changing that end's `dir`" — so
 * this permutes that end's `dir` through all four values with every other
 * input held fixed and counts distinct `path` strings. One distinct path
 * means the function never looked; more than one means it did.
 *
 * WHY this and not `honorsTangent` from `trace.routing.ts`:
 *
 *  1. That table has no `elbow` row, by its own deliberate choice ("this
 *     lane asserting something about a router it does not own"). This
 *     covers elbow for free, because it never names a routing.
 *  2. The table is GEOMETRY-INDEPENDENT and therefore wrong on a degenerate
 *     chord: `TRACE_ROUTING_TANGENTS.slanted.from` is a flat `"honored"`,
 *     but `getSlantedArrowPoints` returns `[start, end]` — ignoring the
 *     departure entirely — the moment `|dx|` or `|dy|` drops under 0.001.
 *     A gallery built on the natural axis-aligned layout would have
 *     captioned a plain chord "leaves along from.dir". Measuring instead of
 *     asking cannot make that mistake, and `Degenerate` renders exactly
 *     that case to prove the difference is real rather than theoretical.
 *
 * NOT the whole story on its own: reading a tangent and ARRIVING along it
 * are two different facts, and a chord can arrive along `to.dir` by
 * coincidence without ever reading it (the plan's own "chord happens to
 * align"). `TracePolarity.stories.tsx` measures the arrival angle off the
 * rendered path and requires BOTH.
 */
export function traceReadsTangent(request: TraceRouteRequest, end: "from" | "to"): boolean {
  const gap = request.gap ?? TRACE_TERMINAL_GAP;
  // Pulled back ONCE, with the request's real dirs, and then held fixed —
  // see `traceGeometryBetween` for why folding the pull-back into the
  // permutation makes every routing look tangent-aware.
  const start = traceRouteStart(request.from, gap);
  const end_ = traceRouteEnd(request.to, gap);
  const paths = new Set(
    TRACE_DIRS.map(
      (dir) =>
        traceGeometryBetween(
          end === "from" ? { ...start, dir } : start,
          end === "to" ? { ...end_, dir } : end_,
          request,
        ).path,
    ),
  );
  return paths.size > 1;
}

// WHY `from` and `to` are omitted from the `<g>` props (the same collision
// `TraceBody` hit with `points`, and caught the same way — by `tsc`, not by a
// cast): React's `SVGProps` gives every SVG element the SMIL animation
// attributes `from`/`to`, typed `string | number`. The two terminal props
// below are the genuine names for this component, so the animation
// attributes are what give way.
export interface TraceRouteProps
  extends Omit<ComponentProps<"g">, "id" | "from" | "to">,
    Omit<TraceRouteRequest, "routing"> {
  /** Host id — hex-encoded into the marker id, exactly as `TraceBody` says. */
  id: string;
  /** Defaults to `curved` — the kit's own default, and the only one of the
   * four that honours both flow tangents with no control point touched. */
  routing?: TraceRouting;
  variant?: TraceVariant;
  color?: string;
  animated?: boolean;
  splitAtLabel?: boolean;
  labelPosition?: number;
  markerEnd?: TraceMarkerEnd;
  strokeWidth?: number;
  vectorEffect?: "non-scaling-stroke";
  interactive?: boolean;
  /** See `TraceProps.tunnel`. `Trace` additionally SUPPLIES the points a
   * `hidden` tunnel needs — including a curve's, sampled off the mounted
   * path — so tunnelling works on every routing kind here. */
  tunnel?: TunnelDisplayState;
  /** See `TraceProps.crossing`. */
  crossing?: CrossingMark;
  /** Forwarded to `TraceBody` — see its own doc. */
  hitStrokePx?: number;
  /** Forwarded to `TraceBody` — see its own doc. */
  showHitRegion?: boolean;
  /** Forwarded to `TraceBody` — see its own doc. */
  diagnostics?: Diagnostic[];
  /** Draw the two endpoint glyphs. On by default — `Trace` is "the whole
   * thing"; a host with real `Port`s passes `false`. */
  terminals?: boolean;
  terminalRadius?: number;
  terminalColor?: string;
  /** Fired with the resolved geometry after layout, so a host can hand the
   * polyline to `TraceBadge`. For a curve the `points` handed over are
   * SAMPLED off the mounted path (`TRACE_CURVE_SAMPLES`) and `length` is the
   * real `getTotalLength()`. */
  onGeometry?: (geometry: TraceGeometry) => void;
  curveSamples?: number;
}

/**
 * Two terminal specs and a routing kind in, the whole drawn thing out.
 *
 * The curve measurement, and why it needs a layout effect at all: a cubic's
 * arc length is not available from the control points without an integral,
 * and the browser already computes it exactly — `getTotalLength()`. So a
 * curved trace paints once with `length: 0` (which changes nothing for
 * `data`, and only the dash PHASE for `async` on a path shorter than one
 * 74px cadence), then re-renders with the measured value. Stated plainly
 * because "one extra render on curves" is a real cost, not an invisible one.
 */
export function Trace({
  from,
  to,
  routing = "curved",
  gap,
  curve,
  slantT,
  bends,
  pins,
  obstacles,
  fromBox,
  toBox,
  elbowOptions,
  id,
  variant = "data",
  color,
  animated,
  splitAtLabel,
  labelPosition,
  markerEnd = "arrow",
  strokeWidth,
  vectorEffect,
  interactive,
  tunnel = "off",
  crossing = "none",
  hitStrokePx,
  showHitRegion,
  diagnostics,
  terminals = true,
  terminalRadius,
  terminalColor,
  onGeometry,
  curveSamples = TRACE_CURVE_SAMPLES,
  className,
  ...props
}: TraceRouteProps) {
  // Geometry AND per-end arrow fidelity, derived together — see
  // `TraceTerminal`'s own `showDirection` doc for the underlying claim.
  // WHY this lives here rather than being left to each caller: `Trace` is
  // already the one place that turns a routing KIND into geometry (this
  // file's own P6 header), so it is the one place that can honestly answer
  // "does the picture I'm about to draw actually depend on this end's
  // dir" without a caller re-deriving `traceReadsTangent` itself (which
  // would either duplicate this call or, worse, hardcode routing names —
  // exactly the trap `TracePolarity.stories.tsx` documents at length).
  // Measured with `traceReadsTangent`, never read off a static per-routing
  // table: `routingTangents`'s own table is geometry-INDEPENDENT and wrong
  // on a bent curve or a degenerate slanted chord (see that function's doc
  // comment), and a terminal glyph that trusted the table over the actual
  // geometry would repeat the exact bug this component exists to fix.
  const { geometry, showFromDirection, showToDirection } = useMemo(() => {
    const request: TraceRouteRequest = {
      from,
      to,
      routing,
      gap,
      curve,
      slantT,
      bends,
      pins,
      obstacles,
      fromBox,
      toBox,
      elbowOptions,
    };
    return {
      geometry: traceGeometry(request),
      showFromDirection: traceReadsTangent(request, "from"),
      showToDirection: traceReadsTangent(request, "to"),
    };
  },
    // WHY the two terminals and `curve` are spread into scalars rather than
    // listed as objects: a caller writing `from={{ x, y, dir: "right" }}`
    // inline — which every story here does, and which is the natural way to
    // use this — would otherwise hand a fresh object identity on every render
    // and re-run the A* router each time. The elbow collections BELOW are
    // still compared by identity, because they have no fixed shape to spread;
    // a host that rebuilds its obstacle array every frame pays for a re-route
    // every frame, and that is the one perf footgun in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      from.x, from.y, from.dir,
      to.x, to.y, to.dir,
      routing, gap,
      curve?.dx, curve?.dy, slantT,
      bends, pins, obstacles, fromBox, toBox, elbowOptions,
    ],
  );

  const hostRef = useRef<SVGGElement | null>(null);
  const [measuredLength, setMeasuredLength] = useState<number | null>(null);
  // A curve has no vertices until the browser has one — and `tunnel:
  // "hidden"` needs vertices to slice its two mouths out of. The effect
  // below already samples them for `onGeometry`; keeping them lets a curved
  // cable tunnel exactly like a straight one. Cost, stated: a curved tunnel
  // paints its full route for one frame, the same extra pass `Trace`
  // already documents for curve length.
  const [measuredPoints, setMeasuredPoints] = useState<readonly Point[] | null>(null);
  // The callback in a ref so a caller passing an inline arrow does not make
  // the effect below re-fire on every render.
  const onGeometryRef = useRef(onGeometry);
  onGeometryRef.current = onGeometry;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const line = host?.querySelector<SVGPathElement>('[data-slot="trace-line"]') ?? null;
    let resolved = geometry;
    if (geometry.points === null && line) {
      const total = line.getTotalLength();
      const sampled: Point[] = [];
      for (let i = 0; i <= curveSamples; i += 1) {
        const p = line.getPointAtLength((total * i) / curveSamples);
        sampled.push({ x: p.x, y: p.y });
      }
      resolved = { ...geometry, length: total, points: sampled };
      setMeasuredLength(total);
      setMeasuredPoints(sampled);
    } else {
      setMeasuredLength(null);
      setMeasuredPoints(null);
    }
    onGeometryRef.current?.(resolved);
  }, [geometry, curveSamples]);

  return (
    <g
      data-slot="trace-route"
      data-routing={geometry.routing}
      data-side-start={geometry.sides.start}
      data-side-end={geometry.sides.end}
      ref={hostRef}
      className={cn(className)}
      {...props}
    >
      <TraceBody
        id={id}
        path={geometry.path}
        length={measuredLength ?? geometry.length}
        points={geometry.points ?? measuredPoints ?? undefined}
        tunnel={tunnel}
        crossing={crossing}
        variant={variant}
        color={color}
        animated={animated}
        splitAtLabel={splitAtLabel}
        labelPosition={labelPosition}
        markerEnd={markerEnd}
        strokeWidth={strokeWidth}
        vectorEffect={vectorEffect}
        interactive={interactive}
        hitStrokePx={hitStrokePx}
        showHitRegion={showHitRegion}
        diagnostics={diagnostics}
      />
      {terminals ? (
        <>
          <TraceTerminal
            data-end="from"
            x={from.x}
            y={from.y}
            dir={from.dir}
            radius={terminalRadius}
            color={terminalColor}
            showDirection={showFromDirection}
          />
          <TraceTerminal
            data-end="to"
            x={to.x}
            y={to.y}
            dir={to.dir}
            radius={terminalRadius}
            color={terminalColor}
            showDirection={showToDirection}
          />
        </>
      ) : null}
    </g>
  );
}
