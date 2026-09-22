// src/components/elbow/ElbowDirectionMatrix.stories.tsx — the direction sweep Zach
// asked for, verbatim: "test all directions of possible edges as well. each
// port could potentially have 4 output directions... I also want to see top
// to bottom." Measured before this file existed: across the four existing
// routing story files, `dir:"right"` appears 9 times, `side:"right"` 4 more,
// `side:"left"` 4 — against `dir:"top"` and `dir:"left"` ONCE each. Left and
// vertical flow were, in practice, untested.
//
// Three galleries, built on `elbowDirections.fixture.tsx`'s shared harness:
//
//   AllSidePairs    the full 4x4 `from.dir` x `to.dir` matrix, placement held
//                   fixed so direction is the only variable.
//   PlacementSweep  one representative direction pair, the sink swept
//                   through all 8 relative placements around the source.
//   TopToBottom     the case Zach named directly: vertical flow, several
//                   gaps, one tight enough that an obstacle forces a
//                   genuine detour.
//
// Every route is drawn by the SAME `routeElbow` call `TraceElbow.stories.tsx`
// exercises. Nothing here re-derives geometry. Every spatial claim in the
// play functions below is measured off the RENDERED `SVGPathElement`
// (`getPointAtLength`) — never off route data, and never off "the element
// exists" (`window.__STORYBOOK_PREVIEW__...reportedException` is not a real
// property; see CLAUDE.md).
//
// Awkward cells (a source leaving away from its target, a sink facing away
// from its source) are RENDERED, never omitted — `TraceRouting.stories.tsx`'s
// `data-supported="false"` idiom, reused here as `data-awkward="true"`. The
// difference: `elbow` is not blind to these tangents the way `straight` and
// `slanted` are, so an awkward cell is not "wrong" — it is just where the
// router does the most visible work, which the bend count says plainly.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DIR_VECTOR, TRACE_DIRS, type Point, type TraceDir, type TraceTerminalSpec } from "../trace.layout";
import { DEFAULT_ELBOW_OPTIONS, type ElbowRect } from "./index";
import {
  DirectionCell,
  Gallery,
  PLACEMENTS,
  PLACEMENT_LABEL,
  buildElbowScene,
  routeEnd,
  routeStart,
  sharedFrameSize,
  type Placement,
} from "./elbowDirections.fixture";

/* ------------------------------------------------------------------ */
/* The ruler, pinned — same values and same reasoning as                */
/* `TraceElbow.stories.tsx`: a LITERAL, not `DEFAULT_ELBOW_OPTIONS.x`, so a  */
/* deliberate change upstream fails loudly here instead of silently moving  */
/* every tolerance in this file along with it.                              */
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
/* Measurement — off the RENDERED path, independent of the caption's own    */
/* `measureRoute` (which reads route.points). Reproduced per-file, matching */
/* this repo's own idiom (TraceElbow.stories.tsx, TraceRouting.stories.tsx  */
/* each keep their own copies rather than sharing one).                     */
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

/** The tangent measured over a short real chord at each end of the
 * rendered path — same idea as `TraceRouting.stories.tsx`'s
 * `departureDirection`/`arrivalDirection`. */
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

/** Parse the integer bend count off the cell's own caption text (e.g. "3
 * bends · 252px"), so the play function reads what a VIEWER reads —
 * never the `measureRoute` object that produced it. */
function parseCaptionBends(cell: ParentNode): number {
  const text = requireEl(cell, '[data-slot="cell-measurement"]').textContent ?? "";
  const match = /^(\d+)\s+bends?/.exec(text.trim());
  if (!match) throw new Error(`could not parse bend count from caption: "${text}"`);
  return Number(match[1]);
}

/**
 * Every check one direction-cell owes: axis-alignment, endpoints in the
 * terminal gap, arrival/departure honoring `to.dir`/`from.dir`, and the
 * caption's bend count matching a genuinely independent count taken off
 * the rendered path — not off the route data the caption itself reads.
 */
async function assertCell(
  canvasElement: HTMLElement,
  testKey: string,
  from: TraceTerminalSpec,
  to: TraceTerminalSpec,
  expectedBends: number,
): Promise<void> {
  const cell = requireEl<HTMLElement>(canvasElement, `[data-testid="cell-${testKey}"]`);
  const svg = requireEl<SVGSVGElement>(cell, `[data-testid="canvas-${testKey}"]`);
  const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
  const points = samplePath(line);
  const stats = arcStats(points);

  // 1. Every segment is axis-aligned, up to one corner arc's worth of
  //    rounding per bend — the same falsifiable form `TraceElbow.stories.tsx`
  //    uses for a SINGLE corner, aggregated here because a route with many
  //    short segments (several of this sweep's cells are 2-4 bends over
  //    only ~150-300px) legitimately spends a bigger SHARE of its own
  //    length on rounding than the longer 300-400px fixtures in that file
  //    do — a flat ratio threshold copied from there would fail routes
  //    that are honestly fine. Total off-axis length is bounded by
  //    (bend count × one quarter-circle arc), which a real diagonal
  //    segment blows past by definition; a merely short route does not.
  const cornerArcBudget = (Math.PI / 2) * CORNER_RADIUS_PX + 1;
  await expect(
    stats.longestOffAxisRun,
    `${testKey}: a ${stats.longestOffAxisRun.toFixed(1)}px non-axis-aligned run`,
  ).toBeLessThanOrEqual(cornerArcBudget);
  const offAxisLength = stats.total - stats.axisLength;
  const maxOffAxisLength = Math.max(1, stats.bends) * cornerArcBudget;
  await expect(
    offAxisLength,
    `${testKey}: ${offAxisLength.toFixed(1)}px off-axis across ${stats.bends} bends, more than ${maxOffAxisLength.toFixed(1)}px of corner rounding can explain`,
  ).toBeLessThanOrEqual(maxOffAxisLength);

  // 2. Starts at the source terminal, ends at the sink terminal.
  const expectedStart = routeStart(from);
  const expectedEnd = routeEnd(to);
  const head = points[0];
  const tail = points[points.length - 1];
  await expect(Math.hypot(head.x - expectedStart.x, head.y - expectedStart.y), `${testKey}: start point`).toBeLessThan(
    1,
  );
  await expect(Math.hypot(tail.x - expectedEnd.x, tail.y - expectedEnd.y), `${testKey}: end point`).toBeLessThan(1);

  // 3. Leaves along from.dir, arrives along to.dir — the whole reason this
  //    sweep exists is to prove this holds for all 16 combinations, not
  //    just the well-worn left-to-right one.
  await expect(
    angleBetweenDeg(departureDirection(line), DIR_VECTOR[from.dir]),
    `${testKey}: departs off from.dir "${from.dir}"`,
  ).toBeLessThan(5);
  await expect(
    angleBetweenDeg(arrivalDirection(line), DIR_VECTOR[to.dir]),
    `${testKey}: arrives off to.dir "${to.dir}"`,
  ).toBeLessThan(5);

  // 4. The bend count is what it claims to be — TWICE independently: once
  //    read off the caption text a viewer actually sees, once counted
  //    directly from the rendered path's own geometry. Neither reads the
  //    route object the other one was built from.
  const captionBends = parseCaptionBends(cell);
  await expect(captionBends, `${testKey}: caption bends vs rendered path`).toBe(stats.bends);
  await expect(stats.bends, `${testKey}: measured ${stats.bends} bends, expected ${expectedBends}`).toBe(
    expectedBends,
  );
}

/* ------------------------------------------------------------------ */
/* Shared layout — a matrix header/row-label pair, reproduced from          */
/* `TraceRouting.stories.tsx`'s `MatrixHeader`/`RowLabel` (not exported     */
/* there either — every routing story file owns its own presentation).     */
/* ------------------------------------------------------------------ */

function RowLabel({ title }: { title: string }) {
  return (
    <div style={{ width: 64, flexShrink: 0, paddingTop: 30, fontSize: 13, fontWeight: 600 }}>{title}</div>
  );
}

function MatrixHeader() {
  return (
    <div style={{ display: "flex", gap: 12, paddingLeft: 64 }}>
      {TRACE_DIRS.map((dir) => (
        <div key={dir} style={{ width: 200, fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>
          to.dir “{dir}”
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const meta: Meta = {
  title: "Components/Traces/Elbow/Directions",
  tags: ["object:trace"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* 1. AllSidePairs — the 4x4 matrix                                     */
/* ------------------------------------------------------------------ */

/** Placement held fixed: the sink always sits due EAST of the source. So
 * `from.dir "right"` / `to.dir "right"` is the trivial case (the wire just
 * continues in the direction it was already going) and everything
 * involving "left" is where the router has real work to do — leaving
 * toward the wrong side, or arriving from it. */
const MATRIX_PLACEMENT: Placement = "e";
const MATRIX_DISTANCE = 200;

/** Measured once (docs below the table this story exists to prove) and
 * pinned here so a change in the router's behavior fails loudly instead of
 * the caption quietly reporting something new. */
const EXPECTED_BENDS: Record<TraceDir, Record<TraceDir, number>> = {
  top: { top: 4, right: 3, bottom: 2, left: 3 },
  right: { top: 3, right: 0, bottom: 3, left: 4 },
  bottom: { top: 2, right: 3, bottom: 4, left: 3 },
  left: { top: 3, right: 4, bottom: 3, left: 4 },
};

/** `from.dir "left"` leaves toward the sink's far side; `to.dir "left"`
 * arrives from it. Either one is the awkward case this matrix exists to
 * surface honestly rather than hide behind a tidier fixture. */
function isAwkward(fromDir: TraceDir, toDir: TraceDir): boolean {
  return fromDir === "left" || toDir === "left";
}

/** All 16 scenes this gallery renders, up front — `sharedFrameSize` needs
 * every cell's own extent before any cell can pick its frame, which is
 * exactly the two-pass measurement `BuildElbowSceneOptions.distance`'s
 * comment always intended ("a viewer can compare bend counts across cells
 * without mentally correcting for scale") but the old per-cell autofit
 * never actually delivered. */
function allSidePairsScenes() {
  return TRACE_DIRS.flatMap((fromDir) =>
    TRACE_DIRS.map((toDir) => buildElbowScene(fromDir, toDir, MATRIX_PLACEMENT, { distance: MATRIX_DISTANCE })),
  );
}

export const AllSidePairs: Story = {
  render: () => {
    const frameSize = sharedFrameSize(allSidePairsScenes());
    return (
      <Gallery
        title="from.dir × to.dir — the full 4×4"
        description={
          <>
            Same two terminals every time — the sink sits due east of the source, distance {MATRIX_DISTANCE}px — with
            only the direction tangents changing. <code>right → right</code> is the trivial straight case; every cell
            touching <code>“left”</code> is the router doing real work, dashed and captioned rather than hidden.
          </>
        }
      >
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
          <MatrixHeader />
          {TRACE_DIRS.map((fromDir) => (
            <div key={fromDir} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <RowLabel title={`from.dir “${fromDir}”`} />
              {TRACE_DIRS.map((toDir) => {
                const scene = buildElbowScene(fromDir, toDir, MATRIX_PLACEMENT, { distance: MATRIX_DISTANCE });
                const key = `${fromDir}-${toDir}`;
                return (
                  <div key={toDir} style={{ width: 200 }}>
                    <DirectionCell
                      testKey={key}
                      label={`${fromDir} → ${toDir}`}
                      from={scene.from}
                      to={scene.to}
                      awkward={isAwkward(fromDir, toDir)}
                      frameSize={frameSize}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(16);

    for (const fromDir of TRACE_DIRS) {
      for (const toDir of TRACE_DIRS) {
        const scene = buildElbowScene(fromDir, toDir, MATRIX_PLACEMENT, { distance: MATRIX_DISTANCE });
        await assertCell(canvasElement, `${fromDir}-${toDir}`, scene.from, scene.to, EXPECTED_BENDS[fromDir][toDir]);
      }
    }

    // Every awkward cell really is marked, and nothing awkward slipped
    // through unmarked — the matrix is the point, not a curated subset.
    for (const fromDir of TRACE_DIRS) {
      for (const toDir of TRACE_DIRS) {
        const cell = requireEl<HTMLElement>(canvasElement, `[data-testid="cell-${fromDir}-${toDir}"]`);
        await expect(cell.getAttribute("data-awkward")).toBe(isAwkward(fromDir, toDir) ? "true" : null);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 2. PlacementSweep — one direction pair, 8 relative placements        */
/* ------------------------------------------------------------------ */

/** `right → left` — the pair the matrix above already flags as awkward at
 * `placement: "e"` (4 bends). Holding it fixed and moving the SINK instead
 * shows the other half of the story: the same "hard" tangent pair is cheap
 * when the sink sits off to a diagonal, and only expensive when it sits
 * directly ahead or directly behind. */
const SWEEP_FROM_DIR: TraceDir = "right";
const SWEEP_TO_DIR: TraceDir = "left";
const SWEEP_DISTANCE = 200;

const EXPECTED_SWEEP_BENDS: Record<Placement, number> = {
  n: 2,
  ne: 2,
  e: 4,
  se: 2,
  s: 2,
  sw: 2,
  w: 4,
  nw: 2,
};

function placementSweepScenes() {
  return PLACEMENTS.map((placement) => buildElbowScene(SWEEP_FROM_DIR, SWEEP_TO_DIR, placement, { distance: SWEEP_DISTANCE }));
}

export const PlacementSweep: Story = {
  render: () => {
    const frameSize = sharedFrameSize(placementSweepScenes());
    return (
      <Gallery
        title={`${SWEEP_FROM_DIR} → ${SWEEP_TO_DIR}, swept through all 8 placements`}
        description={
          <>
            Same direction tangents at both ends every time; only WHERE the sink sits relative to the source changes.
            Due east/west (the sink directly ahead of or behind the source) is where this pair costs the most — every
            diagonal placement lets the router turn the same corner it needed anyway into part of a shorter path.
          </>
        }
      >
        {PLACEMENTS.map((placement) => {
          const scene = buildElbowScene(SWEEP_FROM_DIR, SWEEP_TO_DIR, placement, { distance: SWEEP_DISTANCE });
          return (
            <DirectionCell
              key={placement}
              testKey={`sweep-${placement}`}
              label={`placement ${PLACEMENT_LABEL[placement]}`}
              from={scene.from}
              to={scene.to}
              awkward={placement === "e" || placement === "w"}
              frameSize={frameSize}
            />
          );
        })}
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(PLACEMENTS.length);

    for (const placement of PLACEMENTS) {
      const scene = buildElbowScene(SWEEP_FROM_DIR, SWEEP_TO_DIR, placement, { distance: SWEEP_DISTANCE });
      await assertCell(canvasElement, `sweep-${placement}`, scene.from, scene.to, EXPECTED_SWEEP_BENDS[placement]);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3. TopToBottom — the case Zach named directly                        */
/* ------------------------------------------------------------------ */

interface VerticalScene {
  key: string;
  label: string;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  obstacles?: readonly ElbowRect[];
  note: string;
  awkward?: boolean;
  expectedBends: number;
}

/** A slight horizontal offset (40px) turns `bottom → top` into the vertical
 * analogue of the classic riser: the router's normal 2-bend "out, across,
 * in" answer. `pureVertical` below is the honest counter-case with the
 * offset removed. */
const VERTICAL_DX = 40;
const VERTICAL_ORIGIN: Point = { x: 60, y: 40 };

function descend(gap: number): VerticalScene {
  return {
    key: `descend-${gap}`,
    label: `gap ${gap}px`,
    from: { ...VERTICAL_ORIGIN, dir: "bottom" },
    to: { x: VERTICAL_ORIGIN.x + VERTICAL_DX, y: VERTICAL_ORIGIN.y + gap, dir: "top" },
    note: "diagonal descend — out, across, in",
    expectedBends: 2,
  };
}

/** Same tight gap as `descend(70)`, one obstacle in the way. The router
 * cannot shave its way through a 24px keep-out with a 2-bend answer, so it
 * detours hard left instead — this is the forced detour the task asked
 * for, not a fixture tuned to avoid one. */
const TIGHT_GAP = 70;
const DETOUR_OBSTACLE: ElbowRect = { x: 20, y: 90, w: 160, h: 20 };

const VERTICAL_SCENES: VerticalScene[] = [
  descend(TIGHT_GAP),
  descend(130),
  descend(220),
  descend(340),
  {
    key: "descend-detour",
    label: `gap ${TIGHT_GAP}px, obstacle`,
    from: { ...VERTICAL_ORIGIN, dir: "bottom" },
    to: { x: VERTICAL_ORIGIN.x + VERTICAL_DX, y: VERTICAL_ORIGIN.y + TIGHT_GAP, dir: "top" },
    obstacles: [DETOUR_OBSTACLE],
    note: "same gap and terminals as the first cell — a keep-out is now in the way",
    awkward: true,
    expectedBends: 4,
  },
  {
    key: "pure-vertical",
    label: "dx 0 (straight down)",
    from: { ...VERTICAL_ORIGIN, dir: "bottom" },
    to: { x: VERTICAL_ORIGIN.x, y: VERTICAL_ORIGIN.y + 220, dir: "top" },
    note: 'source directly above sink, plenty of room — STILL 4 bends: "bottom → top" means the wire must pass the sink and turn back, offset or not',
    awkward: true,
    expectedBends: 4,
  },
];

export const TopToBottom: Story = {
  render: () => {
    const frameSize = sharedFrameSize(
      VERTICAL_SCENES.map((scene) => ({ from: scene.from, to: scene.to, obstacles: scene.obstacles })),
    );
    return (
      <Gallery
        title="from.dir “bottom” → to.dir “top” — vertical flow"
        description={
          <>
            The direction Zach named directly: "I also want to see top to bottom." A small horizontal offset makes
            this the vertical twin of the classic left-to-right riser (2 bends); a purely vertical pair does not get
            the same discount, and a keep-out at the SAME tight gap forces a real detour rather than a tidy corner.
          </>
        }
      >
        {VERTICAL_SCENES.map((scene) => (
          <DirectionCell
            key={scene.key}
            testKey={scene.key}
            label={scene.label}
            from={scene.from}
            to={scene.to}
            obstacles={scene.obstacles}
            note={scene.note}
            awkward={scene.awkward}
            frameSize={frameSize}
          />
        ))}
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    assertRulerUnchanged();
    await expect(canvasElement.querySelectorAll('[data-slot="direction-cell"]')).toHaveLength(VERTICAL_SCENES.length);

    for (const scene of VERTICAL_SCENES) {
      await assertCell(canvasElement, scene.key, scene.from, scene.to, scene.expectedBends);
    }

    // The detour cell's line genuinely clears the obstacle it was drawn
    // against — not just "more bends", actually routed around it. Measured
    // 16.0px, not the ~20px floor `TraceElbow.stories.tsx` derives for a
    // corner turning in open space (padding 24, minus one corner's cut of
    // ~2.83 at r=8): this particular corner turns around the padded
    // keep-out's OWN corner, where the rounding arc cuts inward on both
    // axes AT ONCE rather than one axis clear of the other. Still
    // comfortably outside the raw box — 16px, not 0 — so the floor here is
    // set from that measurement rather than borrowed from a straight-run
    // fixture it doesn't describe.
    const detourCell = requireEl<HTMLElement>(canvasElement, '[data-testid="cell-descend-detour"]');
    const detourSvg = requireEl<SVGSVGElement>(detourCell, '[data-testid="canvas-descend-detour"]');
    const detourLine = requireEl<SVGPathElement>(detourSvg, '[data-slot="trace-line"]');
    const detourPoints = samplePath(detourLine);
    let closest = Number.POSITIVE_INFINITY;
    for (const p of detourPoints) {
      const dx = Math.max(DETOUR_OBSTACLE.x - p.x, 0, p.x - (DETOUR_OBSTACLE.x + DETOUR_OBSTACLE.w));
      const dy = Math.max(DETOUR_OBSTACLE.y - p.y, 0, p.y - (DETOUR_OBSTACLE.y + DETOUR_OBSTACLE.h));
      closest = Math.min(closest, Math.hypot(dx, dy));
    }
    await expect(closest, `descend-detour: drawn line comes within ${closest.toFixed(2)}px of the obstacle`).toBeGreaterThan(
      12,
    );

    // The detour cell really did cost more than its obstacle-free twin at
    // the identical gap and terminals — the whole point of the pairing.
    const plain = VERTICAL_SCENES.find((s) => s.key === `descend-${TIGHT_GAP}`)!;
    const detour = VERTICAL_SCENES.find((s) => s.key === "descend-detour")!;
    await expect(detour.expectedBends).toBeGreaterThan(plain.expectedBends);
  },
};
