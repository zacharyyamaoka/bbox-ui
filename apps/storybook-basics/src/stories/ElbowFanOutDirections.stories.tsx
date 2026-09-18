// src/stories/ElbowFanOutDirections.stories.tsx — the third leg of the
// direction sweep Zach asked for, verbatim: "test all directions of
// possible edges as well. each port could potentially have 4 output
// directions... I also want to see top to bottom." The first two legs
// (`ElbowDirectionMatrix.stories.tsx`'s from/to matrix, and a peer's
// bundle-axis galleries) both hold the wire COUNT at one; this file varies
// it instead, at all four `TraceDir` values, for the three shapes a single
// direction pair cannot show:
//
//   FanOutPerDirection       one source -> three sinks. Cables legitimately
//                            SHARE their first leg out of a port — this is
//                            not the bundle-crossing defect a peer's file is
//                            checking for, it is the correct, expected shape
//                            of fan-out.
//   FanInPerDirection        the mirror: three sources -> one sink. Cables
//                            converge instead of diverging — not the same
//                            geometry problem, despite looking similar.
//   ObstaclePerDirection     one cable, one wall between source and sink,
//                            at each of the four flow directions.
//   EndpointBoxesPerDirection source and sink each mounted on a real card
//                            (`fromBox`/`toBox`) rather than floating in
//                            space — the case where the router's
//                            first/last-leg-may-cross-its-own-card rule
//                            actually matters.
//
// Built on `elbowDirections.fixture.tsx`'s shared harness (`routeStart`,
// `routeEnd`, `measureRoute`, `DirectionCell`, `Gallery`) for the first three
// galleries, all of which fit `DirectionCell`'s existing `obstacles` prop.
// `EndpointBoxesPerDirection` needs `fromBox`/`toBox`, which `DirectionCell`
// does not take — extending it would touch a peer's `ElbowBundleAxes.stories`
// import and the frozen exports the CLAUDE.md task called out, so this file
// builds its own `BoxDirectionCell` sibling instead, reusing the fixture's
// `routeStart`/`routeEnd`/`measureRoute` and the same underlying
// `routeElbow`/`elbowPath` calls `DirectionCell` itself makes internally
// (`elbowDirections.fixture.tsx`).
//
// Every route is produced by the SAME `routeElbow` call every other routing
// story in this repo exercises. Nothing here re-derives geometry. Every play
// function's spatial claims are measured off the RENDERED `SVGPathElement`
// (`getPointAtLength`) — reproducing `ElbowDirectionMatrix.stories.tsx`'s own
// idiom of keeping a local copy rather than sharing one — never off
// `window.__STORYBOOK_PREVIEW__...reportedException` (not a real property;
// see CLAUDE.md) and never off a number typed in without having measured it
// first.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DIR_VECTOR, OPPOSITE_DIR, TRACE_DIRS, type Point, type TraceDir, type TraceTerminalSpec } from "../components/trace.layout";
import { DEFAULT_ELBOW_OPTIONS, elbowPath, routeElbow, type ElbowRect, type ElbowRoute } from "../components/elbow/index";
import { elbowInputFromTerminals, routePoints } from "../components/elbow/traceContract";
import { TraceBody } from "../components/trace";
import { TraceTerminal } from "../components/traceTerminal";
import {
  DirectionCell,
  Gallery,
  measureRoute,
  routeEnd,
  routeStart,
  sharedFrameSize,
  type RouteMeasurement,
} from "./elbowDirections.fixture";

/* ------------------------------------------------------------------ */
/* The ruler, pinned — same reasoning as every sibling file in this sweep:  */
/* a literal, not `DEFAULT_ELBOW_OPTIONS.x`, so an upstream change fails    */
/* loudly here instead of silently moving every tolerance along with it.    */
/* ------------------------------------------------------------------ */

const PADDING_PX = 24;
const CORNER_RADIUS_PX = 8;

function assertRulerUnchanged() {
  if (DEFAULT_ELBOW_OPTIONS.padding !== PADDING_PX) {
    throw new Error(`router padding is now ${DEFAULT_ELBOW_OPTIONS.padding}, not ${PADDING_PX}`);
  }
  if (DEFAULT_ELBOW_OPTIONS.cornerRadius !== CORNER_RADIUS_PX) {
    throw new Error(`corner radius is now ${DEFAULT_ELBOW_OPTIONS.cornerRadius}, not ${CORNER_RADIUS_PX}`);
  }
}

/* ------------------------------------------------------------------ */
/* Measurement off the RENDERED path — reproduced from                      */
/* `ElbowDirectionMatrix.stories.tsx` rather than imported (it exports      */
/* nothing; that file's own comment says every routing story keeps its own  */
/* copy of this rather than sharing one).                                   */
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

const AXIS_SIN = Math.sin((2 * Math.PI) / 180);

interface ArcStats {
  total: number;
  axisLength: number;
  longestOffAxisRun: number;
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
  return { total, axisLength, longestOffAxisRun, bends: Math.max(cornerArcs, flips) };
}

function angleBetweenDeg(a: Point, b: Point): number {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

const TANGENT_CHORD_PX = 3;

function departureDirection(path: SVGPathElement): Point {
  const total = path.getTotalLength();
  const forward = Math.min(TANGENT_CHORD_PX, total / 4);
  const a = path.getPointAtLength(0);
  const b = path.getPointAtLength(forward);
  return { x: b.x - a.x, y: b.y - a.y };
}

function arrivalDirection(path: SVGPathElement): Point {
  const total = path.getTotalLength();
  const back = Math.min(TANGENT_CHORD_PX, total / 4);
  const a = path.getPointAtLength(total - back);
  const b = path.getPointAtLength(total);
  return { x: b.x - a.x, y: b.y - a.y };
}

function parseCaptionBends(cell: ParentNode): number {
  const text = requireEl(cell, '[data-slot="cell-measurement"]').textContent ?? "";
  const match = /^(\d+)\s+bends?/.exec(text.trim());
  if (!match) throw new Error(`could not parse bend count from caption: "${text}"`);
  return Number(match[1]);
}

const CORNER_ARC_BUDGET = (Math.PI / 2) * CORNER_RADIUS_PX + 1;

/**
 * Every check one cell owes, shared by all four galleries: axis-alignment,
 * endpoints in the terminal gap, arrival/departure honoring `to.dir`/
 * `from.dir`, and the caption's bend count matching a genuinely independent
 * count taken off the rendered path.
 */
async function assertCell(
  canvasElement: HTMLElement,
  testKey: string,
  from: TraceTerminalSpec,
  to: TraceTerminalSpec,
  expectedBends: number,
): Promise<SVGPathElement> {
  const cell = requireEl<HTMLElement>(canvasElement, `[data-testid="cell-${testKey}"]`);
  const svg = requireEl<SVGSVGElement>(cell, `[data-testid="canvas-${testKey}"]`);
  const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
  const points = samplePath(line);
  const stats = arcStats(points);

  await expect(
    stats.longestOffAxisRun,
    `${testKey}: a ${stats.longestOffAxisRun.toFixed(1)}px non-axis-aligned run`,
  ).toBeLessThanOrEqual(CORNER_ARC_BUDGET);
  const offAxisLength = stats.total - stats.axisLength;
  const maxOffAxisLength = Math.max(1, stats.bends) * CORNER_ARC_BUDGET;
  await expect(
    offAxisLength,
    `${testKey}: ${offAxisLength.toFixed(1)}px off-axis across ${stats.bends} bends`,
  ).toBeLessThanOrEqual(maxOffAxisLength);

  const expectedStart = routeStart(from);
  const expectedEnd = routeEnd(to);
  const head = points[0];
  const tail = points[points.length - 1];
  await expect(Math.hypot(head.x - expectedStart.x, head.y - expectedStart.y), `${testKey}: start point`).toBeLessThan(1);
  await expect(Math.hypot(tail.x - expectedEnd.x, tail.y - expectedEnd.y), `${testKey}: end point`).toBeLessThan(1);

  await expect(
    angleBetweenDeg(departureDirection(line), DIR_VECTOR[from.dir]),
    `${testKey}: departs off from.dir "${from.dir}"`,
  ).toBeLessThan(5);
  await expect(
    angleBetweenDeg(arrivalDirection(line), DIR_VECTOR[to.dir]),
    `${testKey}: arrives off to.dir "${to.dir}"`,
  ).toBeLessThan(5);

  const captionBends = parseCaptionBends(cell);
  await expect(captionBends, `${testKey}: caption bends vs rendered path`).toBe(stats.bends);
  await expect(stats.bends, `${testKey}: measured ${stats.bends} bends, expected ${expectedBends}`).toBe(expectedBends);

  return line;
}

/** No sampled point of the rendered line comes within `minDistance` of
 * `rect`'s own boundary (not its padded keep-out — the raw card) — the
 * falsifiable form of "no segment may re-enter the card" for the two
 * galleries that pass obstacles/boxes. */
async function assertClearsRect(line: SVGPathElement, rect: ElbowRect, minDistance: number, label: string) {
  const points = samplePath(line);
  let closest = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.w));
    const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.h));
    closest = Math.min(closest, Math.hypot(dx, dy));
  }
  await expect(closest, `${label}: drawn line comes within ${closest.toFixed(2)}px of ${JSON.stringify(rect)}`).toBeGreaterThanOrEqual(
    minDistance,
  );
}

/* ------------------------------------------------------------------ */
/* Cross-axis direction helpers                                             */
/* ------------------------------------------------------------------ */

function perpVector(dir: TraceDir): Point {
  const v = DIR_VECTOR[dir];
  return { x: -v.y, y: v.x };
}

/* ------------------------------------------------------------------ */

const meta: Meta = {
  title: "Trace/Elbow Fan-Out & Obstacles",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* 1. FanOutPerDirection — one source, three sinks, all four dirs          */
/* ------------------------------------------------------------------ */

/**
 * Every sink continues in the SAME direction the source leaves in — the
 * ordinary "output fans out to three inputs stacked along the perpendicular
 * axis" shape, not the awkward "target behind the source" tangent the
 * direction matrix already covers. Distance and spread are fixed so all
 * four rotations are the exact same shape, turned 90° at a time.
 */
const FANOUT_DISTANCE = 220;
const FANOUT_SPREAD = 90;
const FANOUT_OFFSETS = [-FANOUT_SPREAD, 0, FANOUT_SPREAD] as const;

/** Measured via the probe below (see the task report): the centered sink
 * lies exactly on the source's own heading, so the wire runs straight —
 * 0 bends. Either side of it costs one perpendicular jog and one jog back:
 * 2 bends, and correspondingly longer than the straight run. Identical for
 * all four `TraceDir` values — confirmed by measurement, not assumed. */
const FANOUT_EXPECTED: Record<number, { bends: number; length: number }> = {
  [-FANOUT_SPREAD]: { bends: 2, length: 278 },
  0: { bends: 0, length: 188 },
  [FANOUT_SPREAD]: { bends: 2, length: 278 },
};

function fanoutScene(dir: TraceDir, offset: number): { from: TraceTerminalSpec; to: TraceTerminalSpec } {
  const from: TraceTerminalSpec = { x: 200, y: 200, dir };
  const vec = DIR_VECTOR[dir];
  const perp = perpVector(dir);
  const base = { x: from.x + vec.x * FANOUT_DISTANCE, y: from.y + vec.y * FANOUT_DISTANCE };
  const to: TraceTerminalSpec = { x: base.x + perp.x * offset, y: base.y + perp.y * offset, dir };
  return { from, to };
}

/** Every scene this gallery renders, up front — `sharedFrameSize` needs the
 * whole set before any one cell can pick its frame. This is the gallery the
 * bug was found in: the centre (0-bend, 188px) cell's tiny autofit bounds
 * were being magnified to fill its box while the flanking 2-bend cells got
 * shrunk — backwards from the "compare bend counts without correcting for
 * scale" promise `BuildElbowSceneOptions.distance` makes. */
function fanOutScenes() {
  return TRACE_DIRS.flatMap((dir) => FANOUT_OFFSETS.map((offset) => fanoutScene(dir, offset)));
}

export const FanOutPerDirection: Story = {
  render: () => {
    const frameSize = sharedFrameSize(fanOutScenes());
    return (
      <Gallery
        title="One source, three sinks — every from.dir"
        description={
          <>
            Fan-out is the case where cables LEGITIMATELY share their first leg out of the port — this is the correct
            shape, not the bundle-crossing defect a sibling gallery is checking for. The centre sink sits directly on
            the source's own heading (0 bends); the two flanking sinks each cost one jog out and one jog back (2
            bends). The <code>bottom</code> row is the one nobody had looked at before this sweep.
          </>
        }
      >
        {TRACE_DIRS.map((dir) => (
          <div key={dir} style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", margin: "4px 0" }}>
              from.dir “{dir}”
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {FANOUT_OFFSETS.map((offset) => {
                const scene = fanoutScene(dir, offset);
                const key = `fanout-${dir}-${offset}`;
                return (
                  <DirectionCell
                    key={key}
                    testKey={key}
                    label={`${dir}, offset ${offset}px`}
                    from={scene.from}
                    to={scene.to}
                    frameSize={frameSize}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(TRACE_DIRS.length * FANOUT_OFFSETS.length);

    for (const dir of TRACE_DIRS) {
      const froms = new Set<string>();
      for (const offset of FANOUT_OFFSETS) {
        const scene = fanoutScene(dir, offset);
        const key = `fanout-${dir}-${offset}`;
        const expected = FANOUT_EXPECTED[offset];
        await assertCell(canvasElement, key, scene.from, scene.to, expected.bends);
        const measurement: RouteMeasurement = measureRoute(
          routeElbow(elbowInputFromTerminals({ from: routeStart(scene.from), to: routeEnd(scene.to) })),
        );
        await expect(Math.round(measurement.manhattanLength), `${key}: manhattan length`).toBe(expected.length);
        froms.add(`${scene.from.x},${scene.from.y}`);
      }
      // The whole point of "fan-out": every sink for this direction shares
      // the identical source point — one port, three cables.
      await expect(froms.size, `dir "${dir}": all three sinks share one source point`).toBe(1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 2. FanInPerDirection — three sources, one sink, all four dirs           */
/* ------------------------------------------------------------------ */

/** The mirror of fan-out: convergence, not divergence. Same distances and
 * offsets, same measured numbers (confirmed below) — but it is a distinct
 * geometry problem (three cables merging into one keep-out-free approach),
 * worth seeing on its own rather than assumed identical from the fan-out
 * gallery. */
const FANIN_EXPECTED = FANOUT_EXPECTED;

function faninScene(dir: TraceDir, offset: number): { from: TraceTerminalSpec; to: TraceTerminalSpec } {
  const to: TraceTerminalSpec = { x: 500, y: 320, dir };
  const vec = DIR_VECTOR[dir];
  const perp = perpVector(dir);
  const base = { x: to.x - vec.x * FANOUT_DISTANCE, y: to.y - vec.y * FANOUT_DISTANCE };
  const from: TraceTerminalSpec = { x: base.x + perp.x * offset, y: base.y + perp.y * offset, dir };
  return { from, to };
}

function fanInScenes() {
  return TRACE_DIRS.flatMap((dir) => FANOUT_OFFSETS.map((offset) => faninScene(dir, offset)));
}

export const FanInPerDirection: Story = {
  render: () => {
    const frameSize = sharedFrameSize(fanInScenes());
    return (
      <Gallery
        title="Three sources, one sink — every to.dir"
        description={
          <>
            The mirror of fan-out. Convergence is not the same geometry problem as divergence — three cables merge
            instead of splitting — so it is measured separately rather than assumed symmetric with the gallery above.
          </>
        }
      >
        {TRACE_DIRS.map((dir) => (
          <div key={dir} style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", margin: "4px 0" }}>
              to.dir “{dir}”
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {FANOUT_OFFSETS.map((offset) => {
                const scene = faninScene(dir, offset);
                const key = `fanin-${dir}-${offset}`;
                return (
                  <DirectionCell
                    key={key}
                    testKey={key}
                    label={`${dir}, offset ${offset}px`}
                    from={scene.from}
                    to={scene.to}
                    frameSize={frameSize}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(TRACE_DIRS.length * FANOUT_OFFSETS.length);

    for (const dir of TRACE_DIRS) {
      const tos = new Set<string>();
      for (const offset of FANOUT_OFFSETS) {
        const scene = faninScene(dir, offset);
        const key = `fanin-${dir}-${offset}`;
        const expected = FANIN_EXPECTED[offset];
        await assertCell(canvasElement, key, scene.from, scene.to, expected.bends);
        const measurement = measureRoute(
          routeElbow(elbowInputFromTerminals({ from: routeStart(scene.from), to: routeEnd(scene.to) })),
        );
        await expect(Math.round(measurement.manhattanLength), `${key}: manhattan length`).toBe(expected.length);
        tos.add(`${scene.to.x},${scene.to.y}`);
      }
      await expect(tos.size, `dir "${dir}": all three sources share one sink point`).toBe(1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3. ObstaclePerDirection — a wall between source and sink                */
/* ------------------------------------------------------------------ */

const OBSTACLE_DISTANCE = 220;
/** A rectangle straddling the direct line's own axis. Because it sits ON
 * the line, going around it always costs the same shape (out, across,
 * back, in — 4 bends: the wire must return to its original axis to arrive
 * on `to.dir`), regardless of the wall's span across the corridor. What the
 * span DOES change is how far the detour has to travel — the second
 * ("wide") case below is the one the task asked for explicitly: "tight
 * enough to force a multi-bend detour." Both are already multi-bend (4);
 * the wide one is the one worth a second look because it is dramatically
 * longer for the identical bend count, not because it bends more. */
const OBSTACLE_NARROW_SPAN = 40;
const OBSTACLE_WIDE_SPAN = 400;
const OBSTACLE_EXPECTED: Record<string, { bends: number; length: number }> = {
  narrow: { bends: 4, length: 276 },
  wide: { bends: 4, length: 636 },
};

function obstacleWall(dir: TraceDir, span: number): ElbowRect {
  const from: TraceTerminalSpec = { x: 200, y: 200, dir };
  const vec = DIR_VECTOR[dir];
  const to = { x: from.x + vec.x * OBSTACLE_DISTANCE, y: from.y + vec.y * OBSTACLE_DISTANCE };
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const isHoriz = vec.x !== 0;
  return isHoriz
    ? { x: mid.x - 6, y: mid.y - span / 2, w: 12, h: span }
    : { x: mid.x - span / 2, y: mid.y - 6, w: span, h: 12 };
}

function obstacleScene(dir: TraceDir): { from: TraceTerminalSpec; to: TraceTerminalSpec } {
  const from: TraceTerminalSpec = { x: 200, y: 200, dir };
  const vec = DIR_VECTOR[dir];
  const to: TraceTerminalSpec = { x: from.x + vec.x * OBSTACLE_DISTANCE, y: from.y + vec.y * OBSTACLE_DISTANCE, dir };
  return { from, to };
}

/** Both spans, every direction — one shared frame across narrow AND wide
 * walls means the wide wall's dramatically longer detour reads as visibly
 * bigger at the SAME scale, rather than each getting cropped to its own
 * size and looking deceptively similar. */
function obstacleScenes() {
  return TRACE_DIRS.flatMap((dir) => {
    const scene = obstacleScene(dir);
    return [
      { from: scene.from, to: scene.to, obstacles: [obstacleWall(dir, OBSTACLE_NARROW_SPAN)] },
      { from: scene.from, to: scene.to, obstacles: [obstacleWall(dir, OBSTACLE_WIDE_SPAN)] },
    ];
  });
}

export const ObstaclePerDirection: Story = {
  render: () => {
    const frameSize = sharedFrameSize(obstacleScenes());
    return (
      <Gallery
        title="A wall between source and sink — every flow direction"
        description={
          <>
            Same source, same sink, same distance every time — only the flow direction and the wall's own span
            change. Both walls sit ON the direct line, so the detour shape (out, across, back, in) is identical
            either way; the wide wall is the "tight enough to force a real detour" case — same 4 bends as the narrow
            one, more than double the length.
          </>
        }
      >
        {TRACE_DIRS.map((dir) => {
          const scene = obstacleScene(dir);
          return (
            <div key={dir} style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", margin: "4px 0" }}>
                dir “{dir}”
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <DirectionCell
                  testKey={`obstacle-narrow-${dir}`}
                  label={`${dir}, narrow wall (${OBSTACLE_NARROW_SPAN}px)`}
                  from={scene.from}
                  to={scene.to}
                  obstacles={[obstacleWall(dir, OBSTACLE_NARROW_SPAN)]}
                  frameSize={frameSize}
                />
                <DirectionCell
                  testKey={`obstacle-wide-${dir}`}
                  label={`${dir}, wide wall (${OBSTACLE_WIDE_SPAN}px)`}
                  from={scene.from}
                  to={scene.to}
                  obstacles={[obstacleWall(dir, OBSTACLE_WIDE_SPAN)]}
                  awkward
                  frameSize={frameSize}
                />
              </div>
            </div>
          );
        })}
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(TRACE_DIRS.length * 2);

    for (const dir of TRACE_DIRS) {
      const scene = obstacleScene(dir);
      for (const [variant, span] of [
        ["narrow", OBSTACLE_NARROW_SPAN],
        ["wide", OBSTACLE_WIDE_SPAN],
      ] as const) {
        const key = `obstacle-${variant}-${dir}`;
        const expected = OBSTACLE_EXPECTED[variant];
        const line = await assertCell(canvasElement, key, scene.from, scene.to, expected.bends);
        const wall = obstacleWall(dir, span);
        const measurement = measureRoute(
          routeElbow(elbowInputFromTerminals({ from: routeStart(scene.from), to: routeEnd(scene.to), obstacles: [wall] })),
        );
        await expect(Math.round(measurement.manhattanLength), `${key}: manhattan length`).toBe(expected.length);
        // The rendered line clears the RAW wall by at least the router's own
        // padding, minus one corner's worth of rounding cut — same floor
        // `ElbowDirectionMatrix.stories.tsx`'s TopToBottom detour case uses.
        await assertClearsRect(line, wall, 12, key);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 4. EndpointBoxesPerDirection — real card boxes on both ends              */
/* ------------------------------------------------------------------ */

/**
 * `DirectionCell` has no `fromBox`/`toBox` prop (`elbowDirections.fixture`
 * is a frozen surface — see this file's header), so this gallery renders its
 * own cell. It reuses everything else from the fixture (`routeStart`,
 * `routeEnd`, `measureRoute`) and calls the exact same `routeElbow`/
 * `elbowPath` pair `DirectionCell` calls internally.
 */
const CARD_DEPTH = 100;
const CARD_SPAN = 70;

/**
 * The card is on the CLOSED side of a port — the side opposite the router's
 * own `side(...)` (the free/open direction `traceSideOf` derives). For a
 * `from` port that is `-DIR_VECTOR[dir]` (the wire leaves AWAY from its own
 * card). For a `to` port it is `+DIR_VECTOR[dir]`: the wire arrives
 * TRAVELLING `to.dir` (`side(to) = OPPOSITE_DIR[to.dir]`, the frozen rule in
 * `trace.layout.ts`), so after reaching the terminal it keeps moving in that
 * same direction INTO the card. Getting this backwards (an earlier pass at
 * this file did) puts the sink's own card between the wire and open space
 * instead of behind the terminal, which manufactures a fake obstacle that
 * has nothing to do with the real endpoint-box rule this gallery exists to
 * show.
 */
function cardBehind(terminal: TraceTerminalSpec, role: "from" | "to"): ElbowRect {
  const raw = DIR_VECTOR[terminal.dir];
  const vec = role === "from" ? { x: -raw.x, y: -raw.y } : raw;
  if (vec.x !== 0) {
    const x = vec.x > 0 ? terminal.x : terminal.x - CARD_DEPTH;
    return { x, y: terminal.y - CARD_SPAN / 2, w: CARD_DEPTH, h: CARD_SPAN };
  }
  const y = vec.y > 0 ? terminal.y : terminal.y - CARD_DEPTH;
  return { x: terminal.x - CARD_SPAN / 2, y, w: CARD_SPAN, h: CARD_DEPTH };
}

function Card({ rect }: { rect: ElbowRect }) {
  const pad = DEFAULT_ELBOW_OPTIONS.padding;
  return (
    <g data-slot="elbow-endpoint-card">
      <rect
        x={rect.x - pad}
        y={rect.y - pad}
        width={rect.w + pad * 2}
        height={rect.h + pad * 2}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.3}
        strokeDasharray="4 4"
        rx={6}
      />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="var(--card)" stroke="var(--border)" rx={6} />
    </g>
  );
}

function boxViewBoxFor(route: ElbowRoute, extra: readonly Point[], boxes: readonly ElbowRect[]): string {
  const pad = DEFAULT_ELBOW_OPTIONS.padding + 26;
  const xs = [...route.points.map((p) => p.x), ...extra.map((p) => p.x)];
  const ys = [...route.points.map((p) => p.y), ...extra.map((p) => p.y)];
  for (const rect of boxes) {
    xs.push(rect.x - pad, rect.x + rect.w + pad);
    ys.push(rect.y - pad, rect.y + rect.h + pad);
  }
  const minX = Math.min(...xs) - 6;
  const minY = Math.min(...ys) - 6;
  return `${minX} ${minY} ${Math.max(...xs) + 6 - minX} ${Math.max(...ys) + 6 - minY}`;
}

interface BoxDirectionCellProps {
  testKey: string;
  label: string;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  fromBox: ElbowRect;
  toBox: ElbowRect;
  note?: string;
}

function BoxDirectionCell({ testKey, label, from, to, fromBox, toBox, note }: BoxDirectionCellProps) {
  const request = { from: routeStart(from), to: routeEnd(to), fromBox, toBox };
  const route = routeElbow(elbowInputFromTerminals(request));
  const path = elbowPath(route);
  const measurement = measureRoute(route);
  const viewBox = boxViewBoxFor(route, [from, to], [fromBox, toBox]);
  const [, , vw, vh] = viewBox.split(" ").map(Number);

  return (
    <figure
      data-testid={`cell-${testKey}`}
      data-slot="direction-cell"
      style={{ margin: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", overflow: "hidden" }}
    >
      <figcaption style={{ padding: "8px 10px 4px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}>{label}</div>
        <div
          data-slot="cell-measurement"
          style={{
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color: measurement.orthogonal ? "var(--muted-foreground)" : "var(--destructive, #b91c1c)",
          }}
        >
          {measurement.bends} bend{measurement.bends === 1 ? "" : "s"} · {Math.round(measurement.manhattanLength)}px
          {measurement.orthogonal ? "" : " · NOT orthogonal"}
        </div>
        {note ? (
          <div data-slot="cell-note" style={{ fontSize: 10.5, color: "var(--muted-foreground)", lineHeight: 1.3 }}>
            {note}
          </div>
        ) : null}
      </figcaption>
      <svg
        data-slot="direction-canvas"
        data-testid={`canvas-${testKey}`}
        viewBox={viewBox}
        width="100%"
        style={{ display: "block", aspectRatio: `${vw} / ${vh}` }}
      >
        <Card rect={fromBox} />
        <Card rect={toBox} />
        <TraceBody id={`trace-${testKey}`} path={path} points={routePoints(route)} />
        <TraceTerminal {...from} />
        <TraceTerminal {...to} />
      </svg>
    </figure>
  );
}

/** Comfortable gap: cards do not overlap, and the sink's own card still
 * intrudes on part of the corridor a naive straight line would have used
 * (the port faces the flow, but the wire must approach it FROM the side the
 * card leaves open, per `traceSideOf`). Same shape for all four axes. */
const ENDPOINT_NORMAL_DISTANCE = 260;
/** Tight gap: the sink's card comes close enough to the source that the
 * detour has to hug the card's PADDED boundary exactly — the scenario the
 * task's "one thing worth knowing" points at. Measured, not assumed: see
 * the play function and the report's numbers. */
const ENDPOINT_TIGHT_DISTANCE = 150;

const ENDPOINT_EXPECTED: Record<string, { bends: number; length: number }> = {
  normal: { bends: 4, length: 394 },
  tight: { bends: 4, length: 284 },
};

function endpointBoxScene(
  dir: TraceDir,
  distance: number,
): { from: TraceTerminalSpec; to: TraceTerminalSpec; fromBox: ElbowRect; toBox: ElbowRect } {
  const from: TraceTerminalSpec = { x: 300, y: 300, dir };
  const vec = DIR_VECTOR[dir];
  const sinkDir = OPPOSITE_DIR[dir];
  const to: TraceTerminalSpec = { x: from.x + vec.x * distance, y: from.y + vec.y * distance, dir: sinkDir };
  return { from, to, fromBox: cardBehind(from, "from"), toBox: cardBehind(to, "to") };
}

/** No sampled point of the rendered line enters `rect` itself (the RAW
 * card, not its padding) more than `allowedSegments` times — the
 * falsifiable form of "the first/last leg may cross its own card, no later
 * segment may re-enter it." A crossing is counted by a sign change in
 * "inside vs outside" along the sampled polyline. */
function countCardCrossings(points: readonly Point[], rect: ElbowRect): number {
  const inside = (p: Point) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
  let crossings = 0;
  let wasInside = inside(points[0]);
  for (let i = 1; i < points.length; i += 1) {
    const nowInside = inside(points[i]);
    if (nowInside !== wasInside) crossings += 1;
    wasInside = nowInside;
  }
  return crossings;
}

export const EndpointBoxesPerDirection: Story = {
  render: () => (
    <Gallery
      title="Source and sink each mounted on a real card — every direction"
      description={
        <>
          The router's endpoint-box rule: the first and last leg may cross their OWN card while leaving through the
          port, but no later segment may re-enter it. At a comfortable gap that rule is nearly invisible; at a tight
          gap the route hugs the sink's own PADDED boundary rather than clipping through it — see the report for the
          measured reason.
        </>
      }
    >
      {TRACE_DIRS.map((dir) => (
        <div key={dir} style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", margin: "4px 0" }}>
            from.dir “{dir}” → to.dir “{OPPOSITE_DIR[dir]}”
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {(
              [
                ["normal", ENDPOINT_NORMAL_DISTANCE, "comfortable gap"],
                ["tight", ENDPOINT_TIGHT_DISTANCE, "tight gap — hugs the sink card's padding"],
              ] as const
            ).map(([variant, distance, noteText]) => {
              const scene = endpointBoxScene(dir, distance);
              const key = `endpointbox-${variant}-${dir}`;
              return (
                <BoxDirectionCell
                  key={key}
                  testKey={key}
                  label={`${dir}, ${variant} (${distance}px)`}
                  from={scene.from}
                  to={scene.to}
                  fromBox={scene.fromBox}
                  toBox={scene.toBox}
                  note={noteText}
                />
              );
            })}
          </div>
        </div>
      ))}
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(TRACE_DIRS.length * 2);

    for (const dir of TRACE_DIRS) {
      for (const [variant, distance] of [
        ["normal", ENDPOINT_NORMAL_DISTANCE],
        ["tight", ENDPOINT_TIGHT_DISTANCE],
      ] as const) {
        const scene = endpointBoxScene(dir, distance);
        const key = `endpointbox-${variant}-${dir}`;
        const expected = ENDPOINT_EXPECTED[variant];
        const line = await assertCell(canvasElement, key, scene.from, scene.to, expected.bends);

        const route = routeElbow(
          elbowInputFromTerminals({ from: routeStart(scene.from), to: routeEnd(scene.to), fromBox: scene.fromBox, toBox: scene.toBox }),
        );
        const measurement = measureRoute(route);
        await expect(Math.round(measurement.manhattanLength), `${key}: manhattan length`).toBe(expected.length);

        // The endpoint-box rule itself, checked on the route's own points
        // (cheap, exact rectangle membership) rather than the rendered
        // path's rounded corners: at most one crossing of each card — the
        // single first/last leg the router is allowed to cross through.
        const fromCrossings = countCardCrossings(route.points, scene.fromBox);
        const toCrossings = countCardCrossings(route.points, scene.toBox);
        await expect(fromCrossings, `${key}: source card crossed more than its own exit leg`).toBeLessThanOrEqual(1);
        await expect(toCrossings, `${key}: sink card crossed more than its own entry leg`).toBeLessThanOrEqual(1);

        // The rendered line clears each RAW card by at least a hair — never
        // draws directly along a card edge it isn't supposed to touch.
        await assertClearsRect(line, scene.fromBox, 0, `${key} (from card)`);
        await assertClearsRect(line, scene.toBox, 0, `${key} (to card)`);
      }
    }

    // The tight case really did cost more care than a plain hop would need:
    // it is not simply the normal case's route with a shorter final leg —
    // the manhattan length ordering flips relative to the source/sink
    // distance because the detour's fixed shape dominates at close range.
    await expect(ENDPOINT_EXPECTED.tight.length).toBeLessThan(ENDPOINT_EXPECTED.normal.length);
  },
};
