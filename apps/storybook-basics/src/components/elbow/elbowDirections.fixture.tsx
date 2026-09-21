// src/components/elbow/elbowDirections.fixture.tsx — the shared harness for the
// elbow-direction sweep (Zach's ask, verbatim: "test all directions of
// possible edges as well. each port could potentially have 4 output
// directions... I also want to see top to bottom"). Measured before this
// file existed: across the four existing routing story files, `dir:"right"`
// appears 9 times, `side:"right"` 4 more, `side:"left"` 4 — against
// `dir:"top"` and `dir:"left"` ONCE each. This is the fixture the coverage
// sweep runs on; `ElbowDirectionMatrix.stories.tsx` is the sweep itself, and
// two more galleries are expected to import this contract afterward, so its
// exports are the frozen surface — not a private helper file.
//
// Nothing here re-derives geometry. Every route comes out of `routeElbow`,
// the same A* router `TraceElbow.stories.tsx` already exercises; this file
// only builds requests and measures what comes back. No default export — it
// is not a story file.

import type { ReactNode } from "react";

import { TraceBody } from "../trace";
import { DIR_VECTOR, type Point, type TraceDir, type TraceTerminalSpec } from "../trace.layout";
import { TraceTerminal } from "../traceTerminal";
import {
  DEFAULT_ELBOW_OPTIONS,
  elbowPath,
  routeElbow,
  type ElbowRect,
  type ElbowRoute,
} from "./index";
import { elbowInputFromTerminals, routePoints, type TraceElbowRequest } from "./traceContract";

/* ------------------------------------------------------------------ */
/* Terminal gap — same rule as TraceElbow.stories.tsx's `routeStart`/       */
/* `routeEnd`, reproduced here rather than imported (that file exports      */
/* nothing) so this fixture has no dependency on another story file.        */
/* ------------------------------------------------------------------ */

/** How far short of a terminal's centre the wire stops — the glyph's ring
 * is r=9 and opaque, so a wire drawn to the exact centre would vanish
 * under it. Same value as `TraceElbow.stories.tsx`'s `TERMINAL_GAP`. */
export const TERMINAL_GAP = 16;

export function routeStart(from: TraceTerminalSpec): TraceTerminalSpec {
  return {
    x: from.x + DIR_VECTOR[from.dir].x * TERMINAL_GAP,
    y: from.y + DIR_VECTOR[from.dir].y * TERMINAL_GAP,
    dir: from.dir,
  };
}

export function routeEnd(to: TraceTerminalSpec): TraceTerminalSpec {
  return {
    x: to.x - DIR_VECTOR[to.dir].x * TERMINAL_GAP,
    y: to.y - DIR_VECTOR[to.dir].y * TERMINAL_GAP,
    dir: to.dir,
  };
}

/* ------------------------------------------------------------------ */
/* Placement — where the sink sits relative to the source. The 4x4 matrix   */
/* holds this FIXED so direction is the only variable; the placement sweep  */
/* holds direction fixed and varies this instead.                           */
/* ------------------------------------------------------------------ */

export const PLACEMENTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Unit-ish vector from source toward sink for each placement. SVG y grows
 * down, so "n" is -y, matching `DIR_VECTOR.top`. */
export const PLACEMENT_VECTOR: Record<Placement, Point> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
};

export const PLACEMENT_LABEL: Record<Placement, string> = {
  n: "N",
  ne: "NE",
  e: "E",
  se: "SE",
  s: "S",
  sw: "SW",
  w: "W",
  nw: "NW",
};

export interface ElbowDirectionScene {
  /** Source terminal, in local cell coordinates (pre-gap). */
  from: TraceTerminalSpec;
  /** Sink terminal, in local cell coordinates (pre-gap). */
  to: TraceTerminalSpec;
  obstacles?: readonly ElbowRect[];
}

export interface BuildElbowSceneOptions {
  /** Straight-line distance from source to sink. Default keeps every cell
   * a fixed-size box regardless of which placement or direction pair is
   * plotted, so a viewer can compare bend counts across cells without
   * mentally correcting for scale. */
  distance?: number;
  /** Where the source sits in local cell coordinates. Offset from the
   * cell's centre so a route that overshoots backward (a "target behind
   * the source" case, which several direction pairs below produce on
   * purpose) still has room inside the frame. */
  origin?: Point;
  obstacles?: readonly ElbowRect[];
}

const DEFAULT_DISTANCE = 200;
const DEFAULT_ORIGIN: Point = { x: 160, y: 160 };

/**
 * `(fromDir, toDir, placement)` -> a scene. This is the one helper every
 * gallery in this sweep is built from: the matrix varies `fromDir`/`toDir`
 * at a fixed `placement`, the placement sweep varies `placement` at a
 * fixed direction pair.
 */
export function buildElbowScene(
  fromDir: TraceDir,
  toDir: TraceDir,
  placement: Placement,
  options: BuildElbowSceneOptions = {},
): ElbowDirectionScene {
  const distance = options.distance ?? DEFAULT_DISTANCE;
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const vector = PLACEMENT_VECTOR[placement];
  const mag = Math.hypot(vector.x, vector.y);
  const to: Point = {
    x: origin.x + (vector.x / mag) * distance,
    y: origin.y + (vector.y / mag) * distance,
  };
  return {
    from: { ...origin, dir: fromDir },
    to: { ...to, dir: toDir },
    ...(options.obstacles ? { obstacles: options.obstacles } : {}),
  };
}

/** A scene -> the router's request, with the terminal gap applied. */
export function elbowRequestFor(scene: ElbowDirectionScene): TraceElbowRequest {
  return {
    from: routeStart(scene.from),
    to: routeEnd(scene.to),
    ...(scene.obstacles ? { obstacles: scene.obstacles } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Measurement — off the route's own points, never off "the element        */
/* exists". Callers that need a rendered-path cross-check (a play function  */
/* sampling the drawn `SVGPathElement`) do that themselves; this is what    */
/* feeds every on-screen caption in the gallery.                            */
/* ------------------------------------------------------------------ */

export interface RouteMeasurement {
  /** Direction changes between consecutive route segments. A route with N
   * vertices has at most N-2 of these; a collinear vertex (rare, but the
   * router can hand one back for a degenerate request) costs nothing. */
  bends: number;
  /** Sum of |dx| + |dy| over every segment — the manhattan length, which
   * for a genuinely orthogonal route equals the drawn line's own arc
   * length (a diagonal segment would inflate arc length past this, which
   * is exactly what `orthogonal` below catches). */
  manhattanLength: number;
  /** False the moment any segment moves on both axes at once. An elbow
   * route is supposed to be a pure orthogonal polyline before corner
   * rounding — this is the fixture's own falsifiable form of that claim. */
  orthogonal: boolean;
}

/** Segments shorter than this are treated as coincident points, not a real
 * direction — the router can hand back a repeated vertex at a pin or a
 * degenerate request, and that should cost nothing rather than reading as
 * a phantom bend. */
const MIN_SEGMENT_PX = 1e-6;

export function measureRoute(route: ElbowRoute): RouteMeasurement {
  const points = route.points;
  let manhattanLength = 0;
  let bends = 0;
  let orthogonal = true;
  let lastAxis: "x" | "y" | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < MIN_SEGMENT_PX && ady < MIN_SEGMENT_PX) continue;
    manhattanLength += adx + ady;
    if (adx > MIN_SEGMENT_PX && ady > MIN_SEGMENT_PX) orthogonal = false;
    const axis: "x" | "y" = adx >= ady ? "x" : "y";
    if (lastAxis !== null && axis !== lastAxis) bends += 1;
    lastAxis = axis;
  }
  return { bends, manhattanLength, orthogonal };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

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
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="var(--muted)" stroke="var(--border)" rx={4} />
    </g>
  );
}

const CELL_PAD = 26;

/** A gallery-level shared frame — same width/height for every cell in one
 * gallery, so px-per-unit is constant across the grid. See `sharedFrameSize`
 * for how one gets computed, and `viewBoxFor` for how a cell uses it. */
export interface SharedFrameSize {
  width: number;
  height: number;
}

/** The bare geometric extent of one cell's content — route points, its own
 * terminals, and any obstacles — before padding. `viewBoxFor`'s per-cell
 * autofit and `sharedFrameSize`'s gallery-level max both build from this
 * SAME function so neither can quietly disagree about what "extent" means. */
function cellExtent(
  route: ElbowRoute,
  extra: readonly Point[],
  obstacles: readonly ElbowRect[],
): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = [...route.points.map((p) => p.x), ...extra.map((p) => p.x)];
  const ys = [...route.points.map((p) => p.y), ...extra.map((p) => p.y)];
  for (const rect of obstacles) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Frame the cell. With no `frameSize` this is the original per-cell
 * autofit: sized and centered on the route's OWN bounds, so a route that
 * overshoots the nominal box (several direction pairs here legitimately do
 * — that is the whole point of sweeping "target behind the source") stays
 * fully visible rather than clipping the exact thing the cell exists to
 * show.
 *
 * WHY frameSize exists: `BuildElbowSceneOptions.distance`'s own comment
 * promises every cell renders at the SAME scale so bend counts are
 * comparable at a glance — but per-cell autofit means a short/straight
 * route (tiny bounds) gets magnified to fill its box while a long,
 * many-bend neighbor gets shrunk, which is exactly backwards. `frameSize`
 * (from `sharedFrameSize`, computed once per gallery over every cell it
 * will contain) gives every cell the SAME width/height — constant
 * px-per-unit — while still centering the frame on THIS cell's own content
 * bounds rather than the gallery's, so a cell's own route can never be
 * pushed outside it. The `Math.max` below is a defensive floor for a
 * caller that passes a `frameSize` not actually derived from this cell's
 * scene; the normal path never needs it, because `sharedFrameSize` already
 * took the max over the same scenes.
 */
function viewBoxFor(
  route: ElbowRoute,
  extra: readonly Point[],
  obstacles: readonly ElbowRect[],
  frameSize?: SharedFrameSize,
): string {
  const { minX, maxX, minY, maxY } = cellExtent(route, extra, obstacles);
  const ownWidth = maxX - minX + CELL_PAD * 2;
  const ownHeight = maxY - minY + CELL_PAD * 2;
  if (!frameSize) {
    return `${minX - CELL_PAD} ${minY - CELL_PAD} ${ownWidth} ${ownHeight}`;
  }
  const width = Math.max(frameSize.width, ownWidth);
  const height = Math.max(frameSize.height, ownHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
}

/**
 * Gallery-level pass: the shared frame size every cell in one gallery
 * should render at — the max width and max height any INDIVIDUAL scene in
 * `scenes` needs on its own (same padding `viewBoxFor`'s autofit uses), so
 * feeding the result back into every `DirectionCell` in that gallery keeps
 * every cell's own content inside it (each one's own need is <= the max)
 * while every cell renders at the identical scale (every frame is the same
 * size). Callers build `scenes` the same way they build the cells
 * themselves, one call per gallery — see `ElbowDirectionMatrix.stories.tsx`
 * / `ElbowFanOutDirections.stories.tsx` for the pattern.
 */
export function sharedFrameSize(scenes: readonly ElbowDirectionScene[]): SharedFrameSize {
  let width = 0;
  let height = 0;
  for (const scene of scenes) {
    const route = routeElbow(elbowInputFromTerminals(elbowRequestFor(scene)));
    const { minX, maxX, minY, maxY } = cellExtent(route, [scene.from, scene.to], scene.obstacles ?? []);
    width = Math.max(width, maxX - minX + CELL_PAD * 2);
    height = Math.max(height, maxY - minY + CELL_PAD * 2);
  }
  return { width, height };
}

export interface DirectionCellProps {
  /** Used to build every `data-testid` a play function reaches for. Must
   * be unique within the gallery. */
  testKey: string;
  label: string;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  obstacles?: readonly ElbowRect[];
  /** Extra context under the measured caption. Never a substitute for the
   * measured numbers themselves. */
  note?: ReactNode;
  /**
   * Marks a cell whose direction pair is inherently awkward — a source
   * leaving away from its target, or a sink facing away from its source —
   * rendered exactly like every other cell, never omitted
   * (`TraceRouting.stories.tsx`'s `data-supported="false"` idiom), just
   * carrying `data-awkward="true"` and a dashed rail so a play function can
   * assert it was found, not hidden. Unlike `TraceRouting`'s unsupported
   * cells this is NOT a claim that the route is wrong — the elbow router
   * honors every tangent, awkward or not; it is a claim that the route
   * had more work to do, which the bend count right below it backs up.
   */
  awkward?: boolean;
  /** Gallery-level shared frame from `sharedFrameSize` — every cell that
   * gets the SAME value renders at the SAME scale. Omit for the original
   * per-cell autofit (sized to this cell's own route alone). */
  frameSize?: SharedFrameSize;
}

/** One route, its terminals, and a caption stating what was measured — the
 * cell every gallery in this sweep is made of. */
export function DirectionCell({ testKey, label, from, to, obstacles, note, awkward, frameSize }: DirectionCellProps) {
  const scene: ElbowDirectionScene = obstacles ? { from, to, obstacles } : { from, to };
  const request = elbowRequestFor(scene);
  const route = routeElbow(elbowInputFromTerminals(request));
  const path = elbowPath(route);
  const measurement = measureRoute(route);
  const rects = obstacles ?? [];
  const viewBox = viewBoxFor(route, [from, to], rects, frameSize);
  const [, , vw, vh] = viewBox.split(" ").map(Number);

  return (
    <figure
      data-testid={`cell-${testKey}`}
      data-slot="direction-cell"
      data-awkward={awkward ? "true" : undefined}
      style={{
        margin: 0,
        border: awkward ? "1px dashed var(--bbox-primary, var(--primary))" : "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--card)",
        overflow: "hidden",
      }}
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
        {rects.map((rect, index) => (
          <Keepout key={index} rect={rect} />
        ))}
        <TraceBody id={`trace-${testKey}`} path={path} points={routePoints(route)} />
        <TraceTerminal {...from} />
        <TraceTerminal {...to} />
      </svg>
    </figure>
  );
}

/** The grid every gallery lays its cells into. Generic on purpose — the 4x4
 * matrix additionally overlays row/column headers of its own, but the grid
 * itself is shared. */
export function Gallery({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, background: "var(--background)" }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--foreground)" }}>{title}</h2>
        {description ? (
          <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted-foreground)", maxWidth: 820, margin: "4px 0 0" }}>
            {description}
          </p>
        ) : null}
      </div>
      <div
        data-slot="direction-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}
      >
        {children}
      </div>
    </div>
  );
}
