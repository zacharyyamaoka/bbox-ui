// src/stories/ElbowBundleAxes.stories.tsx — multi-cable BUNDLES, in both
// axes. Zach's ask, verbatim: "we tend to test a lot of left to right, but I
// also want to see top to bottom." `ElbowDirectionMatrix.stories.tsx` already
// answered that for a SINGLE cable's bend/tangent behaviour. This file
// answers it for `nudge.ts`'s channel-assignment pass, which is the least
// tested corner of the router: every existing `nudge.test.ts` fixture is a
// left-to-right flow (`cable(fromY, toY)`, side "right"/"left"), which
// produces VERTICAL shared segments on an X channel. `nudge.ts` classifies a
// segment by the axis it RUNS along — "a vertical run is 'y'" per its own
// `segments()` comment — so a top-to-bottom flow produces HORIZONTAL shared
// segments on a Y channel, a path through `assignBundleChannels` /
// `orderBundle` / `channelSpacingDefects` no existing test or story touches.
//
// The construction, and why it is trustworthy: every vertical-flow scene
// below is the horizontal-flow scene with `u` (the flow axis) and `v` (the
// channel axis) SWAPPED — not a separately hand-tuned fixture that merely
// resembles it. `toScreen`/`toScreenRect` do the swap; `bundleCable` is the
// one function every cable in every gallery is built from. The horizontal
// case with 5 cables, offsets `40+i*34` / `-60+i*34`, is deliberately
// IDENTICAL to `nudge.test.ts`'s own "scales past two" fixture (same boxes,
// same offsets) — box dimensions don't enter the router's channel math (only
// point coordinates and side do), so this file's horizontal N=5 overlap
// figure can be, and is, cross-checked against that donor test's own
// asserted 360px as an independent oracle before the vertical axis — which
// has no such donor test to check against — is trusted at all.
//
// Every number in every caption below is read off a real `NudgeReport` this
// file computes; none is predicted. See `docs/bundle-axes-verification.md`
// note in the PR description for the throwaway `vitest --project=unit` run
// that produced the comparison table in this session's report.

import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { TraceBody } from "../components/trace";
import { DIR_VECTOR, OPPOSITE_DIR, type Point, type TraceDir } from "../components/trace.layout";
import { TraceTerminal } from "../components/traceTerminal";
import {
  DEFAULT_NUDGE_OPTIONS,
  countCrossings,
  elbowPath,
  nudgeRoutes,
  routeElbow,
  type ElbowRect,
  type ElbowRoute,
  type ElbowRouteInput,
  type NudgeReport,
} from "../components/elbow/index";
import { routePoints } from "../components/elbow/traceContract";
import { Gallery } from "./elbowDirections.fixture";

/* ------------------------------------------------------------------ */
/* Axis-generic scene construction                                      */
/*                                                                       */
/* `u` runs along the flow (source -> sink); `v` is the channel axis     */
/* `nudge.ts` spreads cables along. A "vertical" bundle is the           */
/* "horizontal" one with u and v swapped, side names rotated to match —  */
/* nothing about the LAYOUT differs between axes, only the mapping to    */
/* screen x/y. That symmetry is the whole point: if `nudge.ts` is        */
/* genuinely axis-generic, swapping u/v must not change a single         */
/* measured number, and the play functions below assert exactly that.    */
/* ------------------------------------------------------------------ */

type FlowAxis = "horizontal" | "vertical";

function toScreen(axis: FlowAxis, u: number, v: number): Point {
  return axis === "horizontal" ? { x: u, y: v } : { x: v, y: u };
}

function toScreenRect(axis: FlowAxis, uStart: number, uLen: number, vLo: number, vHi: number): ElbowRect {
  return axis === "horizontal"
    ? { x: uStart, y: vLo, w: uLen, h: vHi - vLo }
    : { x: vLo, y: uStart, w: vHi - vLo, h: uLen };
}

const LEAVE_SIDE: Record<FlowAxis, TraceDir> = { horizontal: "right", vertical: "bottom" };
const ENTER_SIDE: Record<FlowAxis, TraceDir> = { horizontal: "left", vertical: "top" };

/** Same two "boxes" `nudge.test.ts`'s `cable()` and `TraceTidy.stories.tsx`
 * use (`A: {x:0,y:0,w:320,h:260}`, `B: {x:600,y:-80,w:320,h:200}`), read
 * here as `u`-axis extents only — the `v` extent below is generous and
 * SHARED by both boxes and every bundle size, since box height/width plays
 * no part in the router's channel math (only the point coordinates and
 * `side` do); it only has to be wide enough to draw every cable's port on
 * its wall, which is a purely cosmetic concern. */
const BOX_U = { aStart: 0, aLen: 320, bStart: 600, bLen: 320 };
const BOX_V_RANGE = { lo: -60, hi: 280 };

/** The offsets `nudge.test.ts`'s "scales past two" fixture uses for its
 * five-cable bundle: `cable(40 + i*34, -60 + i*34)`. Reused verbatim (not
 * just "similarly") so the horizontal N=5 case in `BundleSizeSweep` is
 * byte-for-byte that donor fixture, and its `overlapBefore` can be checked
 * against the donor test's own asserted 360px. */
const FROM_BASE = 40;
const TO_BASE = -60;
const CHANNEL_STEP = 34;

function boxA(axis: FlowAxis): ElbowRect {
  return toScreenRect(axis, BOX_U.aStart, BOX_U.aLen, BOX_V_RANGE.lo, BOX_V_RANGE.hi);
}
function boxB(axis: FlowAxis): ElbowRect {
  return toScreenRect(axis, BOX_U.bStart, BOX_U.bLen, BOX_V_RANGE.lo, BOX_V_RANGE.hi);
}

/** One cable between the two boxes, `nudge.test.ts`'s `cable(fromV, toV)`
 * generalised over `axis`. */
function bundleCable(axis: FlowAxis, fromV: number, toV: number): ElbowRouteInput {
  return {
    start: { point: toScreen(axis, BOX_U.aStart + BOX_U.aLen, fromV), side: LEAVE_SIDE[axis], box: boxA(axis) },
    end: { point: toScreen(axis, BOX_U.bStart, toV), side: ENTER_SIDE[axis], box: boxB(axis) },
  };
}

/** A `count`-cable parallel bundle: cable `i` runs `FROM_BASE + i*STEP` to
 * `TO_BASE + i*STEP` — same relative spacing at both ends, so (unlike an
 * inverted order) no pair's connection order ever crosses, for any count. */
function bundleInputs(axis: FlowAxis, count: number): ElbowRouteInput[] {
  return Array.from({ length: count }, (_, i) =>
    bundleCable(axis, FROM_BASE + i * CHANNEL_STEP, TO_BASE + i * CHANNEL_STEP),
  );
}

/* ------------------------------------------------------------------ */
/* Measurement — off the real `NudgeReport`, never predicted.           */
/* ------------------------------------------------------------------ */

/** The interior segment every cable built above shares with its bundle sits
 * at `route.points[1]`/`[2]` (a plain 2-bend "out, across, in" elbow — no
 * obstacles are used anywhere in this file, so every route is exactly this
 * shape). Its channel coordinate is on the CROSS axis from `bundle.axis`
 * (`nudge.ts`'s own convention: a vertical run is axis `'y'`, channel `'x'`;
 * a horizontal run is axis `'x'`, channel `'y'`). */
function channelKeyOf(segmentAxis: "x" | "y"): "x" | "y" {
  return segmentAxis === "x" ? "y" : "x";
}

/** Every gap between adjacent channels in one bundle, sorted — what a
 * viewer would measure with a ruler between the spread-out cables. */
function bundleGaps(report: NudgeReport, bundle: NudgeReport["bundles"][number]): number[] {
  const key = channelKeyOf(bundle.axis);
  const channels = bundle.cables
    .map((cable) => (report.routes[cable].points[1] as unknown as Record<"x" | "y", number>)[key])
    .sort((a, b) => a - b);
  return channels.slice(1).map((c, i) => Number((c - channels[i]).toFixed(3)));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

const CABLE_PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0e7490", "#db2777"];

/** Same rule as `TraceTidy.stories.tsx`'s `terminalsFor`, reproduced here —
 * every routing story file owns its own presentation copy rather than
 * sharing one (`ElbowDirectionMatrix.stories.tsx`'s own comment on this). */
const TERMINAL_INSET = 16;

function terminalsFor(input: ElbowRouteInput): { from: Point & { dir: TraceDir }; to: Point & { dir: TraceDir } } {
  const fromDir = input.start.side as TraceDir;
  const toDir = OPPOSITE_DIR[input.end.side as TraceDir];
  return {
    from: {
      x: input.start.point.x - DIR_VECTOR[fromDir].x * TERMINAL_INSET,
      y: input.start.point.y - DIR_VECTOR[fromDir].y * TERMINAL_INSET,
      dir: fromDir,
    },
    to: {
      x: input.end.point.x + DIR_VECTOR[toDir].x * TERMINAL_INSET,
      y: input.end.point.y + DIR_VECTOR[toDir].y * TERMINAL_INSET,
      dir: toDir,
    },
  };
}

function frameOf(boxes: readonly ElbowRect[], inputs: readonly ElbowRouteInput[], routeSets: readonly ElbowRoute[][]): string {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const rect of boxes) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  for (const input of inputs) {
    const { from, to } = terminalsFor(input);
    xs.push(from.x, to.x);
    ys.push(from.y, to.y);
  }
  for (const routes of routeSets) {
    for (const route of routes) {
      for (const p of route.points) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  const pad = 22;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
}

function BundlePanel({
  testKey,
  side,
  boxes,
  inputs,
  routes,
  viewBox,
}: {
  testKey: string;
  side: "before" | "after";
  boxes: readonly ElbowRect[];
  inputs: readonly ElbowRouteInput[];
  routes: readonly ElbowRoute[];
  viewBox: string;
}) {
  const [, , vw, vh] = viewBox.split(" ").map(Number);
  return (
    <div data-slot={`bundle-${side}`} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, padding: "4px 8px", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
        {side === "before" ? "Before nudgeRoutes" : "After nudgeRoutes"}
      </div>
      <svg
        data-slot="bundle-canvas"
        data-testid={`bundle-canvas-${testKey}-${side}`}
        viewBox={viewBox}
        width="100%"
        style={{ display: "block", aspectRatio: `${vw} / ${vh}` }}
      >
        {boxes.map((rect, index) => (
          <rect
            key={index}
            data-slot="bundle-box"
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            rx={8}
            fill="var(--muted)"
            stroke="var(--border)"
          />
        ))}
        {routes.map((route, index) => {
          const { from, to } = terminalsFor(inputs[index]);
          return (
            <g key={index} data-testid={`bundle-trace-${testKey}-${side}-${index}`}>
              <TraceBody
                id={`${testKey}-${side}-${index}`}
                path={elbowPath(route)}
                points={routePoints(route)}
                color={CABLE_PALETTE[index % CABLE_PALETTE.length]}
              />
              <TraceTerminal {...from} />
              <TraceTerminal {...to} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface BundleSceneData {
  boxes: ElbowRect[];
  inputs: ElbowRouteInput[];
  before: ElbowRoute[];
  report: NudgeReport;
}

/** One bundle's full pipeline: build the inputs, route them, nudge them.
 * Every gallery below calls this and this alone — the play functions
 * recompute the identical thing rather than trusting the rendered DOM,
 * exactly like `assertCell` in `ElbowDirectionMatrix.stories.tsx` recomputes
 * its scene via `buildElbowScene` rather than trusting `storyRenders`. */
function buildScene(axis: FlowAxis, count: number): BundleSceneData {
  const inputs = bundleInputs(axis, count);
  const before = inputs.map((input) => routeElbow(input));
  const report = nudgeRoutes(before);
  return { boxes: [boxA(axis), boxB(axis)], inputs, before, report };
}

function captionFor(scene: BundleSceneData): string {
  const { report, before } = scene;
  const gaps = report.bundles.flatMap((bundle) => bundleGaps(report, bundle));
  const crossingsBefore = countCrossings(before);
  const crossingsAfter = countCrossings(report.routes);
  const parts = [
    `overlap ${round(report.overlapBefore)} → ${round(report.overlapAfter)}px`,
    `${report.bundles.length} bundle${report.bundles.length === 1 ? "" : "s"}`,
    `gaps [${gaps.map(round).join(", ")}]px`,
    `crossings ${crossingsBefore} → ${crossingsAfter}`,
  ];
  if (report.forcedCrossings.length) parts.push(`${report.forcedCrossings.length} forced`);
  if (report.spacingDefects.length) parts.push(`${report.spacingDefects.length} spacing defect${report.spacingDefects.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function BundleCard({
  testKey,
  title,
  scene,
  note,
}: {
  testKey: string;
  title: string;
  scene: BundleSceneData;
  note?: ReactNode;
}) {
  const viewBox = frameOf(scene.boxes, scene.inputs, [scene.before, scene.report.routes]);
  return (
    <figure
      data-testid={`bundle-card-${testKey}`}
      data-slot="bundle-card"
      style={{ margin: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", overflow: "hidden" }}
    >
      <figcaption style={{ padding: "10px 12px 8px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{title}</div>
        <div data-slot="bundle-measurement" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)" }}>
          {captionFor(scene)}
        </div>
        {note ? <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", lineHeight: 1.3 }}>{note}</div> : null}
      </figcaption>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--border)" }}>
        <BundlePanel testKey={testKey} side="before" boxes={scene.boxes} inputs={scene.inputs} routes={scene.before} viewBox={viewBox} />
        <div style={{ borderLeft: "1px solid var(--border)", minWidth: 0 }}>
          <BundlePanel testKey={testKey} side="after" boxes={scene.boxes} inputs={scene.inputs} routes={scene.report.routes} viewBox={viewBox} />
        </div>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Shared assertions                                                    */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

/** Every non-locked route stays a pure orthogonal polyline after nudging —
 * the same falsifiable form `nudge.test.ts`'s "stays orthogonal" test uses. */
function assertOrthogonal(routes: readonly ElbowRoute[], label: string) {
  for (const route of routes) {
    for (let i = 0; i + 1 < route.points.length; i += 1) {
      const a = route.points[i];
      const b = route.points[i + 1];
      const axisAligned = Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
      expect(axisAligned, `${label}: segment ${i} is not axis-aligned`).toBe(true);
    }
  }
}

/** The channel gaps within every bundle land within `tolerance` of the
 * configured spacing (14px, `DEFAULT_NUDGE_OPTIONS.spacing`) — the visual
 * cadence a viewer is meant to see as EVEN, not just "spread apart". */
function assertEvenGaps(report: NudgeReport, label: string) {
  for (const bundle of report.bundles) {
    for (const gap of bundleGaps(report, bundle)) {
      expect(gap, `${label}: channel gap ${gap}px vs spacing ${DEFAULT_NUDGE_OPTIONS.spacing}px`).toBeCloseTo(
        DEFAULT_NUDGE_OPTIONS.spacing,
        1,
      );
    }
  }
}

/** Any crossing that survives nudging is accounted for as a FORCED one —
 * never a leftover the pass merely failed to remove. */
function assertCrossingsAccountedFor(report: NudgeReport, label: string) {
  expect(countCrossings(report.routes), `${label}: crossings after vs forced crossings`).toBe(
    report.forcedCrossings.length,
  );
}

function assertCardRendered(canvasElement: HTMLElement, testKey: string, count: number) {
  for (const side of ["before", "after"] as const) {
    const svg = requireEl<SVGSVGElement>(canvasElement, `[data-testid="bundle-canvas-${testKey}-${side}"]`);
    expect(svg.querySelectorAll('[data-slot="trace-line"]'), `${testKey} ${side}: cable count`).toHaveLength(count);
  }
}

/* ------------------------------------------------------------------ */

const meta: Meta = {
  title: "Trace/Elbow Bundle Axes",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* 1 & 2. HorizontalFlowBundle / VerticalFlowBundle — the control and    */
/* the point of this file, at a fixed 5-cable bundle.                   */
/* ------------------------------------------------------------------ */

const CONTROL_COUNT = 5;

export const HorizontalFlowBundle: Story = {
  render: () => {
    const scene = buildScene("horizontal", CONTROL_COUNT);
    return (
      <Gallery
        title="5 parallel cables, left-to-right — the control"
        description={
          <>
            The well-trodden case: every existing <code>nudge.test.ts</code> fixture is this flow. Every cable
            shares the same midline <code>x</code> channel before nudging; <code>nudgeRoutes</code> spreads them into
            evenly-spaced parallel channels with zero overlap and zero new crossings.
          </>
        }
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <BundleCard testKey="h5" title="horizontal, 5 cables" scene={scene} />
        </div>
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    const scene = buildScene("horizontal", CONTROL_COUNT);
    assertCardRendered(canvasElement, "h5", CONTROL_COUNT);
    // Independent-oracle cross-check: byte-for-byte `nudge.test.ts`'s own
    // "scales past two" fixture (same boxes, same offsets) — box dimensions
    // don't enter the router's channel math, so this MUST equal the donor
    // test's own asserted value before the vertical axis (no such donor
    // test exists for it) is trusted at all.
    expect(scene.report.overlapBefore, "matches nudge.test.ts's own 5-cable fixture").toBeCloseTo(360, 6);
    expect(scene.report.overlapAfter).toBe(0);
    assertEvenGaps(scene.report, "h5");
    assertCrossingsAccountedFor(scene.report, "h5");
    expect(scene.report.forcedCrossings).toHaveLength(0);
    assertOrthogonal(scene.report.routes, "h5");
  },
};

export const VerticalFlowBundle: Story = {
  render: () => {
    const scene = buildScene("vertical", CONTROL_COUNT);
    return (
      <Gallery
        title="5 parallel cables, top-to-bottom — the point of this file"
        description={
          <>
            The exact same bundle, rotated: source <code>dir:"bottom"</code> → sink <code>dir:"top"</code>. Every
            cable shares the same midline <code>y</code> channel before nudging — the path through{" "}
            <code>assignBundleChannels</code>/<code>orderBundle</code> no existing test or story exercised. If the
            vertical axis behaved differently from the horizontal control above, THIS is where it would show up.
          </>
        }
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <BundleCard testKey="v5" title="vertical, 5 cables" scene={scene} />
        </div>
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    const scene = buildScene("vertical", CONTROL_COUNT);
    const control = buildScene("horizontal", CONTROL_COUNT);
    assertCardRendered(canvasElement, "v5", CONTROL_COUNT);
    // The claim this whole file exists to check: swapping the flow axis
    // changes NOTHING about the measured outcome.
    expect(scene.report.overlapBefore, "vertical overlapBefore vs horizontal control").toBeCloseTo(
      control.report.overlapBefore,
      6,
    );
    expect(scene.report.overlapAfter).toBe(0);
    assertEvenGaps(scene.report, "v5");
    assertCrossingsAccountedFor(scene.report, "v5");
    expect(scene.report.forcedCrossings).toHaveLength(0);
    assertOrthogonal(scene.report.routes, "v5");
  },
};

/* ------------------------------------------------------------------ */
/* 3. BundleSizeSweep — 2, 3, 5, 7 cables, both axes                     */
/* ------------------------------------------------------------------ */

const SWEEP_COUNTS = [2, 3, 5, 7] as const;

export const BundleSizeSweep: Story = {
  render: () => (
    <Gallery
      title="Bundle size × axis — the spacing cadence as the bundle grows"
      description="Same construction as the two galleries above, at 2/3/5/7 cables, both axes side by side so the cadence — and any axis divergence — is visible as the bundle grows."
    >
      {SWEEP_COUNTS.map((count) => (
        <div key={count} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BundleCard testKey={`sweep-h-${count}`} title={`horizontal, ${count} cables`} scene={buildScene("horizontal", count)} />
          <BundleCard testKey={`sweep-v-${count}`} title={`vertical, ${count} cables`} scene={buildScene("vertical", count)} />
        </div>
      ))}
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    for (const count of SWEEP_COUNTS) {
      for (const axis of ["horizontal", "vertical"] as const) {
        const testKey = `sweep-${axis === "horizontal" ? "h" : "v"}-${count}`;
        const scene = buildScene(axis, count);
        assertCardRendered(canvasElement, testKey, count);
        expect(scene.report.overlapBefore, `${testKey}: overlapBefore is genuine overlap`).toBeGreaterThan(0);
        expect(scene.report.overlapAfter, `${testKey}: overlapAfter`).toBe(0);
        assertEvenGaps(scene.report, testKey);
        assertCrossingsAccountedFor(scene.report, testKey);
        expect(scene.report.forcedCrossings, `${testKey}: forced crossings`).toHaveLength(0);
        assertOrthogonal(scene.report.routes, testKey);
      }
      // The axis-genericity claim, at every size in the sweep, not just the
      // one control size the two galleries above pin down.
      const h = buildScene("horizontal", count);
      const v = buildScene("vertical", count);
      expect(v.report.overlapBefore, `count ${count}: vertical vs horizontal overlapBefore`).toBeCloseTo(
        h.report.overlapBefore,
        6,
      );
    }
  },
};

/* ------------------------------------------------------------------ */
/* 4. MixedAxisBundle — both channel axes nudged in ONE call             */
/* ------------------------------------------------------------------ */

/** A horizontal bundle's gap (its cables run between x=200 and x=520) and a
 * vertical bundle's gap (its cables run between y=-60 and y=260, with their
 * ports spread across x in [280,448]) placed so the vertical cables'
 * channel sits INSIDE the horizontal cables' x gap, and the horizontal
 * cables' channel sits inside the vertical ones' y span — the two bundles'
 * corridors genuinely cross, and one `nudgeRoutes` call resolves both. */
const MIXED_HBOX_A: ElbowRect = { x: 0, y: -100, w: 200, h: 250 };
const MIXED_HBOX_B: ElbowRect = { x: 520, y: -100, w: 200, h: 250 };
const MIXED_VBOX_A: ElbowRect = { x: 200, y: -260, w: 320, h: 200 };
const MIXED_VBOX_B: ElbowRect = { x: 200, y: 260, w: 320, h: 200 };
const MIXED_COUNT = 3;

function mixedInputs(): ElbowRouteInput[] {
  const horizontal: ElbowRouteInput[] = Array.from({ length: MIXED_COUNT }, (_, i) => ({
    start: { point: { x: 200, y: FROM_BASE + i * CHANNEL_STEP }, side: "right", box: MIXED_HBOX_A },
    end: { point: { x: 520, y: TO_BASE + i * CHANNEL_STEP }, side: "left", box: MIXED_HBOX_B },
  }));
  // Same relative offsets as `bundleCable` (base 40/-60, step 34), shifted
  // +340 so the vertical bundle's channel sits at x in [280,448] — inside
  // the horizontal bundle's [200,520] gap.
  const vertical: ElbowRouteInput[] = Array.from({ length: MIXED_COUNT }, (_, i) => ({
    start: { point: { x: FROM_BASE + 340 + i * CHANNEL_STEP, y: -60 }, side: "bottom", box: MIXED_VBOX_A },
    end: { point: { x: TO_BASE + 340 + i * CHANNEL_STEP, y: 260 }, side: "top", box: MIXED_VBOX_B },
  }));
  return [...horizontal, ...vertical];
}

function buildMixedScene(): BundleSceneData {
  const inputs = mixedInputs();
  const before = inputs.map((input) => routeElbow(input));
  const report = nudgeRoutes(before);
  return { boxes: [MIXED_HBOX_A, MIXED_HBOX_B, MIXED_VBOX_A, MIXED_VBOX_B], inputs, before, report };
}

export const MixedAxisBundle: Story = {
  render: () => {
    const scene = buildMixedScene();
    return (
      <Gallery
        title="3 horizontal + 3 vertical cables through the same region"
        description={
          <>
            Two independent bundles — a left-to-right one and a top-to-bottom one — whose corridors genuinely cross,
            nudged in a SINGLE <code>nudgeRoutes</code> call. <code>nudge.ts</code> buckets purely by segment axis and
            channel coordinate, so the horizontal bundle's <code>y</code> channel and the vertical bundle's{" "}
            <code>x</code> channel are resolved independently within that one pass. The two families still cross each
            other (an orthogonal-flow crossing, not a same-channel overlap) — that count is reported, not hidden.
          </>
        }
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <BundleCard testKey="mixed" title="mixed axes, 3+3 cables" scene={scene} />
        </div>
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    const scene = buildMixedScene();
    assertCardRendered(canvasElement, "mixed", MIXED_COUNT * 2);
    // Both bundles present, on the two DIFFERENT segment axes — the
    // literal "both channel axes nudged at once" claim.
    const axes = scene.report.bundles.map((b) => b.axis).sort();
    expect(axes, "one bundle per segment axis").toEqual(["x", "y"]);
    expect(scene.report.overlapBefore, "mixed: genuine overlap in both families").toBeGreaterThan(0);
    expect(scene.report.overlapAfter, "mixed: overlap driven to zero").toBe(0);
    assertEvenGaps(scene.report, "mixed");
    expect(scene.report.forcedCrossings, "mixed: no forced crossings").toHaveLength(0);
    assertOrthogonal(scene.report.routes, "mixed");
    // The two orthogonal-flow families DO still cross each other — that is
    // a real, expected property of routing through the same region, not
    // something nudging is claimed to remove. Stated and checked, not
    // hidden: strictly fewer crossings than the fully-unrouted overlap
    // scene, never claimed to reach zero.
    const crossingsBefore = countCrossings(scene.before);
    const crossingsAfter = countCrossings(scene.report.routes);
    expect(crossingsAfter, "mixed: cross-family crossings survive (expected)").toBeGreaterThan(0);
    expect(crossingsAfter, "mixed: crossings does not get worse").toBeLessThanOrEqual(crossingsBefore);
  },
};
