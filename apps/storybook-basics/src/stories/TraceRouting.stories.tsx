// src/stories/TraceRouting.stories.tsx — P2 / Lane B of docs/TRACE-PLAN.md.
//
// Four galleries over `../components/trace.routing`: the three direct
// routings, the centre control point relocated in each, and the two honest
// tangent matrices. Every spatial claim below is MEASURED off the rendered
// `SVGPathElement` (`getPointAtLength`, `getBoundingClientRect`), never
// inferred from an element being in the DOM.
//
// WHY the unsupported cells are rendered at all (docs/TRACE-PLAN.md D7):
// `straight` never reads a tangent and `slanted` reads only the source's,
// so most of the matrix genuinely cannot be served. Those cells draw
// exactly what the function returns, carry `data-supported="false"` and a
// muted caption, and are asserted to be wrong BY MEASUREMENT. Omitting
// them would hide the reason the elbow router (P3) exists.

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { expect } from "storybook/test";

import { TraceBody } from "../components/trace";
import {
  DIR_VECTOR,
  OPPOSITE_DIR,
  TRACE_DIRS,
  type Point,
  type TraceDir,
  type TraceTerminalSpec,
} from "../components/trace.layout";
import {
  DIRECT_ROUTINGS,
  honorsTangent,
  routeTrace,
  slantedAutomaticLead,
  type DirectRouting,
  type TraceCurve,
  type TraceRouteOptions,
} from "../components/trace.routing";
import { TraceTerminal } from "../components/traceTerminal";

/* ------------------------------------------------------------------ */
/* The fixture                                                          */
/* ------------------------------------------------------------------ */

const CELL_W = 250;
const CELL_H = 180;

/** Terminal centres. Offset on BOTH axes on purpose: a horizontal chord
 * would send `slanted` down its documented degenerate branch (|dy| <
 * 0.001 -> a plain line), which the `Routings` story shows deliberately in
 * its own cell rather than by accident in every other one. */
// x is 72, not the tidier 60, for one measured reason: with `from.dir:
// "left"` in `SourceTangents`, slanted's automatic lead runs 41px BACKWARDS
// before it turns, and at x=62 that put the corner 4px from the cell's own
// edge. The fixture has to leave room for the route that goes the wrong way
// first, or the most interesting cell in the gallery is the cramped one.
const FROM_C: Point = { x: 72, y: 116 };
const TO_C: Point = { x: 196, y: 50 };

/**
 * How far off the terminal centre the route actually starts and ends.
 *
 * WHY this lives in the STORY and not in `trace.routing.ts`: it is a HOST
 * decision — the visible line is 2px and the chevron marker reaches back
 * about 7px from the path's end, so without a gap both would be buried
 * under the terminal's opaque disc. React Flow's handles do the same
 * thing. The router is given the gapped points and knows nothing about
 * the glyph.
 *
 * It also reads `dir`, which is why every tangent-invariance check below
 * holds raw coordinates fixed and never goes through this function: the
 * claim under test is about the ROUTER, not about the fixture.
 */
const GAP = 13;

function endpointOf(terminal: TraceTerminalSpec, end: "from" | "to"): TraceTerminalSpec {
  const v = DIR_VECTOR[terminal.dir];
  const sign = end === "from" ? 1 : -1;
  return {
    x: terminal.x + v.x * GAP * sign,
    y: terminal.y + v.y * GAP * sign,
    dir: terminal.dir,
  };
}

const DEFAULT_FROM: TraceTerminalSpec = { ...FROM_C, dir: "right" };
const DEFAULT_TO: TraceTerminalSpec = { ...TO_C, dir: "right" };

/** The gapped endpoints of the default fixture — what the router sees. */
const A = endpointOf(DEFAULT_FROM, "from");
const B = endpointOf(DEFAULT_TO, "to");
/** `slanted`'s departure axis is x here (`from.dir` is "right"), so its
 * span — the thing `slantT` scales — is the x delta. */
const SLANT_SPAN = Math.abs(B.x - A.x);

const BLIND_CAPTION = "does not honor this tangent";

/* ------------------------------------------------------------------ */
/* One cell                                                             */
/* ------------------------------------------------------------------ */

interface RouteCellSpec {
  key: string;
  routing: DirectRouting;
  from?: TraceTerminalSpec;
  to?: TraceTerminalSpec;
  options?: TraceRouteOptions;
  label: string;
  caption?: string;
  /** Set ONLY on a cell that makes a tangent claim, so an absent attribute
   * never reads as a quiet "false". */
  supported?: boolean;
  showWaypoint?: boolean;
}

function RouteCell({ spec }: { spec: RouteCellSpec }) {
  const from = spec.from ?? DEFAULT_FROM;
  const to = spec.to ?? DEFAULT_TO;
  const start = endpointOf(from, "from");
  const end = endpointOf(to, "to");
  const route = routeTrace(spec.routing, start, end, spec.options);
  const chordMid: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  return (
    <div
      data-testid={`cell-${spec.key}`}
      data-routing={spec.routing}
      data-supported={spec.supported === undefined ? undefined : String(spec.supported)}
      style={{ width: CELL_W, display: "flex", flexDirection: "column", gap: 5 }}
    >
      <svg
        data-slot="trace-canvas"
        width={CELL_W}
        height={CELL_H}
        viewBox={`0 0 ${CELL_W} ${CELL_H}`}
        style={{
          background: "var(--muted)",
          borderRadius: 8,
          overflow: "visible",
          opacity: spec.supported === false ? 0.85 : 1,
        }}
      >
        <TraceBody
          id={`trace-${spec.key}`}
          path={route.path}
          points={route.points ?? undefined}
        />
        {spec.showWaypoint ? (
          <g data-slot="trace-waypoint-guide">
            {/* The (dx, dy) the control point was moved by, drawn. */}
            <line
              data-slot="trace-waypoint-leader"
              x1={chordMid.x}
              y1={chordMid.y}
              x2={route.waypoint.x}
              y2={route.waypoint.y}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.55}
            />
            <rect
              data-slot="trace-waypoint"
              x={route.waypoint.x - 4.5}
              y={route.waypoint.y - 4.5}
              width={9}
              height={9}
              fill="var(--card)"
              stroke="var(--bbox-primary, var(--primary))"
              strokeWidth={2}
              transform={`rotate(45 ${route.waypoint.x} ${route.waypoint.y})`}
            />
          </g>
        ) : null}
        <TraceTerminal {...from} />
        <TraceTerminal {...to} />
      </svg>
      <div data-slot="cell-label" style={{ fontSize: 12.5, fontWeight: 500 }}>
        {spec.label}
      </div>
      {spec.caption ? (
        <div
          data-slot="cell-caption"
          style={{ fontSize: 11, lineHeight: 1.35, color: "var(--muted-foreground)" }}
        >
          {spec.caption}
        </div>
      ) : null}
    </div>
  );
}

function Row({ specs, gap = 14 }: { specs: RouteCellSpec[]; gap?: number }) {
  return (
    <div style={{ display: "flex", gap, alignItems: "flex-start", flexWrap: "wrap" }}>
      {specs.map((spec) => (
        <RouteCell key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

function RowLabel({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ width: 96, flexShrink: 0, paddingTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {note ? (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.3 }}>{note}</div>
      ) : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p
      data-slot="story-note"
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--muted-foreground)",
        maxWidth: 780,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

const PAGE: CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                  */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

function cellOf(root: ParentNode, key: string): HTMLElement {
  return requireEl<HTMLElement>(root, `[data-testid="cell-${key}"]`);
}

function lineOf(root: ParentNode, key: string): SVGPathElement {
  return requireEl<SVGPathElement>(cellOf(root, key), '[data-slot="trace-line"]');
}

/** A point on the RENDERED path, in the svg's own user units — the same
 * units `routeTrace` returned, so a computed point and a drawn point are
 * directly comparable without a matrix. */
function at(path: SVGPathElement, arcLength: number): Point {
  const p = path.getPointAtLength(arcLength);
  return { x: p.x, y: p.y };
}

function samplePath(path: SVGPathElement, samples: number): Point[] {
  const total = path.getTotalLength();
  const out: Point[] = [];
  for (let i = 0; i <= samples; i += 1) out.push(at(path, (total * i) / samples));
  return out;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How far a point is from the nearest SAMPLE of a path. With 512 samples
 * of a ~150px path the spacing is ~0.3px, so "on the curve" and "within
 * 1px of the nearest sample" are the same statement. */
function distanceToPath(path: SVGPathElement, p: Point, samples = 512): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of samplePath(path, samples)) best = Math.min(best, distance(p, q));
  return best;
}

function unit(v: Point): Point {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) throw new Error("zero-length vector has no direction");
  return { x: v.x / mag, y: v.y / mag };
}

/** The tangent measured over a short real chord of the rendered path. */
const TANGENT_CHORD_PX = 2;

function departureDirection(path: SVGPathElement): Point {
  const total = path.getTotalLength();
  const forward = Math.min(TANGENT_CHORD_PX, total / 4);
  const a = at(path, 0);
  const b = at(path, forward);
  return unit({ x: b.x - a.x, y: b.y - a.y });
}

function arrivalDirection(path: SVGPathElement): Point {
  const total = path.getTotalLength();
  const back = Math.min(TANGENT_CHORD_PX, total / 4);
  const a = at(path, total - back);
  const b = at(path, total);
  return unit({ x: b.x - a.x, y: b.y - a.y });
}

function angleBetweenDeg(a: Point, b: Point): number {
  const cos = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Screen-space position of an svg user-space point, via the real CTM. */
function toScreen(svg: SVGGraphicsElement, p: Point): DOMPoint {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("element has no screen CTM");
  return new DOMPoint(p.x, p.y).matrixTransform(ctm);
}

/**
 * The falsifiable form of "tangent-blind": hold the coordinates fixed,
 * permute that end's `dir`, and count the distinct paths. 1 means the
 * router never read it; 4 means it read it every time.
 */
function distinctPathsByDir(
  routing: DirectRouting,
  end: "from" | "to",
  options: TraceRouteOptions = {},
): Set<string> {
  return new Set(
    TRACE_DIRS.map((dir) => {
      const from: TraceTerminalSpec = end === "from" ? { ...FROM_C, dir } : { ...FROM_C, dir: "right" };
      const to: TraceTerminalSpec = end === "to" ? { ...TO_C, dir } : { ...TO_C, dir: "right" };
      return routeTrace(routing, from, to, options).path;
    }),
  );
}

/* ------------------------------------------------------------------ */

const meta: Meta = {
  title: "Basics/Trace Routing",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* 1. The three routings                                                */
/* ------------------------------------------------------------------ */

/** Same two terminals, same tangents, three routers — read as one
 * comparison. The fourth cell is `slanted`'s documented degenerate case,
 * shown rather than described. */
export const Routings: Story = {
  render: () => (
    <div style={PAGE}>
      <Row
        specs={[
          {
            key: "straight",
            routing: "straight",
            label: "straight",
            caption: "the chord — reads neither tangent",
          },
          {
            key: "slanted",
            routing: "slanted",
            label: "slanted",
            caption: "a lead along from.dir, then one diagonal",
          },
          {
            key: "curved",
            routing: "curved",
            label: "curved",
            caption: "cubic leaving each end along its own face normal",
          },
          {
            key: "degenerate",
            routing: "slanted",
            to: { x: TO_C.x, y: FROM_C.y, dir: "right" },
            label: "slanted · degenerate",
            caption: "|dy| < 0.001 → two points, identical to straight",
          },
        ]}
      />
      <Note>
        The first three share endpoints and tangents; only the router differs. <code>slanted</code>{" "}
        departs along <code>from.dir</code> for a lead of{" "}
        {slantedAutomaticLead(SLANT_SPAN).toFixed(1)}px (its automatic{" "}
        <code>min(|control.x|, span/2)</code>), then runs one diagonal to the end.
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const keys = ["straight", "slanted", "curved", "degenerate"];
    for (const key of keys) {
      const cell = cellOf(canvasElement, key);
      await expect(cell.querySelectorAll('[data-slot="trace-line"]')).toHaveLength(1);
      await expect(cell.querySelectorAll('[data-slot="trace-terminal"]')).toHaveLength(2);
    }

    /* --- Every route starts and ends where it was told to ------------- */
    const endpointsFor = (key: string) => {
      if (key === "degenerate") {
        return {
          start: endpointOf(DEFAULT_FROM, "from"),
          end: endpointOf({ x: TO_C.x, y: FROM_C.y, dir: "right" }, "to"),
        };
      }
      return { start: A, end: B };
    };
    for (const key of keys) {
      const path = lineOf(canvasElement, key);
      const { start, end } = endpointsFor(key);
      await expect(distance(at(path, 0), start)).toBeLessThan(0.5);
      await expect(distance(at(path, path.getTotalLength()), end)).toBeLessThan(0.5);
    }

    /* --- straight: exactly the chord ---------------------------------- */
    const straight = routeTrace("straight", A, B);
    await expect(straight.points).toHaveLength(2);
    const straightPath = lineOf(canvasElement, "straight");
    await expect(Math.abs(straightPath.getTotalLength() - distance(A, B))).toBeLessThan(0.5);

    /* --- slanted: axis-aligned lead, then a real corner --------------- */
    const slanted = routeTrace("slanted", A, B);
    await expect(slanted.points).toHaveLength(3);
    const lead = slantedAutomaticLead(SLANT_SPAN);
    const slantedPath = lineOf(canvasElement, "slanted");
    // Arc length `lead` along the rendered path IS the corner, because the
    // first segment's length is the lead.
    await expect(distance(at(slantedPath, lead), { x: A.x + lead, y: A.y })).toBeLessThan(1);
    // Axis-aligned: halfway along the lead the y has not moved at all.
    await expect(Math.abs(at(slantedPath, lead / 2).y - A.y)).toBeLessThan(0.01);
    // ...and it really is a corner, not a smooth line through that point.
    const beforeCorner = unit({
      x: at(slantedPath, lead).x - at(slantedPath, lead - 2).x,
      y: at(slantedPath, lead).y - at(slantedPath, lead - 2).y,
    });
    const afterCorner = unit({
      x: at(slantedPath, lead + 2).x - at(slantedPath, lead).x,
      y: at(slantedPath, lead + 2).y - at(slantedPath, lead).y,
    });
    await expect(angleBetweenDeg(beforeCorner, afterCorner)).toBeGreaterThan(5);
    await expect(angleBetweenDeg(beforeCorner, DIR_VECTOR.right)).toBeLessThan(1);

    /* --- curved: a cubic that honours BOTH tangents ------------------- */
    const curved = routeTrace("curved", A, B);
    await expect(curved.points).toBeNull();
    await expect(curved.path).toContain(" C ");
    const curvedPath = lineOf(canvasElement, "curved");
    await expect(angleBetweenDeg(departureDirection(curvedPath), DIR_VECTOR.right)).toBeLessThan(5);
    await expect(angleBetweenDeg(arrivalDirection(curvedPath), DIR_VECTOR.right)).toBeLessThan(5);

    /* --- the three are genuinely three, not one drawn thrice ---------- */
    await expect(new Set([straight.path, slanted.path, curved.path]).size).toBe(3);

    /* --- degenerate slanted IS straight, byte for byte ---------------- */
    const flatTo = endpointOf({ x: TO_C.x, y: FROM_C.y, dir: "right" }, "to");
    const degenerate = routeTrace("slanted", A, flatTo);
    await expect(degenerate.points).toHaveLength(2);
    await expect(degenerate.path).toBe(routeTrace("straight", A, flatTo).path);
    const degeneratePath = lineOf(canvasElement, "degenerate");
    await expect(
      Math.abs(degeneratePath.getTotalLength() - distance(A, flatTo)),
    ).toBeLessThan(0.5);
  },
};

/* ------------------------------------------------------------------ */
/* 2. The centre control point, relocated                               */
/* ------------------------------------------------------------------ */

const SLANT_TS = [0.15, 0.5, 0.85] as const;
const CURVES: { key: string; label: string; curve: TraceCurve }[] = [
  { key: "up", label: "dy −56", curve: { dx: 0, dy: -56 } },
  { key: "down", label: "dy +56", curve: { dx: 0, dy: 56 } },
  { key: "along", label: "dx +70", curve: { dx: 70, dy: 0 } },
];

/**
 * Zach's ask, drawn: the same endpoints with the centre control point put
 * somewhere else. The orange diamond is the control point; the dashed
 * leader is the (dx, dy) it was moved by.
 */
export const ControlPoints: Story = {
  render: () => (
    <div style={PAGE}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <RowLabel title="slanted" note="slantT scales the lead" />
        <Row
          specs={[
            {
              key: "slant-auto",
              routing: "slanted",
              options: { slantT: null },
              label: "slantT · auto",
              caption: `lead ${slantedAutomaticLead(SLANT_SPAN).toFixed(1)}px`,
              showWaypoint: true,
            },
            ...SLANT_TS.map((t) => ({
              key: `slant-${t}`,
              routing: "slanted" as const,
              options: { slantT: t },
              label: `slantT ${t}`,
              caption: `lead ${(t * SLANT_SPAN).toFixed(1)}px of ${SLANT_SPAN}px span`,
              showWaypoint: true,
            })),
          ]}
        />
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <RowLabel title="curved" note="the waypoint at t=0.5" />
        <Row
          specs={[
            {
              key: "curve-none",
              routing: "curved",
              label: "curve · none",
              caption: "the kit's default cubic",
              showWaypoint: true,
            },
            ...CURVES.map((c) => ({
              key: `curve-${c.key}`,
              routing: "curved" as const,
              options: { curve: c.curve },
              label: `curved · ${c.label}`,
              caption: "the path passes through the diamond",
              showWaypoint: true,
            })),
          ]}
        />
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <RowLabel title="straight" note="bending it is the same curve" />
        <Row
          specs={[
            {
              key: "straight-none",
              routing: "straight",
              label: "straight · none",
              caption: "a pure two-point line",
              showWaypoint: true,
            },
            {
              key: "straight-bent",
              routing: "straight",
              options: { curve: { dx: 0, dy: -56 } },
              label: "straight · dy −56",
              caption: "becomes a quadratic",
              showWaypoint: true,
            },
            {
              key: "curved-bent",
              routing: "curved",
              options: { curve: { dx: 0, dy: -56 } },
              label: "curved · dy −56",
              caption: "identical d — same bentCurvedPath",
              showWaypoint: true,
            },
          ]}
        />
      </div>

      <Note>
        The last two cells are the same path. A dragged control point routes both{" "}
        <code>straight</code> and <code>curved</code> through one{" "}
        <code>bentCurvedPath</code> (connectionRouting.ts:212-214), so bending a straight line
        does not make a second kind of curve — it makes the curve.
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    /* --- slanted: the lead really is slantT x span -------------------- */
    const leads: number[] = [];
    for (const t of SLANT_TS) {
      const key = `slant-${t}`;
      const path = lineOf(canvasElement, key);
      const expectedLead = t * SLANT_SPAN;
      // Measured off the render: arc length `expectedLead` must land on the
      // corner, which is on the start's own horizontal.
      const corner = at(path, expectedLead);
      await expect(distance(corner, { x: A.x + expectedLead, y: A.y })).toBeLessThan(1);
      await expect(Math.abs(at(path, expectedLead / 2).y - A.y)).toBeLessThan(0.01);
      leads.push(corner.x - A.x);
    }
    // Three different positions, in order — the control point genuinely moves.
    await expect(leads[0]).toBeLessThan(leads[1]);
    await expect(leads[1]).toBeLessThan(leads[2]);

    const autoLead = slantedAutomaticLead(SLANT_SPAN);
    const autoPath = lineOf(canvasElement, "slant-auto");
    await expect(distance(at(autoPath, autoLead), { x: A.x + autoLead, y: A.y })).toBeLessThan(1);
    // The automatic lead is its own value, not a re-spelling of one of the three.
    for (const lead of leads) await expect(Math.abs(lead - autoLead)).toBeGreaterThan(2);

    /* --- the drawn diamond sits ON the computed control point --------- */
    const waypointCells: { key: string; options?: TraceRouteOptions; routing: DirectRouting }[] = [
      { key: "slant-auto", routing: "slanted", options: { slantT: null } },
      ...SLANT_TS.map((t) => ({
        key: `slant-${t}`,
        routing: "slanted" as DirectRouting,
        options: { slantT: t },
      })),
      { key: "curve-none", routing: "curved" },
      ...CURVES.map((c) => ({
        key: `curve-${c.key}`,
        routing: "curved" as DirectRouting,
        options: { curve: c.curve },
      })),
      { key: "straight-none", routing: "straight" },
      { key: "straight-bent", routing: "straight", options: { curve: { dx: 0, dy: -56 } } },
      { key: "curved-bent", routing: "curved", options: { curve: { dx: 0, dy: -56 } } },
    ];
    for (const spec of waypointCells) {
      const cell = cellOf(canvasElement, spec.key);
      const svg = requireEl<SVGSVGElement>(cell, '[data-slot="trace-canvas"]');
      const diamond = requireEl<SVGGraphicsElement>(cell, '[data-slot="trace-waypoint"]');
      const expected = toScreen(svg, routeTrace(spec.routing, A, B, spec.options).waypoint);
      const rect = diamond.getBoundingClientRect();
      await expect(Math.abs(rect.left + rect.width / 2 - expected.x)).toBeLessThan(1);
      await expect(Math.abs(rect.top + rect.height / 2 - expected.y)).toBeLessThan(1);
    }

    /* --- curved: the bent path PASSES THROUGH its waypoint ------------ */
    const defaultCurvedPathEl = lineOf(canvasElement, "curve-none");
    for (const c of CURVES) {
      const path = lineOf(canvasElement, `curve-${c.key}`);
      const waypoint = routeTrace("curved", A, B, { curve: c.curve }).waypoint;
      await expect(distanceToPath(path, waypoint)).toBeLessThan(1);
      // ...and that is not vacuous: the SAME waypoint is nowhere near the
      // unbent cubic between the same two endpoints.
      await expect(distanceToPath(defaultCurvedPathEl, waypoint)).toBeGreaterThan(5);
    }
    // The three bends are three places, not three spellings of one.
    const waypoints = CURVES.map((c) => routeTrace("curved", A, B, { curve: c.curve }).waypoint);
    for (let i = 0; i < waypoints.length; i += 1) {
      for (let j = i + 1; j < waypoints.length; j += 1) {
        await expect(distance(waypoints[i], waypoints[j])).toBeGreaterThan(20);
      }
    }

    /* --- straight-with-bend IS curved-with-bend ----------------------- */
    const bend: TraceCurve = { dx: 0, dy: -56 };
    await expect(routeTrace("straight", A, B, { curve: bend }).path).toBe(
      routeTrace("curved", A, B, { curve: bend }).path,
    );
    const straightBent = lineOf(canvasElement, "straight-bent");
    const curvedBent = lineOf(canvasElement, "curved-bent");
    await expect(straightBent.getAttribute("d")).toBe(curvedBent.getAttribute("d"));
    // Rendered, not just authored: 128 samples of each agree.
    const left = samplePath(straightBent, 128);
    const right = samplePath(curvedBent, 128);
    for (let i = 0; i < left.length; i += 1) {
      await expect(distance(left[i], right[i])).toBeLessThan(0.01);
    }
    // And the bend is a real change from the pure line it started as.
    const pureLine = lineOf(canvasElement, "straight-none");
    await expect(straightBent.getAttribute("d")).not.toBe(pureLine.getAttribute("d"));
    await expect(routeTrace("straight", A, B).points).toHaveLength(2);
    await expect(routeTrace("straight", A, B, { curve: bend }).points).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* 3 + 4. The honest tangent matrices                                   */
/* ------------------------------------------------------------------ */

function MatrixHeader({ end }: { end: "from" | "to" }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
      <div style={{ width: 96, flexShrink: 0 }} />
      {TRACE_DIRS.map((dir) => (
        <div key={dir} style={{ width: CELL_W }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {end}.dir “{dir}”
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            side {end === "from" ? `“${dir}”` : `“${OPPOSITE_DIR[dir]}”`}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Source fixed at `dir: "right"`; the target's tangent permuted through
 * all four. Every cell renders (D7) — the unsupported ones are the point.
 */
export const TargetTangents: Story = {
  render: () => (
    <div style={PAGE}>
      <MatrixHeader end="to" />
      {DIRECT_ROUTINGS.map((routing) => (
        <div key={routing} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <RowLabel
            title={routing}
            note={honorsTangent(routing, "to") ? "honors to.dir" : "tangent-blind at to"}
          />
          <Row
            specs={TRACE_DIRS.map((dir) => ({
              key: `to-${routing}-${dir}`,
              routing,
              to: { ...TO_C, dir },
              label: `${routing} → ${dir}`,
              supported: honorsTangent(routing, "to"),
              caption: honorsTangent(routing, "to") ? "arrives along to.dir" : BLIND_CAPTION,
            }))}
          />
        </div>
      ))}
      <Note>
        <code>straight</code> never reads a tangent at all and <code>slanted</code> reads only the
        source’s, so eight of these twelve cannot be served. They are drawn exactly as the function
        returns them. On a perfectly horizontal chord a straight line would happen to arrive
        travelling “right” — that is coincidence, not fidelity, which is why each label comes from
        the routing’s declared behaviour rather than from how the picture looks.
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Nothing is omitted: 3 routings x 4 tangents, all present and drawn.
    await expect(canvasElement.querySelectorAll('[data-slot="trace-line"]')).toHaveLength(12);

    for (const routing of DIRECT_ROUTINGS) {
      const honored = honorsTangent(routing, "to");

      /* --- the general claim: blind == invariant under to.dir --------- */
      await expect(distinctPathsByDir(routing, "to").size).toBe(honored ? 4 : 1);

      for (const dir of TRACE_DIRS) {
        const key = `to-${routing}-${dir}`;
        const cell = cellOf(canvasElement, key);
        await expect(cell.getAttribute("data-supported")).toBe(String(honored));
        await expect(cell.querySelectorAll('[data-slot="trace-line"]')).toHaveLength(1);

        const measured = angleBetweenDeg(arrivalDirection(lineOf(canvasElement, key)), DIR_VECTOR[dir]);
        if (honored) {
          await expect(measured).toBeLessThan(5);
        } else {
          // Honest, and specific to THIS fixture's slanted chord: every
          // unsupported cell here visibly misses its tangent. The general
          // claim is the invariance check above, not this angle.
          await expect(measured).toBeGreaterThan(5);
          await expect(
            requireEl(cell, '[data-slot="cell-caption"]').textContent,
          ).toContain(BLIND_CAPTION);
        }
      }
    }
  },
};

/**
 * The mirror: target fixed at `dir: "right"`, the source's tangent
 * permuted. This is the column `slanted` exists for — it is the one
 * routing that honours exactly one end.
 */
export const SourceTangents: Story = {
  render: () => (
    <div style={PAGE}>
      <MatrixHeader end="from" />
      {DIRECT_ROUTINGS.map((routing) => (
        <div key={routing} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <RowLabel
            title={routing}
            note={honorsTangent(routing, "from") ? "honors from.dir" : "tangent-blind at from"}
          />
          <Row
            specs={TRACE_DIRS.map((dir) => ({
              key: `from-${routing}-${dir}`,
              routing,
              from: { ...FROM_C, dir },
              label: `${dir} → ${routing}`,
              supported: honorsTangent(routing, "from"),
              caption: honorsTangent(routing, "from") ? "leaves along from.dir" : BLIND_CAPTION,
            }))}
          />
        </div>
      ))}
      <Note>
        <code>slanted</code> turns its departure axis to match the source — that lead is the whole
        idea it borrows from ELK’s POLYLINE routing and React Flow’s <code>sourcePosition</code>.{" "}
        <code>curved</code> leaves perpendicular to the same face. <code>straight</code> draws the
        chord whatever the source says.
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="trace-line"]')).toHaveLength(12);

    for (const routing of DIRECT_ROUTINGS) {
      const honored = honorsTangent(routing, "from");
      await expect(distinctPathsByDir(routing, "from").size).toBe(honored ? 4 : 1);

      for (const dir of TRACE_DIRS) {
        const key = `from-${routing}-${dir}`;
        const cell = cellOf(canvasElement, key);
        await expect(cell.getAttribute("data-supported")).toBe(String(honored));

        const measured = angleBetweenDeg(
          departureDirection(lineOf(canvasElement, key)),
          DIR_VECTOR[dir],
        );
        if (honored) {
          await expect(measured).toBeLessThan(5);
        } else {
          await expect(measured).toBeGreaterThan(5);
          await expect(
            requireEl(cell, '[data-slot="cell-caption"]').textContent,
          ).toContain(BLIND_CAPTION);
        }
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 5. What dragging a curved trace's control point costs                */
/* ------------------------------------------------------------------ */

const DROP_TO: TraceTerminalSpec = { ...TO_C, dir: "top" };

/**
 * Found by porting, worth a cell of its own: `bentCurvedPath` takes only
 * `(start, end, curve)` — it never receives the exit sides
 * (connectionRouting.ts:115-120). So the moment a curved trace's control
 * point is dragged it stops honouring EITHER tangent, and the arrowhead
 * stops meeting the target the way it did a frame earlier.
 */
export const BentCurveDropsTangents: Story = {
  render: () => (
    <div style={PAGE}>
      <Row
        specs={[
          {
            key: "drop-default",
            routing: "curved",
            to: DROP_TO,
            label: "curved · no control point",
            caption: "arrives travelling “top”, out of the target’s free space below",
            supported: true,
            showWaypoint: true,
          },
          {
            key: "drop-up",
            routing: "curved",
            to: DROP_TO,
            options: { curve: { dx: 0, dy: -56 } },
            label: "curved · dy −56",
            caption: `${BLIND_CAPTION} — the bend replaced the cubic`,
            supported: false,
            showWaypoint: true,
          },
          {
            key: "drop-down",
            routing: "curved",
            to: DROP_TO,
            options: { curve: { dx: 0, dy: 56 } },
            label: "curved · dy +56",
            caption: `${BLIND_CAPTION} — still a plain quadratic`,
            supported: false,
            showWaypoint: true,
          },
        ]}
      />
      <Note>
        A bent curve is a quadratic through one waypoint and nothing else. This is the donor’s
        model, not a porting mistake — it is recorded here so a caption never claims a bent curve
        still meets its faces. The elbow router (P3) is the routing that keeps both tangents while
        its centre control point moves.
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const start = endpointOf(DEFAULT_FROM, "from");
    const end = endpointOf(DROP_TO, "to");
    const up: TraceCurve = { dx: 0, dy: -56 };
    const down: TraceCurve = { dx: 0, dy: 56 };

    /* --- the default cubic really does arrive along to.dir ------------ */
    const defaultCell = cellOf(canvasElement, "drop-default");
    await expect(defaultCell.getAttribute("data-supported")).toBe("true");
    await expect(
      angleBetweenDeg(arrivalDirection(lineOf(canvasElement, "drop-default")), DIR_VECTOR.top),
    ).toBeLessThan(5);
    await expect(distinctPathsByDir("curved", "to").size).toBe(4);

    /* --- bent: both tangents gone, measured and invariant ------------- */
    for (const [key, curve] of [
      ["drop-up", up],
      ["drop-down", down],
    ] as const) {
      const cell = cellOf(canvasElement, key);
      await expect(cell.getAttribute("data-supported")).toBe("false");
      await expect(
        angleBetweenDeg(arrivalDirection(lineOf(canvasElement, key)), DIR_VECTOR.top),
      ).toBeGreaterThan(5);
      // The general form: with the coordinates fixed, all four target
      // tangents produce ONE path — the bend read none of them.
      await expect(distinctPathsByDir("curved", "to", { curve }).size).toBe(1);
      await expect(distinctPathsByDir("curved", "from", { curve }).size).toBe(1);
      // The cell still draws the honest path, and it still passes through
      // the control point it was given.
      await expect(
        distanceToPath(lineOf(canvasElement, key), routeTrace("curved", start, end, { curve }).waypoint),
      ).toBeLessThan(1);
    }
  },
};
