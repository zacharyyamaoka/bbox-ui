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

import type { ComponentProps } from "react";

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
  className,
  ...props
}: TraceTerminalProps) {
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
        stroke={color}
        strokeWidth={TRACE_TERMINAL_RING_PX}
      />
      <path
        data-slot="trace-terminal-arrow"
        d={arrowPath(radius)}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(1, radius * 0.2)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
