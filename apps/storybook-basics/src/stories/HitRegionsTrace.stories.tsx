/**
 * Hit Regions/Trace — the invisible 12px hit band (`TRACE_HIT_STROKE_PX`,
 * trace.tsx:131), painted, probed, and adjustable.
 *
 * Two findings this file makes visible:
 *  - a NON-interactive Trace still has a 2px implicit hit region — the
 *    visible ink itself (SVG `pointer-events: visiblePainted` hit-tests
 *    the stroke), which is exactly the "really thin" clickable edge the
 *    pyblocks hit-regions report opened with;
 *  - the `vectorEffect="non-scaling-stroke"` prop reaches the INK only,
 *    never the hit path — a host using it gets screen-constant ink over a
 *    scene-scaling hit band.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { TRACE_HIT_STROKE_PX, TraceBody } from "../components/trace";
import {
  Checkbox,
  ConstantSlider,
  HitProbe,
  PolicyControl,
  ZoomControl,
  ZoomStage,
  hitTargetAt,
  type HitTarget,
} from "../hitRegions/harness";
import { effectiveHitValue, type HitPolicy } from "../hitRegions/hitPolicy";

const meta = {
  title: "Hit Regions/Trace",
  tags: ["area:hit-regions", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TRACE_TARGETS: HitTarget[] = [
  { label: "hit band", selector: '[data-slot="trace-hit"]' },
  { label: "ink (the visible stroke)", selector: '[data-slot="trace-line"]' },
];

const SVG_W = 340;
const SVG_H = 120;
const LINE_Y = 60;
const TRACE_PATH = `M 20 ${LINE_Y} L ${SVG_W - 20} ${LINE_Y}`;
const TRACE_POINTS = [
  { x: 20, y: LINE_Y },
  { x: SVG_W - 20, y: LINE_Y },
];

function TraceHitPlayground() {
  const [show, setShow] = useState(true);
  const [interactive, setInteractive] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  const [hitPx, setHitPx] = useState(TRACE_HIT_STROKE_PX);
  const effective = effectiveHitValue(hitPx, zoom, policy);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <Checkbox label="Interactive (mount the hit path)" checked={interactive} onChange={setInteractive} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <ConstantSlider
        name="TRACE_HIT_STROKE_PX"
        source="trace.tsx:131"
        value={hitPx}
        defaultValue={TRACE_HIT_STROKE_PX}
        min={2}
        max={48}
        onChange={setHitPx}
      />
      <HitProbe targets={TRACE_TARGETS}>
        <ZoomStage zoom={zoom} width={SVG_W} height={SVG_H}>
          <svg data-testid="trace-stage" width={SVG_W} height={SVG_H} style={{ display: "block" }}>
            <TraceBody
              id="hit-regions-trace"
              path={TRACE_PATH}
              points={TRACE_POINTS}
              variant="data"
              interactive={interactive}
              hitStrokePx={effective}
              showHitRegion={show}
            />
          </svg>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <TraceHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });
    const svg = canvasElement.querySelector('[data-testid="trace-stage"]');
    if (!(svg instanceof SVGSVGElement)) throw new Error("expected the trace stage svg");
    const svgRect = () => svg.getBoundingClientRect();
    const centerlineY = () => svgRect().top + LINE_Y;
    const midX = () => svgRect().left + SVG_W / 2;

    // K2 — the band is ±6 around the centerline at the default 12:
    // just inside hits the hit path, just outside misses everything.
    const half = TRACE_HIT_STROKE_PX / 2;
    await expect(hitTargetAt(midX(), centerlineY() - (half - 1), TRACE_TARGETS)?.label).toBe("hit band");
    await expect(hitTargetAt(midX(), centerlineY() - (half + 2), TRACE_TARGETS)).toBeNull();
    await expect(hitTargetAt(midX(), centerlineY() + (half - 1), TRACE_TARGETS)?.label).toBe("hit band");
    await expect(hitTargetAt(midX(), centerlineY() + (half + 2), TRACE_TARGETS)).toBeNull();

    // K4 — the slider widens and narrows the REAL band. The same probe
    // point flips from miss to hit when the band grows past it, and back:
    const probeY = () => centerlineY() - 11; // 11 > 6, 11 < 12
    await expect(hitTargetAt(midX(), probeY(), TRACE_TARGETS)).toBeNull();
    const slider = canvas.getByLabelText("TRACE_HIT_STROKE_PX");
    await fireEvent.change(slider, { target: { value: "24" } });
    await waitFor(async () => {
      expect(hitTargetAt(midX(), probeY(), TRACE_TARGETS)?.label).toBe("hit band");
    });
    await fireEvent.change(slider, { target: { value: String(TRACE_HIT_STROKE_PX) } });
    await waitFor(async () => {
      expect(hitTargetAt(midX(), probeY(), TRACE_TARGETS)).toBeNull();
    });

    // K5 — the overlay is pure paint: the hit path's stroke colour is the
    // ONLY thing that changes, and hit-testing is identical off.
    const hitPath = svg.querySelector('[data-slot="trace-hit"]');
    if (!(hitPath instanceof SVGPathElement)) throw new Error("expected the hit path");
    const paintedWidth = hitPath.getAttribute("stroke-width");
    await userEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => expect(hitPath.getAttribute("stroke")).toBe("transparent"));
    await expect(hitPath.getAttribute("stroke-width")).toBe(paintedWidth);
    await expect(hitPath.getAttribute("d")).toBe(TRACE_PATH);
    await expect(hitTargetAt(midX(), centerlineY() - (half - 1), TRACE_TARGETS)?.label).toBe("hit band");
    await expect(hitTargetAt(midX(), centerlineY() - (half + 2), TRACE_TARGETS)).toBeNull();
    await userEvent.click(canvas.getByLabelText("Show hit regions"));

    // The finding: interactive OFF removes the band entirely, but the 2px
    // INK is still an implicit hit region — SVG hit-tests visible strokes.
    await userEvent.click(canvas.getByLabelText("Interactive (mount the hit path)"));
    await waitFor(() => expect(svg.querySelector('[data-slot="trace-hit"]')).toBeNull());
    await expect(hitTargetAt(midX(), centerlineY() - 5, TRACE_TARGETS)).toBeNull();
    const onInk = hitTargetAt(midX(), centerlineY(), TRACE_TARGETS);
    await expect(onInk?.label).toBe("ink (the visible stroke)");
    await userEvent.click(canvas.getByLabelText("Interactive (mount the hit path)"));
  },
};

/**
 * K3 — the band under a real viewport transform, measured by probing
 * outward from the centerline in 1px screen steps until the browser's hit
 * test misses. Scene policy (what the components implement today): 6
 * screen px at 0.5× — under any usable pointer target — and 48 at 4×.
 * Screen policy: 12 at both.
 */
const BAND_CASES = ([0.5, 4] as const).flatMap((zoom) =>
  (["scene", "screen"] as const).map((policy) => ({ zoom, policy })),
);

/** Every cell gets the SAME screen footprint (260×80), so a 4× cell is a
 * closer look at the same-length-on-screen cable rather than a huge void:
 * the scene box is footprint/zoom, and the path spans it edge to edge. */
const BAND_CELL_W = 260;
const BAND_CELL_H = 80;

function bandCellScene(zoom: number) {
  const w = BAND_CELL_W / zoom;
  const h = BAND_CELL_H / zoom;
  const inset = 12 / zoom;
  return { w, h, path: `M ${inset} ${h / 2} L ${w - inset} ${h / 2}`, points: [
    { x: inset, y: h / 2 },
    { x: w - inset, y: h / 2 },
  ] };
}

function TraceZoomPolicies() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {BAND_CASES.map(({ zoom, policy }) => {
        const scene = bandCellScene(zoom);
        return (
          <div key={`${policy}-${zoom}`} style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, width: 190 }}>
              {policy} · {zoom}× → {policy === "scene" ? TRACE_HIT_STROKE_PX * zoom : TRACE_HIT_STROKE_PX}px band
            </span>
            <div data-testid={`band-${policy}-${zoom}`}>
              <ZoomStage zoom={zoom} width={scene.w} height={scene.h}>
                <svg width={scene.w} height={scene.h} style={{ display: "block" }}>
                  <TraceBody
                    id={`hit-band-${policy}-${zoom}`}
                    path={scene.path}
                    points={scene.points}
                    interactive
                    hitStrokePx={effectiveHitValue(TRACE_HIT_STROKE_PX, zoom, policy)}
                    showHitRegion
                  />
                </svg>
              </ZoomStage>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const ZoomPolicies: Story = {
  render: () => <TraceZoomPolicies />,
  play: async ({ canvasElement }) => {
    const measured: Record<string, number> = {};
    for (const { zoom, policy } of BAND_CASES) {
      const cell = canvasElement.querySelector(`[data-testid="band-${policy}-${zoom}"]`);
      if (!(cell instanceof HTMLElement)) throw new Error(`missing band cell ${policy}-${zoom}`);
      cell.scrollIntoView({ block: "center" });
      const svg = cell.querySelector("svg");
      if (!(svg instanceof SVGSVGElement)) throw new Error("expected the band svg");
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + BAND_CELL_W / 2;
      const cy = rect.top + BAND_CELL_H / 2;
      // Walk outward until the hit test misses; the last hit is the band's
      // half-width in SCREEN px.
      let lastHit = -1;
      for (let dy = 0; dy <= 40; dy += 1) {
        if (hitTargetAt(cx, cy + dy, [{ label: "trace", selector: '[data-slot="trace"]' }]) != null) lastHit = dy;
        else break;
      }
      const measuredBand = (lastHit + 1) * 2 - 1; // symmetric band, 1px steps
      const expectedBand = policy === "scene" ? TRACE_HIT_STROKE_PX * zoom : TRACE_HIT_STROKE_PX;
      measured[`${policy}-${zoom}`] = measuredBand;
      await expect(Math.abs(measuredBand - expectedBand)).toBeLessThanOrEqual(3);
    }
    // Non-vacuity of the measurement itself: the two policies MUST read
    // differently at 4× — if they don't, the probe is measuring nothing.
    await expect(Math.abs(measured["scene-4"] - measured["screen-4"])).toBeGreaterThan(20);
  },
};
