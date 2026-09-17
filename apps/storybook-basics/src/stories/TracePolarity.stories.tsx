import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import {
  TRACE_CURVE_SAMPLES,
  TRACE_TERMINAL_GAP,
  Trace,
  traceGeometry,
  traceReadsTangent,
  traceRouteEnd,
  traceRouteStart,
  type TraceGeometry,
  type TraceRouteRequest,
} from "../components/trace";
import {
  DIR_VECTOR,
  OPPOSITE_DIR,
  TRACE_DIRS,
  polylineLength,
  type Point,
  type TraceDir,
  type TraceRouting,
  type TraceTerminalSpec,
} from "../components/trace.layout";
import { honorsTangent } from "../components/trace.routing";

/* ==========================================================================
 * TracePolarity — the gallery Zach actually asked for.
 *
 * "keep the one port fixed but permutate the other, so you would have 8
 * examples in the gallery" — then his own correction, "really 4 options not 8
 * because top input is the same as bottom output." Both are right, and the
 * plan records why: (face, polarity) maps onto a FLOW TANGENT exactly 2-to-1,
 * so the eight port configurations quotient to four glyphs and the component
 * takes no polarity prop at all.
 *
 * Four tangents is therefore the width of the gallery. Its HEIGHT is the four
 * routings, because the honest answer to "does this work?" is different per
 * routing — "for some lines that won't be supported like straight/slanted
 * etc... but for some like the elbow it can deal with that". So the deliverable
 * is a matrix, routing x tangent, with the unsupported cells RENDERED and
 * LABELLED rather than omitted (docs/TRACE-PLAN.md D7). Hiding them would hide
 * the reason elbow exists.
 *
 * ---------------------------------------------------------------------------
 * How a cell decides it is supported — measured twice, asserted three ways
 * ---------------------------------------------------------------------------
 *
 * "Honors the tangent" is TWO facts that are easy to confuse, and confusing
 * them is how a gallery ends up lying:
 *
 *   1. READS it. `trace.routing.ts` defines this falsifiably: the geometry is
 *      INVARIANT under changing that end's `dir`. `traceReadsTangent` measures
 *      exactly that, by permuting the dir with the route's endpoints pinned.
 *   2. ARRIVES along it. Measured here off the PAINTED `SVGPathElement` with
 *      `getPointAtLength`, never read back out of the model that drew it.
 *
 * A straight chord between two horizontally separated terminals ARRIVES
 * travelling "right" without the function ever having READ a dir — the plan's
 * own "chord happens to align". `Degenerate` below renders that exact trap at
 * 0.0 degrees of arrival error and still labels it blind, because the
 * invariance measurement says the dir was never consulted.
 *
 * `data-supported` is fact 1 (the only one available before the path mounts).
 * The play functions assert fact 2 for every supported cell, assert that every
 * unsupported cell fails at least one of the two, and — the assertion that
 * actually pins the matrix — re-derive the whole supported SET from
 * measurement and require it to be exactly {curved, elbow}.
 * ========================================================================== */

const ROUTINGS: TraceRouting[] = ["straight", "slanted", "curved", "elbow"];

/** Fixed source: bottom-left, flowing right. Zach's "keep the one port fixed". */
const FROM_FIXED: TraceTerminalSpec = { x: 34, y: 150, dir: "right" };
/** Fixed target POSITION. Only its `dir` permutes — so every cell in a row
 * differs by exactly one thing, which is what makes the row a comparison
 * rather than four unrelated pictures. */
const TO_POS = { x: 262, y: 54 };

/** Fixed target for the mirrored gallery, and the source position whose `dir`
 * permutes there. */
const TO_FIXED: TraceTerminalSpec = { x: 262, y: 54, dir: "right" };
const FROM_POS = { x: 34, y: 150 };

/**
 * WHY the two terminals are deliberately OFF a shared axis (y 150 vs 54): a
 * chord with either delta under 0.001 makes `getSlantedArrowPoints` return
 * early — two points, departure ignored — so `slanted` would be blind at BOTH
 * ends and the row would be a duplicate of `straight`. That degeneracy is real
 * and is not swept under the rug: `Degenerate` is a whole story about it. It
 * is kept OUT of the matrices so each routing is shown doing the most it can.
 */
const AXIS_OFFSET_IS_DELIBERATE = FROM_FIXED.y !== TO_POS.y;

/* ------------------------------------------------------------------ */
/* Geometry helpers — pure, and used only for LAYOUT (the viewBox).     */
/* Nothing below decides whether a cell is supported.                   */
/* ------------------------------------------------------------------ */

/**
 * Every coordinate pair in an SVG `d`. For `M`/`L` those are the vertices; for
 * `C`/`Q` they are the CONTROL POLYGON, and a Bezier lies inside the convex
 * hull of its control points — so using them as bounds is conservative (never
 * clips), which is the only property a viewBox needs. Safe here because this
 * file's paths only ever contain M/L/C/Q, all of which take coordinate pairs.
 */
function pathPoints(d: string): Point[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function unionBox(points: readonly Point[], into?: Box): Box {
  let box = into ?? {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const p of points) {
    box = {
      minX: Math.min(box.minX, p.x),
      minY: Math.min(box.minY, p.y),
      maxX: Math.max(box.maxX, p.x),
      maxY: Math.max(box.maxY, p.y),
    };
  }
  return box;
}

/**
 * ONE viewBox for every cell in a matrix.
 *
 * WHY shared and not per-cell: the gallery's whole job is a comparison, and a
 * per-cell frame silently re-scales each picture — a wrap-around route would
 * be drawn smaller than a straight one and the eye would read that as "the
 * wrap is shorter", which is false. A shared frame costs some whitespace in
 * the simple cells and buys a comparison that means what it looks like.
 */
function sharedViewBox(requests: readonly TraceRouteRequest[], glyphRadius = 12): string {
  let box: Box | undefined;
  for (const request of requests) {
    const geometry = traceGeometry(request);
    box = unionBox(pathPoints(geometry.path), box);
    box = unionBox(
      [
        { x: request.from.x - glyphRadius, y: request.from.y - glyphRadius },
        { x: request.from.x + glyphRadius, y: request.from.y + glyphRadius },
        { x: request.to.x - glyphRadius, y: request.to.y - glyphRadius },
        { x: request.to.x + glyphRadius, y: request.to.y + glyphRadius },
      ],
      box,
    );
  }
  const pad = 14;
  const b = box ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`;
}

const DIR_ARROW: Record<TraceDir, string> = {
  top: "↑",
  right: "→",
  bottom: "↓",
  left: "←",
};

function angleBetweenDeg(a: Point, b: Point): number {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * The painted tangent at one end of a REAL `SVGPathElement`, taken over a 1px
 * window of arc length.
 *
 * WHY 1px and why off the element rather than off a sampled array: a cubic's
 * tangent is exact only AT the endpoint, and every pixel you step back picks
 * up curvature. Measuring the curved cells from `Trace`'s own 65-point sample
 * (a ~5px final step) reported 3.2 degrees of arrival error where the true
 * tangent is 0.0 — a number close enough to the 5-degree tolerance to be
 * misread as "nearly failing" when nothing is wrong at all. 1px of the browser
 * is both more accurate and shorter than the shortest final leg in any fixture
 * here (the 16px terminal gap), so the window never straddles a corner.
 */
function pathTangent(path: SVGPathElement, end: "from" | "to", window = 1): Point {
  const total = path.getTotalLength();
  const step = Math.min(window, total / 4);
  const [a, b] =
    end === "to"
      ? [path.getPointAtLength(total - step), path.getPointAtLength(total)]
      : [path.getPointAtLength(0), path.getPointAtLength(step)];
  return { x: b.x - a.x, y: b.y - a.y };
}

/* ------------------------------------------------------------------ */
/* One cell                                                            */
/* ------------------------------------------------------------------ */

interface CellProps {
  testid: string;
  request: TraceRouteRequest;
  /** Which end this cell is a statement about. */
  end: "from" | "to";
  viewBox: string;
  /** Extra caption line under the fidelity verdict. */
  note?: string;
}

/**
 * A cell renders EXACTLY what the routing function returns (D7) — an
 * unsupported cell is not dimmed, not omitted, not redrawn. What changes is
 * the caption and a muted badge, because the limitation is information, not
 * an error.
 */
function Cell({ testid, request, end, viewBox, note }: CellProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geometry, setGeometry] = useState<TraceGeometry | null>(null);
  const [offBy, setOffBy] = useState<number | null>(null);
  const dir = end === "from" ? request.from.dir : request.to.dir;
  const reads = traceReadsTangent(request, end);

  // The number in the caption is MEASURED off the painted path after layout,
  // not computed from the model that drew it. That is the whole argument of
  // this file made visible: a cell can show a perfect arrival angle and still
  // be labelled blind, because the two facts are independent.
  useLayoutEffect(() => {
    const line = svgRef.current?.querySelector<SVGPathElement>('[data-slot="trace-line"]');
    if (!line) return;
    setOffBy(angleBetweenDeg(pathTangent(line, end), DIR_VECTOR[dir]));
  }, [geometry, end, dir]);

  const side = end === "from" ? dir : OPPOSITE_DIR[dir];
  const [, , vw, vh] = viewBox.split(" ").map(Number);

  return (
    <figure
      data-testid={testid}
      data-slot="polarity-cell"
      data-dir={dir}
      data-end={end}
      data-routing={request.routing}
      data-supported={String(reads)}
      style={{
        margin: 0,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <svg
        data-slot="polarity-canvas"
        ref={svgRef}
        viewBox={viewBox}
        width="100%"
        style={{ display: "block", aspectRatio: `${vw} / ${vh}` }}
      >
        <Trace id={testid} {...request} onGeometry={setGeometry} />
      </svg>
      <figcaption
        data-slot="polarity-caption"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "7px 10px 9px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div data-slot="polarity-heading" style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "ui-monospace, monospace",
              color: "var(--foreground)",
            }}
          >
            {end}.dir {DIR_ARROW[dir]} {dir}
          </span>
          <span
            data-slot="polarity-verdict"
            style={{
              fontSize: 10,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              padding: "1px 6px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              color: reads ? "var(--bbox-primary, var(--primary))" : "var(--muted-foreground)",
              background: reads ? "transparent" : "var(--muted)",
            }}
          >
            {reads ? "honors" : "blind"}
          </span>
        </div>
        <div
          data-slot="polarity-reason"
          style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.35 }}
        >
          {reads
            ? `reads ${end}.dir · side(${end}) = ${side}`
            : `never reads ${end}.dir — same path for all four`}
        </div>
        <div
          data-slot="polarity-measured"
          data-off-deg={offBy === null ? "" : offBy.toFixed(3)}
          style={{
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color:
              offBy === null
                ? "var(--muted-foreground)"
                : offBy < 5
                  ? "var(--bbox-primary, var(--primary))"
                  : "var(--muted-foreground)",
          }}
        >
          {offBy === null
            ? "measuring…"
            : `painted tangent ${offBy.toFixed(1)}° off ${DIR_ARROW[dir]}`}
        </div>
        {note ? (
          <div
            data-slot="polarity-note"
            style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.35 }}
          >
            {note}
          </div>
        ) : null}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix scaffolding                                                  */
/* ------------------------------------------------------------------ */

/** What the four routings do, in one line each, beside their row. Sourced
 * from docs/TRACE-PLAN.md's matrix and asserted below, not decorative. */
const ROUTING_NOTE: Record<TraceRouting, string> = {
  straight: "a chord. Never reads either dir — it can only look right by coincidence.",
  slanted: "axis lead along from.dir, then one diagonal. Reads the source, never the target.",
  curved: "cubic leaving each face along its normal. Reads both ends.",
  elbow: "A* around keep-outs. Reads both ends — that is what it is for.",
};

function MatrixShell({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div style={{ padding: 18, background: "var(--background)" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
        {title}
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--muted-foreground)",
          maxWidth: 780,
        }}
      >
        {lede}
      </p>
      {children}
    </div>
  );
}

function MatrixRow({ routing, children }: { routing: TraceRouting; children: ReactNode }) {
  return (
    <div
      data-testid={`polarity-row-${routing}`}
      style={{
        display: "grid",
        gridTemplateColumns: "150px repeat(4, minmax(0, 1fr))",
        gap: 12,
        alignItems: "start",
        marginBottom: 14,
      }}
    >
      <div style={{ paddingTop: 4 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "ui-monospace, monospace",
            color: "var(--foreground)",
          }}
        >
          {routing}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4, marginTop: 3 }}>
          {ROUTING_NOTE[routing]}
        </div>
      </div>
      {children}
    </div>
  );
}

function ColumnHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</div>
      {TRACE_DIRS.map((dir) => (
        <div
          key={dir}
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "ui-monospace, monospace",
            color: "var(--foreground)",
          }}
        >
          {DIR_ARROW[dir]} {dir}
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Trace/Polarity",
  component: Trace,
  parameters: { layout: "fullscreen" },
  args: { id: "polarity", from: FROM_FIXED, to: { ...TO_POS, dir: "right" as TraceDir } },
} satisfies Meta<typeof Trace>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Measurement — off the RENDERED path, never off the model            */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

function samplePath(path: SVGPathElement, samples = 600): Point[] {
  const total = path.getTotalLength();
  const out: Point[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const p = path.getPointAtLength((total * i) / samples);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function toScreen(svg: SVGGraphicsElement, x: number, y: number): DOMPoint {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("element has no screen CTM");
  return new DOMPoint(x, y).matrixTransform(ctm);
}

/**
 * The checks every cell in every story below owes, measured off the DOM:
 * endpoints sit in the terminal gap, the glyphs sit on their own `{x, y}`,
 * exactly one arrowhead and it is at the `to` end.
 */
async function assertCellFrame(
  cell: Element,
  request: TraceRouteRequest,
  points: readonly Point[],
): Promise<void> {
  // The card's own <svg>, whatever slot name its story gave it — this helper
  // is shared by two different card shapes and must not be coupled to either.
  const svg = requireEl<SVGSVGElement>(cell, "svg");
  const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');

  // 1. The wire stops short of both glyphs, and stops short in the RIGHT
  //    DIRECTION. Stated as raw geometry — the offset vector from each glyph
  //    centre to the painted endpoint — and never by calling
  //    `traceRouteStart`/`traceRouteEnd`, which are the functions under test.
  //
  //    WHY that distinction earns its keep, found by mutation testing
  //    (2026-09-17): an earlier version compared the painted endpoint to
  //    `traceRouteEnd(request.to, GAP_PX)` and separately checked the DISTANCE
  //    was 16px. Flipping the sign inside `traceRouteEnd` — so the wire
  //    overshoots 16px PAST the target instead of stopping 16px behind it,
  //    the exact error its own comment warns is "not a sign error" — passed
  //    both checks: the first moved its ruler along with the mutation, and
  //    16px on the wrong side is still 16px away. The vector below cannot be
  //    fooled that way, because a flipped pull-back points 180 degrees off.
  assertRulerUnchanged();
  const last = points[points.length - 1];

  //    The wire LEAVES along the flow: start - from points along from.dir.
  const startOffset = { x: points[0].x - request.from.x, y: points[0].y - request.from.y };
  await expect(Math.hypot(startOffset.x, startOffset.y)).toBeCloseTo(GAP_PX, 6);
  await expect(
    angleBetweenDeg(startOffset, DIR_VECTOR[request.from.dir]),
    `start offset ${JSON.stringify(startOffset)} does not point ${request.from.dir}`,
  ).toBeLessThan(1);

  //    It ARRIVES travelling to.dir, so the last point sits BEHIND the target:
  //    to - last points along to.dir, not away from it.
  const endOffset = { x: request.to.x - last.x, y: request.to.y - last.y };
  await expect(Math.hypot(endOffset.x, endOffset.y)).toBeCloseTo(GAP_PX, 6);
  await expect(
    angleBetweenDeg(endOffset, DIR_VECTOR[request.to.dir]),
    `end offset ${JSON.stringify(endOffset)} does not point ${request.to.dir}`,
  ).toBeLessThan(1);

  // 2. Both glyphs land on their own {x, y}, via the real CTM.
  const glyphs = cell.querySelectorAll('[data-slot="trace-terminal"]');
  await expect(glyphs).toHaveLength(2);
  const fromGlyph = requireEl<SVGGraphicsElement>(cell, '[data-end="from"]');
  const toGlyph = requireEl<SVGGraphicsElement>(cell, '[data-end="to"]');
  for (const [glyph, spec] of [
    [fromGlyph, request.from],
    [toGlyph, request.to],
  ] as const) {
    const rect = glyph.getBoundingClientRect();
    const want = toScreen(svg, spec.x, spec.y);
    await expect(Math.abs(rect.left + rect.width / 2 - want.x)).toBeLessThan(1);
    await expect(Math.abs(rect.top + rect.height / 2 - want.y)).toBeLessThan(1);
  }
  await expect(fromGlyph.getAttribute("data-dir")).toBe(request.from.dir);
  await expect(toGlyph.getAttribute("data-dir")).toBe(request.to.dir);

  // 2b. The frozen side derivation, asserted at the layer that renders it.
  //     `side(from) = from.dir` but `side(to) = OPPOSITE_DIR[to.dir]`, because
  //     the wire ARRIVES travelling `to.dir` and its free space is behind it.
  //     Written out as literals rather than by calling `traceSideOf`, so this
  //     is the contract checking the code and not the code checking itself —
  //     mutation testing found an earlier `sides` copy that could be broken
  //     with nothing observable changing.
  const route = requireEl(cell, '[data-slot="trace-route"]');
  await expect(route.getAttribute("data-side-start")).toBe(request.from.dir);
  await expect(route.getAttribute("data-side-end")).toBe(OPPOSITE_DIR[request.to.dir]);

  // 3. One arrowhead, at the `to` end, and the `from` end bare.
  const markers = cell.querySelectorAll('[data-slot="trace-marker"]');
  await expect(markers).toHaveLength(1);
  await expect(line.getAttribute("marker-end")).toBe(`url(#${markers[0].id})`);
  await expect(line.getAttribute("marker-start")).toBeNull();

  // 4. T1/T3 — a terminal's own internal arrow (NOT the marker above, which
  //    belongs to the wire) is drawn iff `traceReadsTangent` says this
  //    routing actually reads THIS end's dir, for THIS request — options
  //    (a dragged `curve`, a `slantT`) included. Never a per-routing-name
  //    table: `Degenerate` and `RoutingKinds`' `curved-bent` case both carry
  //    a routing whose table entry disagrees with its actual geometry (see
  //    `trace.routing.ts`'s `routingTangents` doc comment), and asserting
  //    against the table here would silently pass a terminal lying about
  //    exactly the case this file exists to catch.
  for (const [glyph, end] of [
    [fromGlyph, "from"],
    [toGlyph, "to"],
  ] as const) {
    const arrows = glyph.querySelectorAll('[data-slot="trace-terminal-arrow"]');
    const shouldShow = traceReadsTangent(request, end);
    await expect(
      arrows.length,
      `${cell.getAttribute("data-testid")}: ${end} terminal arrow should be ${shouldShow ? "present" : "absent"}`,
    ).toBe(shouldShow ? 1 : 0);
  }

  // 5. T4 — hiding an arrow never resizes or moves the ring: the `from` and
  //    `to` glyphs share one `terminalRadius`, so their rings must measure
  //    identically regardless of which one is currently blind. Measured off
  //    the DOM, not assumed from the shared prop, so a future per-end
  //    `radius` divergence in `TraceTerminal` itself would fail this rather
  //    than pass silently.
  const fromRing = requireEl<SVGGraphicsElement>(fromGlyph, '[data-slot="trace-terminal-ring"]');
  const toRing = requireEl<SVGGraphicsElement>(toGlyph, '[data-slot="trace-terminal-ring"]');
  const fromRingRect = fromRing.getBoundingClientRect();
  const toRingRect = toRing.getBoundingClientRect();
  await expect(Math.abs(fromRingRect.width - toRingRect.width)).toBeLessThan(1);
  await expect(Math.abs(fromRingRect.height - toRingRect.height)).toBeLessThan(1);
}

/**
 * The caption is part of the deliverable, so it is measured too.
 *
 * Zach reviews this by LOOKING at sixteen cells at once; a number printed
 * under a picture is a claim, and an untested claim under a picture is exactly
 * the failure this lane exists to avoid. So the angle a cell prints must agree
 * with the angle this play function measures for itself, and the badge must
 * agree with the verdict attribute.
 */
async function assertCellCaption(
  cell: Element,
  end: "from" | "to",
  dir: TraceDir,
  measuredDeg: number,
): Promise<void> {
  const readout = requireEl(cell, '[data-slot="polarity-measured"]');
  const printed = Number(readout.getAttribute("data-off-deg"));
  await expect(
    Math.abs(printed - measuredDeg),
    `${cell.getAttribute("data-testid")}: prints ${printed} deg, measured ${measuredDeg}`,
  ).toBeLessThan(0.1);
  await expect(readout.textContent).toContain(printed.toFixed(1));

  const supported = cell.getAttribute("data-supported") === "true";
  await expect(requireEl(cell, '[data-slot="polarity-verdict"]').textContent).toBe(
    supported ? "honors" : "blind",
  );
  await expect(requireEl(cell, '[data-slot="polarity-reason"]').textContent).toContain(
    supported ? `reads ${end}.dir` : `never reads ${end}.dir`,
  );
  await expect(requireEl(cell, '[data-slot="polarity-heading"]').textContent).toContain(
    `${end}.dir`,
  );
  await expect(requireEl(cell, '[data-slot="polarity-heading"]').textContent).toContain(dir);
}

/** Angle tolerance for "the painted line genuinely travels this way". */
const TANGENT_TOLERANCE_DEG = 5;

/**
 * The terminal gap, PINNED as a literal rather than read from
 * `TRACE_TERMINAL_GAP`.
 *
 * WHY, found by mutation testing (2026-09-17): the first version of
 * `assertCellFrame` measured the pull-back against the constant itself, so
 * setting `TRACE_TERMINAL_GAP = 0` moved the ruler along with the thing it
 * measures and all four stories stayed green while the wire ran straight
 * into the middle of both glyphs. Same trap, same fix, as
 * `TraceElbow.stories.tsx`'s pinned `PADDING_PX`: a deliberate change
 * upstream should cost a human one loud failure here, not cost the suite
 * its teeth everywhere.
 */
const GAP_PX = 16;

function assertRulerUnchanged(): void {
  if (TRACE_TERMINAL_GAP !== GAP_PX) {
    throw new Error(
      `TRACE_TERMINAL_GAP is now ${TRACE_TERMINAL_GAP}, not ${GAP_PX} — re-derive this file's tolerances by hand`,
    );
  }
}

/* ==========================================================================
 * Story 1 — the central ask.
 * ========================================================================== */

const TARGET_REQUESTS: TraceRouteRequest[] = ROUTINGS.flatMap((routing) =>
  TRACE_DIRS.map((dir) => ({ from: FROM_FIXED, to: { ...TO_POS, dir }, routing })),
);
const TARGET_VIEWBOX = sharedViewBox(TARGET_REQUESTS);
const targetKey = (routing: TraceRouting, dir: TraceDir) => `target-${routing}-${dir}`;

export const TargetPolarity: Story = {
  render: () => (
    <MatrixShell
      title="Target polarity — one source held fixed, the target's flow tangent permuted"
      lede={
        "The source never moves: bottom-left, flowing right. The target never moves either — only its " +
        "flow tangent does, through all four values, which is the whole vocabulary (an input on the top face " +
        "and an output on the bottom face are the same arrow, so eight port configurations are four glyphs). " +
        "Every cell shares one viewBox, so what you see compared is the geometry and not a re-scale. " +
        "Cells that cannot serve the tangent are drawn exactly as the function returns them and labelled " +
        "blind; nothing is hidden."
      }
    >
      <ColumnHeader label="routing × to.dir" />
      {ROUTINGS.map((routing) => (
        <MatrixRow key={routing} routing={routing}>
          {TRACE_DIRS.map((dir) => (
            <Cell
              key={dir}
              testid={targetKey(routing, dir)}
              request={{ from: FROM_FIXED, to: { ...TO_POS, dir }, routing }}
              end="to"
              viewBox={TARGET_VIEWBOX}
            />
          ))}
        </MatrixRow>
      ))}
    </MatrixShell>
  ),
  play: async ({ canvasElement }) => {
    await expect(AXIS_OFFSET_IS_DELIBERATE).toBe(true);

    const cells = canvasElement.querySelectorAll('[data-slot="polarity-cell"]');
    await expect(cells).toHaveLength(ROUTINGS.length * TRACE_DIRS.length);

    /** Rebuilt from MEASUREMENT for every cell, then compared to the matrix. */
    const measured: Record<string, { reads: boolean; arrivesDeg: number; departsDeg: number }> = {};

    for (const routing of ROUTINGS) {
      for (const dir of TRACE_DIRS) {
        const key = targetKey(routing, dir);
        const request: TraceRouteRequest = { from: FROM_FIXED, to: { ...TO_POS, dir }, routing };
        const cell = requireEl(canvasElement, `[data-testid="${key}"]`);
        const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');
        const points = samplePath(line);

        await assertCellFrame(cell, request, points);

        const arrivesDeg = angleBetweenDeg(pathTangent(line, "to"), DIR_VECTOR[dir]);
        const departsDeg = angleBetweenDeg(pathTangent(line, "from"), DIR_VECTOR[FROM_FIXED.dir]);
        const reads = traceReadsTangent(request, "to");
        measured[key] = { reads, arrivesDeg, departsDeg };

        // The rendered verdict and the model agree. Secondary: this can only
        // catch a render fault, which is why the two checks below exist.
        await expect(cell.getAttribute("data-supported")).toBe(String(reads));
        await assertCellCaption(cell, "to", dir, arrivesDeg);

        if (reads) {
          // A cell that CLAIMS the tangent must actually travel that way.
          await expect(
            arrivesDeg,
            `${key}: claims to honor ${dir} but the painted line arrives ${arrivesDeg.toFixed(1)} deg off it`,
          ).toBeLessThan(TANGENT_TOLERANCE_DEG);
        } else {
          // A blind cell must fail at LEAST one of the two halves. It may well
          // arrive correctly by coincidence (that is the whole "chord happens
          // to align" trap) — what it may not do is both read and arrive.
          await expect(
            reads && arrivesDeg < TANGENT_TOLERANCE_DEG,
            `${key}: labelled blind, yet it both reads ${dir} and arrives along it`,
          ).toBe(false);
        }
      }
    }

    /* ---- The assertion that pins the matrix -------------------------- */
    // Rebuilt from scratch out of the measurements above: a routing counts as
    // honoring the target tangent only if ALL FOUR of its cells both read the
    // dir and paint an arrival along it. Flipping a single `data-supported`
    // attribute cannot satisfy this; only the geometry can.
    const honoring = ROUTINGS.filter((routing) =>
      TRACE_DIRS.every((dir) => {
        const m = measured[targetKey(routing, dir)];
        return m.reads && m.arrivesDeg < TANGENT_TOLERANCE_DEG;
      }),
    );
    await expect(honoring).toEqual(["curved", "elbow"]);

    /* ---- And the blind rows are blind for the RIGHT reason ----------- */
    for (const dir of TRACE_DIRS) {
      // `straight` paints a plain chord: its arrival direction is the chord
      // direction, to within a degree. Nothing turned toward `to.dir`.
      const straightCell = requireEl(canvasElement, `[data-testid="${targetKey("straight", dir)}"]`);
      const straightLine = requireEl<SVGPathElement>(straightCell, '[data-slot="trace-line"]');
      const straightPoints = samplePath(straightLine);
      const chord = {
        x: straightPoints[straightPoints.length - 1].x - straightPoints[0].x,
        y: straightPoints[straightPoints.length - 1].y - straightPoints[0].y,
      };
      await expect(angleBetweenDeg(pathTangent(straightLine, "to"), chord)).toBeLessThan(1);

      // `slanted` honors the SOURCE and only the source: it leaves along
      // from.dir to within a degree, and arrives along the diagonal instead
      // of `to.dir`.
      const slantedCell = requireEl(canvasElement, `[data-testid="${targetKey("slanted", dir)}"]`);
      const slantedLine = requireEl<SVGPathElement>(slantedCell, '[data-slot="trace-line"]');
      await expect(
        angleBetweenDeg(pathTangent(slantedLine, "from"), DIR_VECTOR[FROM_FIXED.dir]),
      ).toBeLessThan(1);
      await expect(
        measured[targetKey("slanted", dir)].arrivesDeg,
        `slanted/${dir}: arrived along to.dir, which slanted has no way to do`,
      ).toBeGreaterThan(TANGENT_TOLERANCE_DEG);
    }

    /* ---- T1/T2, pinned explicitly for the two rows Zach called out ---- */
    // `assertCellFrame` already proves this generically for every cell in
    // the matrix (it derives from `traceReadsTangent`, never a routing-name
    // list). This block restates it as a literal per-row expectation, so a
    // regression here reads as "straight/slanted broke" rather than a
    // generic frame failure buried in a loop.
    for (const dir of TRACE_DIRS) {
      // straight: blind at BOTH ends — neither terminal may claim a tangent.
      const straightCell = requireEl(canvasElement, `[data-testid="${targetKey("straight", dir)}"]`);
      await expect(
        requireEl(straightCell, '[data-end="from"]').querySelectorAll(
          '[data-slot="trace-terminal-arrow"]',
        ),
      ).toHaveLength(0);
      await expect(
        requireEl(straightCell, '[data-end="to"]').querySelectorAll(
          '[data-slot="trace-terminal-arrow"]',
        ),
      ).toHaveLength(0);

      // slanted: the asymmetry. `from.dir` never permutes in THIS gallery
      // (FROM_FIXED is constant) but the source arrow still has to be THERE
      // — honored — while the target arrow, on the very same cell, must not.
      const slantedCell = requireEl(canvasElement, `[data-testid="${targetKey("slanted", dir)}"]`);
      await expect(
        requireEl(slantedCell, '[data-end="from"]').querySelectorAll(
          '[data-slot="trace-terminal-arrow"]',
        ),
        `slanted/${dir}: source arrow should be present`,
      ).toHaveLength(1);
      await expect(
        requireEl(slantedCell, '[data-end="to"]').querySelectorAll(
          '[data-slot="trace-terminal-arrow"]',
        ),
        `slanted/${dir}: target arrow should be absent`,
      ).toHaveLength(0);
    }

    /* ---- The four cells of a supported row are genuinely different --- */
    // Otherwise "reads the dir" could be satisfied by a routing that reads it
    // and then ignores it.
    for (const routing of ["curved", "elbow"] as const) {
      const shapes = TRACE_DIRS.map((dir) =>
        requireEl<SVGPathElement>(
          requireEl(canvasElement, `[data-testid="${targetKey(routing, dir)}"]`),
          '[data-slot="trace-line"]',
        ).getAttribute("d"),
      );
      await expect(new Set(shapes).size).toBe(4);
    }
  },
};

/* ==========================================================================
 * Story 2 — the mirror. Same question asked of the other end.
 * ========================================================================== */

const SOURCE_REQUESTS: TraceRouteRequest[] = ROUTINGS.flatMap((routing) =>
  TRACE_DIRS.map((dir) => ({ from: { ...FROM_POS, dir }, to: TO_FIXED, routing })),
);
const SOURCE_VIEWBOX = sharedViewBox(SOURCE_REQUESTS);
const sourceKey = (routing: TraceRouting, dir: TraceDir) => `source-${routing}-${dir}`;

/**
 * The asymmetry is the point. `slanted` is blind at the target and honors the
 * source — so the row that was four near-identical pictures in
 * `TargetPolarity` is four genuinely different departures here. A single
 * matrix would have shown slanted as simply "unsupported" and quietly lost
 * the half of it that works.
 */
export const SourcePolarity: Story = {
  render: () => (
    <MatrixShell
      title="Source polarity — the mirror: target fixed, the source's flow tangent permuted"
      lede={
        "Same four routings, same question, asked at the other end. This is where slanted stops being a " +
        "worse straight line: it reads the SOURCE tangent and leaves along it every time, which is exactly " +
        "the half of the matrix that the target gallery reports as blind. straight remains blind at both " +
        "ends — it is a chord, and a chord has nothing to read."
      }
    >
      <ColumnHeader label="routing × from.dir" />
      {ROUTINGS.map((routing) => (
        <MatrixRow key={routing} routing={routing}>
          {TRACE_DIRS.map((dir) => (
            <Cell
              key={dir}
              testid={sourceKey(routing, dir)}
              request={{ from: { ...FROM_POS, dir }, to: TO_FIXED, routing }}
              end="from"
              viewBox={SOURCE_VIEWBOX}
            />
          ))}
        </MatrixRow>
      ))}
    </MatrixShell>
  ),
  play: async ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll('[data-slot="polarity-cell"]');
    await expect(cells).toHaveLength(ROUTINGS.length * TRACE_DIRS.length);

    const measured: Record<string, { reads: boolean; departsDeg: number }> = {};

    for (const routing of ROUTINGS) {
      for (const dir of TRACE_DIRS) {
        const key = sourceKey(routing, dir);
        const request: TraceRouteRequest = { from: { ...FROM_POS, dir }, to: TO_FIXED, routing };
        const cell = requireEl(canvasElement, `[data-testid="${key}"]`);
        const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');
        const points = samplePath(line);

        await assertCellFrame(cell, request, points);

        const departsDeg = angleBetweenDeg(pathTangent(line, "from"), DIR_VECTOR[dir]);
        const reads = traceReadsTangent(request, "from");
        measured[key] = { reads, departsDeg };

        await expect(cell.getAttribute("data-supported")).toBe(String(reads));
        await assertCellCaption(cell, "from", dir, departsDeg);
        if (reads) {
          await expect(
            departsDeg,
            `${key}: claims to honor ${dir} but the painted line leaves ${departsDeg.toFixed(1)} deg off it`,
          ).toBeLessThan(TANGENT_TOLERANCE_DEG);
        } else {
          await expect(reads && departsDeg < TANGENT_TOLERANCE_DEG).toBe(false);
        }
      }
    }

    // Three of four routings honor the SOURCE — slanted joins curved and
    // elbow here, and that is the fact this second gallery exists to show.
    const honoring = ROUTINGS.filter((routing) =>
      TRACE_DIRS.every((dir) => {
        const m = measured[sourceKey(routing, dir)];
        return m.reads && m.departsDeg < TANGENT_TOLERANCE_DEG;
      }),
    );
    await expect(honoring).toEqual(["slanted", "curved", "elbow"]);

    // And straight is still a chord at this end too.
    for (const dir of TRACE_DIRS) {
      const line = requireEl<SVGPathElement>(
        requireEl(canvasElement, `[data-testid="${sourceKey("straight", dir)}"]`),
        '[data-slot="trace-line"]',
      );
      const points = samplePath(line);
      const chord = {
        x: points[points.length - 1].x - points[0].x,
        y: points[points.length - 1].y - points[0].y,
      };
      await expect(angleBetweenDeg(pathTangent(line, "from"), chord)).toBeLessThan(1);
    }

    // slanted's four departures are four genuinely different first legs.
    const slantedShapes = TRACE_DIRS.map((dir) =>
      requireEl<SVGPathElement>(
        requireEl(canvasElement, `[data-testid="${sourceKey("slanted", dir)}"]`),
        '[data-slot="trace-line"]',
      ).getAttribute("d"),
    );
    await expect(new Set(slantedShapes).size).toBe(4);
  },
};

/* ==========================================================================
 * Story 3 — the degenerate chord, and why the verdict is measured.
 * ========================================================================== */

const DEGENERATE_FROM: TraceTerminalSpec = { x: 34, y: 104, dir: "right" };
const DEGENERATE_TO: TraceTerminalSpec = { x: 262, y: 104, dir: "right" };
const DEGENERATE_REQUESTS: TraceRouteRequest[] = ROUTINGS.map((routing) => ({
  from: DEGENERATE_FROM,
  to: DEGENERATE_TO,
  routing,
}));
const DEGENERATE_VIEWBOX = sharedViewBox(DEGENERATE_REQUESTS);

/**
 * The trap the matrices are laid out to avoid, rendered on purpose.
 *
 * Two facts collide here, and both are real:
 *
 *  - Every routing ARRIVES perfectly along `to.dir`, 0.0 degrees off. On this
 *    layout a plain chord travels right, so it looks like every routing
 *    honours the tangent. That is docs/TRACE-PLAN.md's "chord happens to
 *    align", and it is why a cell's verdict is never taken from what it looks
 *    like.
 *  - `slanted` here is BLIND AT THE SOURCE, which its own exported table
 *    denies. `getSlantedArrowPoints` returns `[start, end]` — departure
 *    ignored — the moment `|dx|` or `|dy|` drops under 0.001, and this chord
 *    has `dy = 0`. So `honorsTangent("slanted", "from")` says honored while
 *    the geometry is invariant under all four source dirs. Measured, not
 *    theorised: the assertion below pins the disagreement, so whoever makes
 *    `routingTangents` geometry-aware upstream gets a red test telling them
 *    this story can be simplified — rather than this file quietly agreeing
 *    with a table that is wrong.
 */
export const Degenerate: Story = {
  render: () => (
    <MatrixShell
      title="The degenerate chord — where looking right proves nothing"
      lede={
        "Both terminals on one axis, both flowing right. Every routing arrives dead-on: the chord already " +
        "travels the way the target wants, so a routing that never read a tangent is indistinguishable, by " +
        "eye, from one that did. slanted goes further and collapses into straight outright — its own " +
        "documented degeneracy at |dx| or |dy| < 0.001 — so here it is blind at BOTH ends, which its " +
        "static fidelity table does not say. This is why every verdict in this file is measured by " +
        "permuting the dir and watching the geometry, not by reading an arrival angle."
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {ROUTINGS.map((routing) => (
          <Cell
            key={routing}
            testid={`degenerate-${routing}`}
            request={{ from: DEGENERATE_FROM, to: DEGENERATE_TO, routing }}
            end="from"
            viewBox={DEGENERATE_VIEWBOX}
            note={
              routing === "slanted"
                ? "collapsed to a chord: |dy| < 0.001, so the departure was never read"
                : `${routing} · arrives along to.dir here no matter what it read`
            }
          />
        ))}
      </div>
    </MatrixShell>
  ),
  play: async ({ canvasElement }) => {
    const pathOf = (routing: TraceRouting) =>
      requireEl<SVGPathElement>(
        requireEl(canvasElement, `[data-testid="degenerate-${routing}"]`),
        '[data-slot="trace-line"]',
      );

    /* ---- 1. Every routing arrives dead-on. Looking right proves nothing. */
    for (const routing of ROUTINGS) {
      await expect(
        angleBetweenDeg(pathTangent(pathOf(routing), "to"), DIR_VECTOR[DEGENERATE_TO.dir]),
        `${routing}: expected a 0-degree arrival on an aligned chord`,
      ).toBeLessThan(TANGENT_TOLERANCE_DEG);
    }

    /* ---- 2. ...yet only two of them read anything. -------------------- */
    const readsFrom = ROUTINGS.filter((routing) =>
      traceReadsTangent({ from: DEGENERATE_FROM, to: DEGENERATE_TO, routing }, "from"),
    );
    await expect(readsFrom).toEqual(["curved", "elbow"]);

    /* ---- 3. slanted really did collapse into straight ----------------- */
    // Measured off the DOM: the two painted `d` strings are identical.
    await expect(pathOf("slanted").getAttribute("d")).toBe(pathOf("straight").getAttribute("d"));
    await expect(pathOf("slanted").getTotalLength()).toBeCloseTo(
      pathOf("straight").getTotalLength(),
      6,
    );

    /* ---- 4. The exported table disagrees, and that is the finding ----- */
    // `honorsTangent` is geometry-independent, so it still reports the
    // default-case answer. The measured answer here is the opposite. Asserted
    // so an upstream fix turns this red instead of silently making the story
    // redundant.
    await expect(honorsTangent("slanted", "from")).toBe(true);
    await expect(
      traceReadsTangent({ from: DEGENERATE_FROM, to: DEGENERATE_TO, routing: "slanted" }, "from"),
    ).toBe(false);

    // And on a NON-degenerate chord the two agree — so the disagreement above
    // is the degeneracy, not a broken measurement.
    await expect(
      traceReadsTangent({ from: FROM_FIXED, to: { ...TO_POS, dir: "right" }, routing: "slanted" }, "from"),
    ).toBe(true);

    /* ---- 5. Every cell still carries its verdict and its frame -------- */
    for (const routing of ROUTINGS) {
      const cell = requireEl(canvasElement, `[data-testid="degenerate-${routing}"]`);
      const expected = readsFrom.includes(routing);
      await expect(cell.getAttribute("data-supported")).toBe(String(expected));
      await assertCellCaption(
        cell,
        "from",
        DEGENERATE_FROM.dir,
        angleBetweenDeg(pathTangent(pathOf(routing), "from"), DIR_VECTOR[DEGENERATE_FROM.dir]),
      );
      await assertCellFrame(
        cell,
        { from: DEGENERATE_FROM, to: DEGENERATE_TO, routing },
        samplePath(pathOf(routing)),
      );
    }
  },
};

/* ==========================================================================
 * Story 4 — the wrapper's own contract.
 * ========================================================================== */

const WRAP_FROM: TraceTerminalSpec = { x: 34, y: 140, dir: "right" };
const WRAP_TO: TraceTerminalSpec = { x: 268, y: 58, dir: "right" };

interface WrapCase {
  key: string;
  title: string;
  caption: string;
  request: TraceRouteRequest;
}

const BEND = { dx: 10, dy: -64 };

const WRAP_CASES: WrapCase[] = [
  {
    key: "straight",
    title: "straight",
    caption: "two points, no control point",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "straight" },
  },
  {
    key: "straight-bent",
    title: "straight + control point",
    // Was "becomes THE curve — same bentCurvedPath call" (the donor
    // behaviour). Inverted 2026-09-17 per
    // docs/TRACE-CONTROL-POINTS-PLAN.md: a straight trace with a control
    // point draws a polyline through it now, never a quadratic. See the
    // module-level WHY comment on `RoutingKinds`'s play function below —
    // its own `pathOf("straight-bent") === pathOf("curved-bent")` assertion
    // still encodes the OLD behaviour and was left untouched (not
    // pre-authorized to change); it is expected to fail until Zach decides
    // whether to invert it too.
    caption: "a polyline through the waypoint, not a curve",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "straight", curve: BEND },
  },
  {
    key: "slanted-15",
    title: "slanted · slantT 0.15",
    caption: "short lead along from.dir, then one diagonal",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "slanted", slantT: 0.15 },
  },
  {
    key: "slanted-85",
    title: "slanted · slantT 0.85",
    caption: "the bend slides along the departure axis",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "slanted", slantT: 0.85 },
  },
  {
    key: "curved",
    title: "curved",
    caption: "the kit's default cubic — length measured off the DOM",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "curved" },
  },
  {
    key: "curved-bent",
    title: "curved + control point",
    caption: "quadratic through the waypoint at t = 0.5",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "curved", curve: BEND },
  },
  {
    key: "elbow",
    title: "elbow",
    caption: "A*, no obstacles — out, across, in",
    request: { from: WRAP_FROM, to: WRAP_TO, routing: "elbow" },
  },
  {
    key: "elbow-obstacle",
    title: "elbow + keep-out",
    caption: "the bend count is forced, not chosen",
    request: {
      from: WRAP_FROM,
      to: WRAP_TO,
      routing: "elbow",
      obstacles: [{ x: 132, y: 52, w: 60, h: 110 }],
    },
  },
];

const WRAP_VIEWBOX = sharedViewBox(WRAP_CASES.map((c) => c.request));

function WrapCard({ item }: { item: WrapCase }) {
  const [geometry, setGeometry] = useState<TraceGeometry | null>(null);
  const [, , vw, vh] = WRAP_VIEWBOX.split(" ").map(Number);
  const obstacles = item.request.obstacles ?? [];
  return (
    <figure
      data-testid={`wrap-card-${item.key}`}
      data-slot="wrap-card"
      style={{
        margin: 0,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <svg
        data-slot="wrap-canvas"
        viewBox={WRAP_VIEWBOX}
        width="100%"
        style={{ display: "block", aspectRatio: `${vw} / ${vh}` }}
      >
        {obstacles.map((rect, index) => (
          <rect
            data-slot="wrap-obstacle"
            key={index}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill="var(--muted)"
            stroke="var(--border)"
            rx={4}
          />
        ))}
        <Trace id={`wrap-${item.key}`} {...item.request} onGeometry={setGeometry} />
      </svg>
      <figcaption style={{ borderTop: "1px solid var(--border)", padding: "7px 10px 9px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "ui-monospace, monospace",
            color: "var(--foreground)",
          }}
        >
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.35 }}>
          {item.caption}
        </div>
        <div
          data-slot="wrap-readout"
          data-length={geometry ? geometry.length.toFixed(2) : ""}
          data-points={geometry?.points ? String(geometry.points.length) : ""}
          style={{
            marginTop: 3,
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color: "var(--muted-foreground)",
          }}
        >
          {geometry
            ? `${geometry.length.toFixed(1)}px · ${geometry.points?.length ?? 0} pts · sides ${geometry.sides.start}/${geometry.sides.end}`
            : "measuring…"}
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * `Trace` itself: two terminal specs plus a routing kind in, the whole drawn
 * thing out. The readout under each card is the geometry the component
 * reported back through `onGeometry` — for the two curves that is the arc
 * length the BROWSER measured off the mounted path and a sampled polyline,
 * because a cubic has no vertices and the component refuses to invent some.
 */
export const RoutingKinds: Story = {
  render: () => (
    <MatrixShell
      title="The Trace wrapper — every routing, with its control point moved"
      lede={
        "One pair of terminals, eight calls. The wrapper pulls both endpoints back by the terminal gap so " +
        "the glyph never swallows the arrowhead, asks P2's routeTrace or P3's routeElbow for the geometry, " +
        "and reports what it got. A curve's length is the browser's getTotalLength() on the real path — " +
        "never the chord, which is the mistake the proposal report warned about."
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {WRAP_CASES.map((item) => (
          <WrapCard key={item.key} item={item} />
        ))}
      </div>
    </MatrixShell>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="wrap-card"]')).toHaveLength(
      WRAP_CASES.length,
    );

    const pathOf = (key: string) =>
      requireEl<SVGPathElement>(
        requireEl(canvasElement, `[data-testid="wrap-card-${key}"]`),
        '[data-slot="trace-line"]',
      );

    for (const item of WRAP_CASES) {
      const cell = requireEl(canvasElement, `[data-testid="wrap-card-${item.key}"]`);
      await assertCellFrame(cell, item.request, samplePath(pathOf(item.key)));
      await expect(
        requireEl(cell, '[data-slot="trace-route"]').getAttribute("data-routing"),
      ).toBe(item.request.routing);
    }

    /* ---- A bent straight is NOT the curve, measured on the two `d`s --- */
    // This assertion used to claim the opposite, and was right about the
    // DONOR: SystemSketch's `straight` with a dragged control point calls
    // the same `bentCurvedPath` as `curved`, so the two `d`s came out
    // byte-identical. Zach looked at that on screen and overruled it
    // (2026-09-17, docs/TRACE-CONTROL-POINTS-PLAN.md) — a straight trace
    // with a control point is a POLYLINE. So the two now differ, and the
    // difference is the feature.
    //
    // WHY this is asserted in two files rather than deduped: this is the
    // SECOND copy of the claim (the first is TraceRouting.stories.tsx's
    // `RoutingKinds`), and both exist because a silent re-convergence — a
    // future re-sync restoring the donor's shared `bentCurvedPath` call —
    // is exactly the regression that would be invisible in a screenshot.
    await expect(pathOf("straight-bent").getAttribute("d")).not.toBe(
      pathOf("curved-bent").getAttribute("d"),
    );
    // The straight one is a polyline: only move-to and line-to commands.
    // Asserted positively, because "differs from the curve" alone would
    // also pass for a straight that had become some THIRD kind of curve.
    await expect(pathOf("straight-bent").getAttribute("d")).toMatch(/^M[\d\s.,-]+(L[\d\s.,-]+)+$/);
    // ...and the curved one still bends into a quadratic, so the check
    // above is measuring the straight branch and not a dead `curve` prop.
    await expect(pathOf("curved-bent").getAttribute("d")).toContain("Q");
    // An UNBENT straight is not a curve either — the control that keeps
    // all of the above from passing on a degenerate pair of empty strings.
    await expect(pathOf("straight").getAttribute("d")).not.toBe(
      pathOf("curved").getAttribute("d"),
    );

    /* ---- T3, pinned explicitly: a bent curve loses BOTH tangents ------ */
    // `assertCellFrame` above already checked every WRAP_CASE generically
    // (arrow presence derived from `traceReadsTangent`, never a routing-name
    // table), so this is redundant with that loop — deliberately: it is the
    // exact trap the handoff calls out by name ("any polarity cell that
    // carries a control point will claim a tangent fidelity it does not
    // have"), so it gets its own unmissable assertion rather than riding
    // along inside a generic per-case loop.
    const arrowCountsOf = (key: string) => {
      const cell = requireEl(canvasElement, `[data-testid="wrap-card-${key}"]`);
      const count = (end: "from" | "to") =>
        requireEl(cell, `[data-end="${end}"]`).querySelectorAll(
          '[data-slot="trace-terminal-arrow"]',
        ).length;
      return { from: count("from"), to: count("to") };
    };
    // `curved` bare honors both ends — the kit default.
    await expect(arrowCountsOf("curved")).toEqual({ from: 1, to: 1 });
    // The SAME routing, with a dragged control point, honors NEITHER —
    // `bentCurvedPath` never receives `sides` at all (`trace.routing.ts`'s
    // own `routingTangents` doc comment).
    await expect(arrowCountsOf("curved-bent")).toEqual({ from: 0, to: 0 });
    // `elbow` (with or without a keep-out) still honors both — that is what
    // it is for, and it is the control proving the drop above is about the
    // control point, not about "any routing with a bend in it".
    await expect(arrowCountsOf("elbow")).toEqual({ from: 1, to: 1 });
    await expect(arrowCountsOf("elbow-obstacle")).toEqual({ from: 1, to: 1 });

    /* ---- slantT really does slide the bend --------------------------- */
    const leadOf = (key: string) => {
      const points = samplePath(pathOf(key), 2000);
      // Walk forward while the step is still horizontal; the lead ends at the
      // first sample whose direction leaves the departure axis.
      let i = 1;
      while (i < points.length && Math.abs(points[i].y - points[0].y) < 0.5) i += 1;
      return points[i - 1].x - points[0].x;
    };
    const span = Math.abs(
      traceRouteEnd(WRAP_TO, GAP_PX).x - traceRouteStart(WRAP_FROM, GAP_PX).x,
    );
    await expect(Math.abs(leadOf("slanted-15") - span * 0.15)).toBeLessThan(2);
    await expect(Math.abs(leadOf("slanted-85") - span * 0.85)).toBeLessThan(2);

    /* ---- A curve's length is the ARC, measured, not the chord -------- */
    for (const key of ["curved", "curved-bent"]) {
      const line = pathOf(key);
      const readout = requireEl(
        requireEl(canvasElement, `[data-testid="wrap-card-${key}"]`),
        '[data-slot="wrap-readout"]',
      );
      const reported = Number(readout.getAttribute("data-length"));
      const measured = line.getTotalLength();
      // What the component reported IS what the browser measured.
      await expect(Math.abs(reported - measured)).toBeLessThan(0.01);

      // And it is genuinely longer than the straight-line distance, which is
      // the whole reason the chord is the wrong number to use.
      const start = traceRouteStart(WRAP_FROM, GAP_PX);
      const end = traceRouteEnd(WRAP_TO, GAP_PX);
      const chord = Math.hypot(end.x - start.x, end.y - start.y);
      await expect(measured).toBeGreaterThan(chord + 1);

      // The sampled polyline it hands back has the documented resolution and
      // genuinely lands on the painted path at both ends.
      await expect(readout.getAttribute("data-points")).toBe(String(TRACE_CURVE_SAMPLES + 1));
    }

    /* ---- A polyline routing reports its exact vertices --------------- */
    for (const key of ["straight", "slanted-15", "elbow"]) {
      const item = WRAP_CASES.find((c) => c.key === key)!;
      const readout = requireEl(
        requireEl(canvasElement, `[data-testid="wrap-card-${key}"]`),
        '[data-slot="wrap-readout"]',
      );
      const geometry = traceGeometry(item.request);
      await expect(readout.getAttribute("data-points")).toBe(String(geometry.points?.length));
      await expect(Number(readout.getAttribute("data-length"))).toBeCloseTo(
        polylineLength(geometry.points ?? []),
        2,
      );
    }

    /* ---- The keep-out actually moved the elbow ----------------------- */
    await expect(pathOf("elbow-obstacle").getAttribute("d")).not.toBe(
      pathOf("elbow").getAttribute("d"),
    );
    const obstacle = WRAP_CASES.find((c) => c.key === "elbow-obstacle")!.request.obstacles![0];
    const detour = samplePath(pathOf("elbow-obstacle"));
    let closest = Number.POSITIVE_INFINITY;
    for (const p of detour) {
      const dx = Math.max(obstacle.x - p.x, 0, p.x - (obstacle.x + obstacle.w));
      const dy = Math.max(obstacle.y - p.y, 0, p.y - (obstacle.y + obstacle.h));
      closest = Math.min(closest, Math.hypot(dx, dy));
    }
    // 24px of planned padding, minus the ~2.83px a rounded corner cuts toward
    // the inside of its turn at r = 8. Pinned as a literal, not read back out
    // of DEFAULT_ELBOW_OPTIONS — a mutation that zeroed the padding would
    // otherwise move the ruler along with the thing being measured.
    await expect(closest).toBeGreaterThan(20);
  },
};
