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

import { useMemo, type ComponentProps } from "react";

import { cn } from "../lib/utils";
import { sketchEllipsePath } from "../skin/sketchPath";
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
  // The skin seam (src/skin/skin.ts + skin.css). The ring's colour is
  // STATE-owned (`color`, from the caller — same split Port's own
  // `portRingColor` makes: the skin only ever supplies the shape, never
  // the hue), so it gets `--bbox-skin-line-override` rather than
  // `--bbox-skin-stroke` — exactly Badge's `outline` variant's own
  // reasoning. Undefined on every skin but sketch, so the fallback IS
  // `color` and a consumer who never imports skin.css renders the exact
  // circle this replaced.
  //
  // The drawn twin below (`sketchEllipsePath`, the same generator
  // `SketchOutline` uses internally) can't just BE `SketchOutline` — that
  // component assumes an HTML/CSS positioning context (`position:
  // absolute` against a `position: relative` ancestor) and this glyph is
  // pure SVG, positioned by its own `<g transform>`. So this hand-rolls
  // the same crisp/sketch pair `trace.tsx`'s own `TraceBody` uses: the
  // circle's FILL always paints (an opaque disc, never sketched — see
  // this file's own `fill` doc), only its stroke is suppressed, and a
  // `<path>` twin — toggled by the same `--bbox-skin-outline` display
  // switch — draws the ring by hand. The inner arrow stays crisp always,
  // same precedent as Port's lit core never getting a drawn twin either.
  const ringD = useMemo(
    () => sketchEllipsePath({ width: radius * 2, height: radius * 2, seed: `trace-terminal:${dir}:${radius}` }),
    [radius, dir],
  );
  return (
    <g
      data-slot="trace-terminal"
      data-dir={dir}
      transform={`translate(${x} ${y}) rotate(${DIR_ROTATION[dir]})`}
      className={cn(className)}
      {...props}
    >
      <circle
        data-slot="trace-terminal-ring"
        cx={0}
        cy={0}
        r={radius}
        fill={fill}
        style={{ stroke: `var(--bbox-skin-line-override, ${color})` }}
        strokeWidth={TRACE_TERMINAL_RING_PX}
      />
      <path
        data-slot="trace-terminal-ring-sketch"
        d={ringD}
        transform={`translate(${-radius} ${-radius})`}
        fill="none"
        stroke={color}
        strokeWidth={TRACE_TERMINAL_RING_PX}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "var(--bbox-skin-outline, none)" }}
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
