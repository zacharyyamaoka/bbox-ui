import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Trace, type TraceGeometry, type TraceRouteProps } from "../components/trace";
import type { TraceDir, TraceRouting, TraceVariant } from "../components/trace.layout";

/**
 * Basics/TraceArrowhead — phase B3 of docs/BLOCK-PORT-EDGES-PLAN.md §8.
 *
 * The in-flight Trace already ships `markerEnd = "arrow"` as its OWN
 * default (`trace.tsx:664`), the chevron marker with `context-stroke` colour
 * inheritance, and TRACE-PLAN's own P6 acceptance already pins "the `to`-end
 * marker present, the `from` end bare". This file is VERIFICATION AND
 * COMPOSITION, not construction (§8's own framing): it asserts that survives
 * every routing × variant, then — only if acceptance finds a gap — a
 * surgical `trace.tsx` fix is legal (the trace lane is done, the file is
 * shared). No new marker code, no `markerStart`, no per-family shapes.
 */

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  return point.matrixTransform(ctm);
}

const DIR_VECTOR: Record<TraceDir, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

function angleOf(v: { x: number; y: number }): number {
  return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Exactly one `<marker>` resolves for this cell, and the path that carries
 * `marker-end` really does reference it by id — never assumed from the
 * `markerEnd` PROP, always read back off the rendered DOM.
 */
function expectExactlyOneMarker(group: SVGGElement, what: string): SVGMarkerElement {
  const markers = group.querySelectorAll<SVGMarkerElement>("marker");
  if (markers.length !== 1) throw new Error(`${what} — expected exactly 1 <marker>, found ${markers.length}`);
  const marker = markers[0];
  const markerId = marker.getAttribute("id");
  const line = required<SVGPathElement>(group, '[data-slot="trace-line"][marker-end]', `${what} — the path carrying marker-end`);
  const ref = line.getAttribute("marker-end") ?? "";
  if (!markerId || !ref.includes(markerId)) {
    throw new Error(`${what} — marker-end="${ref}" does not reference the rendered marker id="${markerId}"`);
  }
  return marker;
}

/**
 * The head's tip within 2px of the geometry's OWN pulled-back `to` (captured
 * live via `onGeometry`, never assumed), with orientation within 5° of the
 * arrival direction — sampled off the rendered path itself
 * (`getPointAtLength`), the same discipline `TracePolarity.stories.tsx`
 * already established for this exact class of claim.
 */
function expectHeadAtTerminal(svg: SVGSVGElement, line: SVGPathElement, geometry: TraceGeometry, what: string): void {
  const total = line.getTotalLength();
  const tip = toScreen(svg, line.getPointAtLength(total).x, line.getPointAtLength(total).y);
  const terminal = toScreen(svg, geometry.end.x, geometry.end.y);
  const dist = Math.hypot(tip.x - terminal.x, tip.y - terminal.y);
  if (!(dist <= 2)) {
    throw new Error(`${what} — head tip (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}) is ${dist.toFixed(2)}px from the geometry's own pulled-back terminal (want ≤2px)`);
  }

  // Approach tangent: the vector from a point just short of the end to the
  // end itself, compared to the terminal's declared arrival direction.
  const sampleAt = Math.max(0, total - 1);
  const before = toScreen(svg, line.getPointAtLength(sampleAt).x, line.getPointAtLength(sampleAt).y);
  const approach = { x: tip.x - before.x, y: tip.y - before.y };
  if (Math.hypot(approach.x, approach.y) < 0.01) return; // degenerate (near-zero-length) sample; nothing to measure
  const approachAngle = angleOf(approach);
  const wantAngle = angleOf(DIR_VECTOR[geometry.end.dir]);
  const delta = angleDelta(approachAngle, wantAngle);
  if (!(delta <= 5)) {
    throw new Error(`${what} — approach angle ${approachAngle.toFixed(1)}° is ${delta.toFixed(1)}° off the arrival direction ${geometry.end.dir} (${wantAngle}°), want ≤5°`);
  }
}

/* ------------------------------------------------------------------ */
/* The matrix — every routing × every one of Zach's five style names    */
/* (Trace.stories.tsx's own table, restated: this file is the arrowhead */
/* claim, not a second style catalogue).                                */
/* ------------------------------------------------------------------ */

const ROUTINGS: TraceRouting[] = ["straight", "slanted", "curved", "elbow"];

interface StyleCell {
  key: string;
  // `TraceRouteProps`, not `TraceBody`'s own `TraceProps` — that one
  // inherits the RAW SVG `from`/`to` SMIL attributes (`string | number`),
  // and spreading it after an explicit `from`/`to` union-poisons them.
  props: Partial<TraceRouteProps> & { variant?: TraceVariant };
}

const STYLES: StyleCell[] = [
  { key: "data", props: { variant: "data" } },
  { key: "async", props: { variant: "async" } },
  { key: "animated", props: { variant: "data", animated: true } },
  { key: "red", props: { variant: "data", color: "var(--destructive)" } },
  { key: "delayed", props: { variant: "delayed" } },
];

const ROW_W = 220;
const ROW_H = 70;
const FROM = { x: 24, y: ROW_H / 2, dir: "right" as TraceDir };
const TO = { x: ROW_W - 24, y: ROW_H / 2, dir: "right" as TraceDir };

function MatrixCell({ routing, style, onGeometry }: { routing: TraceRouting; style: StyleCell; onGeometry: (g: TraceGeometry) => void }) {
  const id = `arrow-${routing}-${style.key}`;
  return (
    <div data-slot="arrow-cell" data-cell={id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
        {routing} · {style.key}
      </div>
      <svg data-slot="trace-canvas" width={ROW_W} height={ROW_H} viewBox={`0 0 ${ROW_W} ${ROW_H}`} style={{ overflow: "visible" }}>
        <Trace id={id} from={FROM} to={TO} routing={routing} onGeometry={onGeometry} {...style.props} />
      </svg>
    </div>
  );
}

function ArrowheadMatrix({ onGeometry }: { onGeometry: (id: string, g: TraceGeometry) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "24px 32px" }}>
      {ROUTINGS.flatMap((routing) =>
        STYLES.map((style) => (
          <MatrixCell key={`${routing}-${style.key}`} routing={routing} style={style} onGeometry={(g) => onGeometry(`arrow-${routing}-${style.key}`, g)} />
        )),
      )}
    </div>
  );
}

const meta = {
  title: "Blocks/TraceArrowhead",
  component: Trace,
  args: { id: "trace", from: FROM, to: TO },
} satisfies Meta<typeof Trace>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* Matrix — every routing × variant, tip + orientation                  */
/* ==================================================================== */

export const Matrix: Story = {
  render: () => {
    const geometries = new Map<string, TraceGeometry>();
    (window as unknown as { __arrowGeometries: Map<string, TraceGeometry> }).__arrowGeometries = geometries;
    return <ArrowheadMatrix onGeometry={(id, g) => geometries.set(id, g)} />;
  },
  play: async ({ canvasElement }) => {
    const geometries = (window as unknown as { __arrowGeometries?: Map<string, TraceGeometry> }).__arrowGeometries;
    if (!geometries) throw new Error("geometry capture map missing");

    for (const routing of ROUTINGS) {
      for (const style of STYLES) {
        const id = `arrow-${routing}-${style.key}`;
        const cell = required<HTMLElement>(canvasElement, `[data-cell="${id}"]`, `the ${id} cell`);
        await waitFor(() => expect(geometries.has(id)).toBe(true));
        const svg = required<SVGSVGElement>(cell, '[data-slot="trace-canvas"]', `${id} svg`);
        const group = required<SVGGElement>(cell, '[data-slot="trace"]', `${id} trace group`);

        expectExactlyOneMarker(group, id);

        // For a `delayed`+split-by-default? No — this matrix never sets
        // `splitAtLabel`, so exactly one visible line per cell.
        const line = required<SVGPathElement>(group, '[data-slot="trace-line"][marker-end]', `${id} — the marker-carrying line`);
        const geometry = geometries.get(id)!;
        expectHeadAtTerminal(svg, line, geometry, id);
      }
    }
  },
};

/* ==================================================================== */
/* DelayedSplit — the likeliest gap named in the plan: which SEGMENT    */
/* actually carries the marker when `delayed` + `splitAtLabel` draws     */
/* two paths.                                                            */
/* ==================================================================== */

export const DelayedSplit: Story = {
  render: () => (
    <svg data-slot="trace-canvas" width={ROW_W} height={ROW_H} viewBox={`0 0 ${ROW_W} ${ROW_H}`} style={{ overflow: "visible" }}>
      <Trace id="delayed-split" from={FROM} to={TO} routing="straight" variant="delayed" splitAtLabel labelPosition={0.4} />
    </svg>
  ),
  play: async ({ canvasElement }) => {
    const group = required<SVGGElement>(canvasElement, '[data-slot="trace"][data-split="true"]', "the split trace group");
    const segments = group.querySelectorAll<SVGPathElement>('[data-slot="trace-line"]');
    await expect(segments).toHaveLength(2);

    const before = required<SVGPathElement>(group, '[data-trace-segment="before"]', "the before segment");
    const after = required<SVGPathElement>(group, '[data-trace-segment="after"]', "the after (terminal) segment");

    // The marker lives on the TERMINAL segment only — `before` bare.
    await expect(before.getAttribute("marker-end")).toBeNull();
    await expect(after.getAttribute("marker-end")).not.toBeNull();

    const markers = group.querySelectorAll("marker");
    await expect(markers).toHaveLength(1);
  },
};
