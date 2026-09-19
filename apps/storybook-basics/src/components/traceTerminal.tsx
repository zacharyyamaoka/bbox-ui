"use client";

// src/components/traceTerminal.tsx — NET-NEW (docs/TRACE-PLAN.md P1). Not a
// port: neither `packages/bbox-ui` nor SystemSketch has a terminal glyph.
//
// WHY this exists at all, and why it is NOT a `Port`: Zach's explicit
// reversal — "Let's not use real ports. We can just draw a circle with an
// arrow inside that shows the polarity... they just take an xy position and
// a polarity, and input/output direction." These are ILLUSTRATION props for
// the trace galleries, so nothing here imports `port.tsx`, and a real board
// would mount a real `Port` instead. Keeping them separate is what stops a
// story fixture from quietly becoming a second, competing port component.
//
// WHY `{x, y, dir}` and no polarity prop: (face, polarity) -> flow tangent
// is 2-to-1, so the eight pairs quotient to four glyphs — Zach's own
// correction, "really 4 options not 8 because top input is the same as
// bottom output." The full argument, and the `side(from)`/`side(to)`
// derivation that keeps the ROUTE knowing which end is which, live on
// `TraceDir` in `./trace.layout.ts`. The arrowhead that distinguishes the
// ends is painted by the trace (`markerEnd` at the `to` end), never here.

import { type ComponentProps, type CSSProperties } from "react";

import { cn } from "../lib/utils";
import { DIR_ROTATION, type TraceDir } from "./trace.layout";

/** The glyph's ring radius in user units. 9 keeps it a touch smaller than
 * `Port`'s `md` dot so a terminal never reads as a port. */
export const TRACE_TERMINAL_RADIUS = 9;
export const TRACE_TERMINAL_RING_PX = 2;

/**
 * The arrow inside the ring, authored pointing +x (i.e. `dir: "right"`) and
 * rotated by `DIR_ROTATION`. Expressed as fractions of the radius so the
 * glyph scales as one piece.
 *
 * The tail deliberately stops SHORT of where the tip reaches (0.40r behind
 * the centre vs 0.50r ahead) for LEGIBILITY ONLY: at an 18px ring a shaft
 * centred on the disc reads as a plus sign, and the short tail biases the
 * whole mark forward so it reads as travelling.
 *
 * It is NOT what makes the glyph measurably directional — mutation-testing
 * this (2026-09-17, tail 0.40r -> 0.50r) left `Trace.stories.tsx` green,
 * because the HEAD alone already pulls the arc-length centroid ~1.4px onto
 * the `dir` side. The head is the load-bearing part of that measurement;
 * deleting it drops the centroid offset under the story's 1px floor and
 * turns the suite red. Recorded so a future tidy-up does not "simplify" the
 * head away on the theory that the shaft carries the direction.
 */
function arrowPath(radius: number): string {
  const tail = -0.4 * radius;
  const tip = 0.5 * radius;
  const barbX = 0.075 * radius;
  const barbY = 0.36 * radius;
  return `M ${tail} 0 L ${tip} 0 M ${barbX} ${-barbY} L ${tip} 0 L ${barbX} ${barbY}`;
}

export interface TraceTerminalProps extends Omit<ComponentProps<"g">, "x" | "y"> {
  x: number;
  y: number;
  /** The flow tangent — the direction data travels THROUGH this point.
   * NOT a face and NOT a polarity; see `TraceDir`. */
  dir: TraceDir;
  radius?: number;
  /** Any CSS colour. Defaults to the accent `Port` already uses for
   * `wired` (docs/TRACE-PLAN.md D8: the screenshot's amber IS this repo's
   * orange, so no new token). */
  color?: string;
  /** What fills the disc. Opaque on purpose — an opaque disc hides the
   * trace's own stroke running underneath it, so the line reads as
   * arriving AT the terminal rather than through it. */
  fill?: string;
  /**
   * Draw the arrow that claims this end's flow tangent. Defaults to
   * `true` so every existing caller is unaffected.
   *
   * WHY this exists: `dir` is a fact about the TERMINAL — it is always
   * well-defined — but the arrow is a claim about the ROUTE, namely that
   * the painted path actually leaves or arrives along it. `straight` and
   * `slanted` don't honor that claim at every end (`TRACE_ROUTING_TANGENTS`
   * / `routingTangents` in `trace.routing.ts` — the fidelity is per END and
   * per ROUTING, not a blanket "these two kinds never show polarity": a
   * `slanted` trace honors its SOURCE and is blind only at its target). A
   * caller whose routing doesn't read this end's `dir` passes `false`
   * rather than let the glyph assert a polarity the geometry ignores —
   * this was Zach's own correction on the `TracePolarity` gallery, which
   * drew an arrow on every terminal regardless of whether anything
   * downstream ever looked at it.
   *
   * The ring's radius and centre never move when this is `false` — only
   * the arrow `<path>` is omitted — so a blind and an honored terminal
   * still line up size-for-size in a gallery row.
   */
  showDirection?: boolean;
}

/**
 * An SVG `<g>` — mount it inside an `<svg>`, positioned by its own
 * `x`/`y`, not by CSS. Renders nothing interactive: no pointer handlers, no
 * hit halo, no state. A story that wants a terminal to be draggable adds
 * that itself.
 */
export function TraceTerminal({
  x,
  y,
  dir,
  radius = TRACE_TERMINAL_RADIUS,
  color = "var(--bbox-primary, var(--primary))",
  fill = "var(--card)",
  showDirection = true,
  className,
  ...props
}: TraceTerminalProps) {
  // WHY this glyph's drawn twin now lives at the boundary, not here
  // (docs/peps/0001-sketch-skin-at-the-boundary.md M5b): before this
  // migration, `SketchOutline` couldn't be used — it assumes HTML/CSS
  // positioning (`position: absolute` against a `position: relative`
  // ancestor) and this glyph is pure SVG, positioned by its own `<g
  // transform>` — so this hand-rolled the same crisp/sketch pair
  // `trace.tsx`'s own `TraceBody` used to. The boundary has no such
  // problem: `sketchAtEdge.ts` appends a twin `<svg>` into THIS `<g>`
  // (added to `DOT_SELECTOR`), which already inherits the `translate`/
  // `rotate` transform above — the hand-rolled duplicate existed only
  // because the core's own abstraction could not reach this case. The
  // circle's fill still always paints (an opaque disc, never sketched —
  // see this file's own `fill` doc); only its stroke is suppressed, now
  // by the boundary's own crisp-suppression CSS rather than a per-skin
  // `display` switch on a twin this file drew itself.
  return (
    <g
      data-slot="trace-terminal"
      data-dir={dir}
      transform={`translate(${x} ${y}) rotate(${DIR_ROTATION[dir]})`}
      className={cn(className)}
      // WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M6. `color` is
      // this glyph's own STATE-owned colour (the caller's prop, same split
      // `portRingColor` makes), published here so a boundary sketch pass
      // can draw the ring in the right colour without reading a
      // `stroke`/`border-color` the skin has already blanked.
      style={{ "--bbox-ink-state": color } as CSSProperties}
      {...props}
    >
      <circle
        data-slot="trace-terminal-ring"
        cx={0}
        cy={0}
        r={radius}
        fill={fill}
        // WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M7. This
        // component's own seed (`trace-terminal:${dir}:${radius}`),
        // published on the RING ITSELF rather than the parent `<g>` the
        // plan's table names — `sketchAtEdge.ts`'s RING_SELECTOR loop
        // reads `data-bbox-seed` off the circle it measures, matching
        // where the M5b build deviation (see the build report) actually
        // reads geometry from.
        data-bbox-seed={`trace-terminal:${dir}:${radius}`}
        // WHY `--bbox-skin-line-override` stays (deviation from the
        // migration plan's literal table, which said to drop it — see the
        // build report): dropping it would leave the crisp ring visible
        // forever, even under the sketch skin. Block/Badge/PortEdge all
        // keep the identical read for the identical reason — this token is
        // the UNCHANGED, token-layer mechanism (docs/peps/0001's own "token
        // styling stays exactly as it is") that blanks a state-owned line
        // to transparent under sketch, and it is the only way to hide just
        // the STROKE while the circle's opaque `fill` keeps painting; a
        // `display:none` on the whole element (the mechanism `trace-line`
        // uses) would hide the fill too.
        style={{ stroke: `var(--bbox-skin-line-override, ${color})` }}
        strokeWidth={TRACE_TERMINAL_RING_PX}
      />
      {showDirection ? (
        <path
          data-slot="trace-terminal-arrow"
          d={arrowPath(radius)}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1, radius * 0.2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}
