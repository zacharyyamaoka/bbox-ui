import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { TraceBody } from "../components/trace";
import { DIR_VECTOR, type Point, type TraceDir, type TraceTerminalSpec } from "../components/trace.layout";
import { TraceTerminal } from "../components/traceTerminal";
import {
  DEFAULT_ELBOW_OPTIONS,
  elbowPath,
  pinElbowSegment,
  resolvePin,
  routeElbow,
  type ElbowPin,
  type ElbowRect,
  type ElbowRoute,
} from "../components/elbow/index";
import { elbowInputFromTerminals, routePoints, type TraceElbowRequest } from "../components/elbow/traceContract";

/* ------------------------------------------------------------------ */
/* The fixtures                                                        */
/*                                                                     */
/* Every route below comes out of `routeElbow` — the A* router ported   */
/* VERBATIM from SystemSketch (itself ported from Excalidraw, MIT).     */
/* Nothing in this file re-derives geometry; it lays out terminals and  */
/* keep-out rects, and the router answers.                              */
/*                                                                     */
/* There is no separate "multi-elbow" KIND, and that is worth stating   */
/* because the two screenshots Zach showed look like two features:      */
/* `CONNECTION_ROUTING_KINDS = ['curved','straight','elbow']`           */
/* (`connectionModel.ts:9`). One riser and a six-point staircase are    */
/* the SAME call — the bend count is what the obstacles and the two     */
/* flow tangents force, not a mode someone picks.                       */
/* ------------------------------------------------------------------ */

/** How far short of a terminal's centre the wire stops. The glyph's ring is
 * r=9 and its disc is opaque, so a wire drawn to the exact centre would
 * vanish under it — and so would the chevron marker, which reaches ~12px
 * back from the path's end. */
const TERMINAL_GAP = 16;

/** Where the wire actually starts: `TERMINAL_GAP` along the flow, out of the
 * glyph. */
function routeStart(from: TraceTerminalSpec): TraceTerminalSpec {
  return {
    x: from.x + DIR_VECTOR[from.dir].x * TERMINAL_GAP,
    y: from.y + DIR_VECTOR[from.dir].y * TERMINAL_GAP,
    dir: from.dir,
  };
}

/**
 * Where the wire stops: `TERMINAL_GAP` BEHIND the target, measured along the
 * direction of travel — so the arrowhead sits in the gap pointing at the
 * glyph. For `dir: "left"` that puts the wire's last point to the RIGHT of
 * the terminal, which is exactly the wrap-around case and is not a sign error.
 */
function routeEnd(to: TraceTerminalSpec): TraceTerminalSpec {
  return {
    x: to.x - DIR_VECTOR[to.dir].x * TERMINAL_GAP,
    y: to.y - DIR_VECTOR[to.dir].y * TERMINAL_GAP,
    dir: to.dir,
  };
}

interface ElbowScene {
  key: string;
  title: string;
  caption: string;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  obstacles?: ElbowRect[];
  /** Direction changes the drawn line must actually contain. Measured from
   * the rendered path in the play function, never read off the route data. */
  minBends: number;
}

const t = (x: number, y: number, dir: TraceDir): TraceTerminalSpec => ({ x, y, dir });

const ELBOW_SCENES: ElbowScene[] = [
  {
    key: "riser",
    title: "One riser",
    caption: "no obstacles — out, across, in",
    from: t(24, 50, "right"),
    to: t(416, 170, "right"),
    minBends: 2,
  },
  {
    key: "detour",
    title: "Around a keep-out",
    caption: "same two terminals, one obstacle",
    from: t(24, 50, "right"),
    to: t(416, 170, "right"),
    obstacles: [{ x: 180, y: 30, w: 80, h: 130 }],
    minBends: 4,
  },
  {
    key: "staircase",
    title: "Two keep-outs",
    caption: "the bend count is forced, not chosen",
    from: t(24, 40, "right"),
    to: t(416, 200, "right"),
    obstacles: [
      { x: 130, y: 40, w: 60, h: 180 },
      { x: 230, y: -60, w: 60, h: 180 },
    ],
    minBends: 4,
  },
  {
    key: "backwards",
    title: "Target behind the source",
    caption: "flow still leaves right and arrives right",
    from: t(344, 45, "right"),
    to: t(76, 175, "right"),
    minBends: 4,
  },
  {
    key: "wrap",
    title: "Arriving from the far side",
    caption: 'to.dir "left" — the wire wraps past and comes back',
    from: t(24, 120, "right"),
    to: t(400, 120, "left"),
    obstacles: [{ x: 170, y: 60, w: 100, h: 120 }],
    minBends: 4,
  },
  {
    key: "descend",
    title: "Down and in",
    caption: 'from.dir "bottom", to.dir "top"',
    from: t(44, 34, "bottom"),
    to: t(380, 164, "top"),
    minBends: 2,
  },
];

function sceneRequest(scene: ElbowScene, pins?: readonly ElbowPin[]): TraceElbowRequest {
  return {
    from: routeStart(scene.from),
    to: routeEnd(scene.to),
    ...(scene.obstacles ? { obstacles: scene.obstacles } : {}),
    ...(pins ? { pins } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/** Frame each card on its own geometry. A route that detours 60px past the
 * nominal box (which several of these legitimately do) must still be fully
 * visible — a clipped route would hide the exact thing the card exists to
 * show. */
function viewBoxFor(route: ElbowRoute, extra: readonly Point[], obstacles: readonly ElbowRect[]): string {
  const xs = [...route.points.map((p) => p.x), ...extra.map((p) => p.x)];
  const ys = [...route.points.map((p) => p.y), ...extra.map((p) => p.y)];
  for (const rect of obstacles) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  const pad = 26;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
}

function Keepout({ rect }: { rect: ElbowRect }) {
  const pad = DEFAULT_ELBOW_OPTIONS.padding;
  return (
    <g data-slot="elbow-obstacle">
      <rect
        x={rect.x - pad}
        y={rect.y - pad}
        width={rect.w + pad * 2}
        height={rect.h + pad * 2}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.35}
        strokeDasharray="4 4"
        rx={6}
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="var(--muted)"
        stroke="var(--border)"
        rx={4}
      />
    </g>
  );
}

function SceneCard({
  scene,
  pins,
  badge,
  railHint,
}: {
  scene: ElbowScene;
  pins?: readonly ElbowPin[];
  badge?: string;
  railHint?: number;
}) {
  const request = sceneRequest(scene, pins);
  const route = routeElbow(elbowInputFromTerminals(request));
  const path = elbowPath(route);
  const obstacles = scene.obstacles ?? [];
  const viewBox = viewBoxFor(route, [scene.from, scene.to], obstacles);
  const [, , vw, vh] = viewBox.split(" ").map(Number);
  const id = `${scene.key}${badge ? `-${badge}` : ""}`;

  return (
    <figure
      data-testid={`elbow-card-${id}`}
      data-slot="elbow-card"
      style={{
        margin: 0,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <figcaption style={{ padding: "10px 12px 6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{scene.title}</span>
          {badge ? (
            <span
              data-slot="elbow-card-badge"
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "var(--bbox-primary, var(--primary))",
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{scene.caption}</div>
      </figcaption>
      <svg
        data-slot="elbow-canvas"
        data-testid={`elbow-canvas-${id}`}
        viewBox={viewBox}
        width="100%"
        style={{ display: "block", aspectRatio: `${vw} / ${vh}` }}
      >
        {obstacles.map((rect, index) => (
          <Keepout key={index} rect={rect} />
        ))}
        {railHint === undefined ? null : (
          <line
            data-slot="elbow-rail-hint"
            x1={railHint}
            y1={-999}
            x2={railHint}
            y2={999}
            stroke="var(--bbox-primary, var(--primary))"
            strokeOpacity={0.35}
            strokeDasharray="3 5"
          />
        )}
        <TraceBody id={`trace-${id}`} path={path} points={routePoints(route)} />
        <TraceTerminal {...scene.from} />
        <TraceTerminal {...scene.to} />
      </svg>
    </figure>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        // WHY `start`: grid rows stretch to their tallest cell by default, and
        // each card is framed on its OWN geometry — so a tall scene was
        // padding its row-mates with dead space.
        alignItems: "start",
        gap: 14,
        padding: 18,
        background: "var(--background)",
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Trace/Elbow",
  tags: ["area:trace", "lane:baseline"],
  component: TraceBody,
  parameters: { layout: "fullscreen" },
  args: { id: "elbow", path: "" },
} satisfies Meta<typeof TraceBody>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The ruler is frozen, and pinned                                      */
/*                                                                      */
/* Every tolerance below is a LITERAL, not `DEFAULT_ELBOW_OPTIONS.x`.    */
/* Mutation testing found the reason (2026-09-17): setting the router's  */
/* padding to 0 left a clearance assertion written as `padding - 4`      */
/* trivially true, because the mutation moved the ruler along with the   */
/* thing it was measuring. The constants are instead PINNED once — so a  */
/* deliberate change upstream is a loud, single failure here rather than */
/* a silent loss of coverage everywhere.                                 */
/* ------------------------------------------------------------------ */

/** Keep-out clearance the router plans against. */
const PADDING_PX = 24;
/** Corner rounding `elbowPath` applies. */
const CORNER_RADIUS_PX = 8;
/**
 * What the DRAWN line is therefore guaranteed to keep clear. A rounded
 * corner cuts toward the inside of its turn by up to
 * `r * (sqrt(2) - 1) / ...` — measured worst case 2.83px at r=8 — and a
 * corner turning around an obstacle turns toward it. 24 - 2.83, rounded
 * down.
 */
const MIN_DRAWN_CLEARANCE_PX = 20;

function assertRulerUnchanged() {
  // If any of these fire, the donor moved a default and every tolerance in
  // this file needs re-deriving by hand. That is the intended outcome: a
  // changed constant should cost a human a minute, not cost the suite its
  // teeth.
  if (DEFAULT_ELBOW_OPTIONS.padding !== PADDING_PX) {
    throw new Error(`router padding is now ${DEFAULT_ELBOW_OPTIONS.padding}, not ${PADDING_PX}`);
  }
  if (DEFAULT_ELBOW_OPTIONS.cornerRadius !== CORNER_RADIUS_PX) {
    throw new Error(`corner radius is now ${DEFAULT_ELBOW_OPTIONS.cornerRadius}, not ${CORNER_RADIUS_PX}`);
  }
}

/* ------------------------------------------------------------------ */
/* Measurement — every claim below is read off the RENDERED path with   */
/* `getPointAtLength`, in SVG user space, which is the fixture's own    */
/* coordinate system regardless of viewBox scaling. Nothing is inferred */
/* from DOM presence, and nothing is read back out of the route data    */
/* the component was handed (that would be the component grading its    */
/* own homework).                                                       */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

function samplePath(path: SVGPathElement, samples = 800): Point[] {
  const total = path.getTotalLength();
  const out: Point[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const p = path.getPointAtLength((total * i) / samples);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Two degrees, as a sine — the tolerance for "this step is axis-aligned". */
const AXIS_SIN = Math.sin((2 * Math.PI) / 180);

interface ArcStats {
  total: number;
  /** Arc length whose tangent is within 2 degrees of an axis. */
  axisLength: number;
  /** Everything else — corner rounding, or a diagonal if the router broke. */
  offAxisLength: number;
  /** The LONGEST contiguous non-axis-aligned stretch. This is the number that
   * separates "rounded corners" from "a diagonal": a corner arc of radius r
   * is at most a quarter circle, pi*r/2; a diagonal run is however long the
   * diagonal is. Aggregate off-axis length cannot make that distinction — a
   * route with many corners has a large aggregate and is perfectly fine. */
  longestOffAxisRun: number;
  /** Direction changes in the DRAWN line. Counted as corner arcs, falling
   * back to dominant-axis flips for a corner too tight to round (`elbowPath`
   * clamps the radius to half the shorter adjacent segment and draws a hard
   * `L` when that collapses — a 4px jog between two long runs does exactly
   * that, and flip-counting alone then misses two real corners). */
  bends: number;
}

function arcStats(points: readonly Point[]): ArcStats {
  let total = 0;
  let axisLength = 0;
  let flips = 0;
  let cornerArcs = 0;
  let longestOffAxisRun = 0;
  let currentOffAxisRun = 0;
  let lastAxis: "x" | "y" | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    total += len;
    const aligned = Math.min(Math.abs(dx), Math.abs(dy)) / len <= AXIS_SIN;
    if (!aligned) {
      if (currentOffAxisRun === 0) cornerArcs += 1;
      currentOffAxisRun += len;
      longestOffAxisRun = Math.max(longestOffAxisRun, currentOffAxisRun);
      continue;
    }
    currentOffAxisRun = 0;
    axisLength += len;
    const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    if (lastAxis !== null && axis !== lastAxis) flips += 1;
    lastAxis = axis;
  }
  return {
    total,
    axisLength,
    offAxisLength: total - axisLength,
    longestOffAxisRun,
    bends: Math.max(cornerArcs, flips),
  };
}

/** 0 when the point is inside the rect; otherwise the true euclidean gap. */
function distanceToRect(p: Point, rect: ElbowRect): number {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

function angleBetweenDeg(a: Point, b: Point): number {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

interface AxisRun {
  axis: "h" | "v";
  /** The constant coordinate: x for a vertical run, y for a horizontal one. */
  c: number;
  lo: number;
  hi: number;
}

/** Maximal straight runs in a sampled path. Corner arcs break a run, which is
 * exactly what makes the surviving runs the true rails. */
function axisRuns(points: readonly Point[], minLength = 6): AxisRun[] {
  const runs: AxisRun[] = [];
  let start = 0;
  const axisAt = (i: number): "h" | "v" | null => {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    if (Math.min(Math.abs(dx), Math.abs(dy)) / len > AXIS_SIN) return null;
    return Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
  };
  let current: "h" | "v" | null = null;
  const flush = (endIndex: number) => {
    if (!current) return;
    const a = points[start];
    const b = points[endIndex];
    const run: AxisRun = current === "v"
      ? { axis: "v", c: (a.x + b.x) / 2, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) }
      : { axis: "h", c: (a.y + b.y) / 2, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) };
    if (run.hi - run.lo >= minLength) runs.push(run);
  };
  for (let i = 1; i < points.length; i += 1) {
    const axis = axisAt(i);
    if (axis !== current) {
      flush(i - 1);
      current = axis;
      start = i - 1;
    }
  }
  flush(points.length - 1);
  return runs;
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/**
 * One riser and a forced staircase, side by side, from the SAME function.
 * Keep-outs are drawn twice: the solid rect is the obstacle, the dashed
 * outline is the 24px clearance the router actually plans against
 * (`DEFAULT_ELBOW_OPTIONS.padding`) — so a route hugging the dashed line is
 * obeying the rule, not brushing the box.
 */
export const ElbowAndMultiElbow: Story = {
  render: () => (
    <Grid>
      {ELBOW_SCENES.map((scene) => (
        <SceneCard key={scene.key} scene={scene} />
      ))}
    </Grid>
  ),
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    const cards = canvasElement.querySelectorAll('[data-slot="elbow-card"]');
    await expect(cards).toHaveLength(ELBOW_SCENES.length);

    for (const scene of ELBOW_SCENES) {
      const svg = requireEl<SVGSVGElement>(canvasElement, `[data-testid="elbow-canvas-${scene.key}"]`);
      const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
      const points = samplePath(line);
      const stats = arcStats(points);

      // 1. Orthogonality, measured — not "the data says orthogonal".
      //    The drawn path is not a pure polyline: `elbowPath` rounds each
      //    corner with a quadratic of radius 8, and a rounded corner sweeps
      //    through every angle from 0 to 90 degrees. So the honest claim is
      //    not "no sample is diagonal" but "every non-axis-aligned stretch is
      //    SHORT ENOUGH to be a corner arc and nothing else" — one quarter
      //    circle of radius 8 is 12.6px. A router that emitted a real
      //    diagonal would produce one long off-axis run and fail this, and
      //    only this, is the check that can tell the two apart.
      const cornerArcBudget = (Math.PI / 2) * CORNER_RADIUS_PX + 1;
      await expect(
        stats.longestOffAxisRun,
        `${scene.key}: a ${stats.longestOffAxisRun.toFixed(1)}px non-axis-aligned run — longer than one ${cornerArcBudget.toFixed(1)}px corner arc, so it is a diagonal, not rounding`,
      ).toBeLessThanOrEqual(cornerArcBudget);
      await expect(
        stats.axisLength / stats.total,
        `${scene.key}: only ${((stats.axisLength / stats.total) * 100).toFixed(1)}% of the line is axis-aligned`,
      ).toBeGreaterThan(0.85);

      // 2. The bend count the obstacles force. A card captioned "two
      //    keep-outs" that quietly rendered a straight line would pass every
      //    other check in this file.
      await expect(stats.bends, `${scene.key}: measured ${stats.bends} bends`).toBeGreaterThanOrEqual(scene.minBends);

      // 3. The wire arrives travelling `to.dir`. This is the whole reason
      //    elbow exists in the routing matrix: it honours BOTH tangents,
      //    where straight honours neither and slanted only the source's.
      const tail = points.slice(-6);
      const arrival = { x: tail[tail.length - 1].x - tail[0].x, y: tail[tail.length - 1].y - tail[0].y };
      await expect(
        angleBetweenDeg(arrival, DIR_VECTOR[scene.to.dir]),
        `${scene.key}: arrives at ${JSON.stringify(arrival)}, expected ${scene.to.dir}`,
      ).toBeLessThan(5);

      // 4. Endpoints land in the terminal gap — the wire stops short of the
      //    glyph so the ring and the chevron are both legible.
      const head = points[0];
      const expectedStart = routeStart(scene.from);
      const expectedEnd = routeEnd(scene.to);
      await expect(Math.hypot(head.x - expectedStart.x, head.y - expectedStart.y)).toBeLessThan(1);
      const last = points[points.length - 1];
      await expect(Math.hypot(last.x - expectedEnd.x, last.y - expectedEnd.y)).toBeLessThan(1);

      // 5. Keep-outs are cleared, with the corner-rounding allowance stated.
      //    A rounded corner cuts INSIDE its vertex by at most
      //    r*(sqrt(2)-1)/... — measured worst case 2.83px for r=8 — and a
      //    corner turning around an obstacle cuts toward it. So the drawn
      //    line's guaranteed clearance is padding minus that, not padding.
      for (const rect of scene.obstacles ?? []) {
        let closest = Number.POSITIVE_INFINITY;
        for (const p of points) closest = Math.min(closest, distanceToRect(p, rect));
        await expect(
          closest,
          `${scene.key}: drawn line comes within ${closest.toFixed(2)}px of the obstacle`,
        ).toBeGreaterThan(MIN_DRAWN_CLEARANCE_PX);
      }

      // 6. One arrowhead, at the `to` end only.
      const markers = svg.querySelectorAll('[data-slot="trace-marker"]');
      await expect(markers).toHaveLength(1);
      await expect(line.getAttribute("marker-end")).toBe(`url(#${markers[0].id})`);
      await expect(line.getAttribute("marker-start")).toBeNull();
    }
  },
};

/* ------------------------------------------------------------------ */

const PIN_SCENE = ELBOW_SCENES[0];
const PIN_TS = [0.2, 0.5, 0.8] as const;

/**
 * A pin is the persisted form of "the user dragged this bend". It is NOT an
 * absolute point: `elbowPins.ts`'s header records exactly why Excalidraw's
 * `fixedSegments` was rejected — element-local absolute points meant dragging
 * the box left the elbow behind ("Dragging the box should drag everything
 * inside frozen in place"). A pin stores one scalar in the frame spanned by
 * the two endpoints, `mid + (t - 0.5)*span + offset`, so translating BOTH
 * endpoints moves the bend by exactly the same delta.
 *
 * The dashed orange rail is `resolvePin`'s answer. The drawn line is measured
 * against it below.
 */
function pinsAt(t: number): ElbowPin[] {
  const input = elbowInputFromTerminals(sceneRequest(PIN_SCENE));
  const x = input.start.point.x + (input.end.point.x - input.start.point.x) * t;
  // Segment 1 is the middle rail. Segments 0 and 2 touch a fixed endpoint and
  // are `pinnable: false` — `pinElbowSegment` returns null for those, which is
  // asserted below rather than assumed.
  const pins = pinElbowSegment(input, 1, { x, y: 0 });
  if (!pins) throw new Error(`segment 1 refused a pin at t=${t}`);
  return pins;
}

export const ElbowPins: Story = {
  render: () => {
    const input = elbowInputFromTerminals(sceneRequest(PIN_SCENE));
    return (
      <Grid>
        <SceneCard
          scene={{ ...PIN_SCENE, title: "No pin", caption: "the router's own midline rail" }}
        />
        {PIN_TS.map((t) => {
          const pins = pinsAt(t);
          return (
            <SceneCard
              key={t}
              scene={{
                ...PIN_SCENE,
                title: "Centre segment pinned",
                caption: `pin { index: 1, axis: "y", t: ${t} } → x ${resolvePin(pins[0], input.start.point, input.end.point)}`,
              }}
              pins={pins}
              badge={`t=${t}`}
              railHint={resolvePin(pins[0], input.start.point, input.end.point)}
            />
          );
        })}
      </Grid>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    const input = elbowInputFromTerminals(sceneRequest(PIN_SCENE));

    // The endpoint segments genuinely refuse a pin. Asserted, because the
    // whole "index addresses the AUTO route's segments" contract rests on it.
    await expect(pinElbowSegment(input, 0, { x: 100, y: 100 })).toBeNull();
    await expect(pinElbowSegment(input, 2, { x: 100, y: 100 })).toBeNull();

    /** The x of the longest vertical run in the drawn line — the rail, read
     * off the rendered path rather than off the route. */
    const railOf = (testid: string): number => {
      const svg = requireEl<SVGSVGElement>(canvasElement, `[data-testid="elbow-canvas-${testid}"]`);
      const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
      const runs = axisRuns(samplePath(line)).filter((run) => run.axis === "v");
      if (runs.length === 0) throw new Error(`${testid}: no vertical run in the drawn line`);
      runs.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
      return runs[0].c;
    };

    const measured: number[] = [];
    for (const t of PIN_TS) {
      const pins = pinsAt(t);
      const expected = resolvePin(pins[0], input.start.point, input.end.point);
      const rail = railOf(`${PIN_SCENE.key}-t=${t}`);
      await expect(
        Math.abs(rail - expected),
        `t=${t}: drawn rail at x=${rail.toFixed(2)}, resolvePin says ${expected}`,
      ).toBeLessThan(1);
      measured.push(rail);
    }

    // Dragging the pin right moves the rail right, every time.
    await expect(measured[0]).toBeLessThan(measured[1]);
    await expect(measured[1]).toBeLessThan(measured[2]);

    // t=0.5 is the identity: pinning the centre segment where the router
    // already put it changes nothing. That round-trip
    // (`resolvePin(createPin(...)) === value`) is what makes a re-route of an
    // untouched input byte-identical, and it is measurable here.
    await expect(Math.abs(railOf(PIN_SCENE.key) - measured[1])).toBeLessThan(1);
  },
};
