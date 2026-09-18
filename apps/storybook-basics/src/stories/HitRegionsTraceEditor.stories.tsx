/**
 * Hit Regions/TraceEditor — the grab circles: terminals at an invisible
 * r=13 (`TERMINAL_HANDLE_HIT_RADIUS`, traceEditor.tsx:94), bends at r=4
 * and virtual midpoints at r=3 (traceEditor.tsx:89-90) — where the drawn
 * circle IS the whole hit target. That last fact is the finding: a
 * 6-8px-diameter pointer target at 1×, well under any usable touch size.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { TraceEditor } from "../components/traceEditor";
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
  title: "Hit Regions/TraceEditor",
  tags: ["area:hit-regions", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor's own constant — deliberately re-stated here so the story
 * FAILS if the component's default drifts from what this page documents
 * (same trick the provenance tests use). */
const TERMINAL_HIT_RADIUS_DOCUMENTED = 13;

const EDITOR_TARGETS: HitTarget[] = [
  { label: "terminal grab circle", selector: '[data-handle-kind="terminal"]' },
  { label: "bend handle", selector: '[data-handle-kind="bend"]' },
  { label: "virtual midpoint handle", selector: '[data-handle-kind="virtual"]' },
  { label: "trace hit band", selector: '[data-slot="trace-hit"]' },
];

const SVG_W = 420;
const SVG_H = 220;

function TraceEditorHitPlayground() {
  const [show, setShow] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  const [terminalRadius, setTerminalRadius] = useState(TERMINAL_HIT_RADIUS_DOCUMENTED);
  const effective = effectiveHitValue(terminalRadius, zoom, policy);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <ConstantSlider
        name="TERMINAL_HANDLE_HIT_RADIUS"
        source="traceEditor.tsx:94"
        value={terminalRadius}
        defaultValue={TERMINAL_HIT_RADIUS_DOCUMENTED}
        min={3}
        max={32}
        onChange={setTerminalRadius}
      />
      <HitProbe targets={EDITOR_TARGETS}>
        <ZoomStage zoom={zoom} width={SVG_W} height={SVG_H}>
          <svg data-testid="editor-stage" width={SVG_W} height={SVG_H} style={{ display: "block" }}>
            <TraceEditor
              id="hit-regions-editor"
              from={{ x: 60, y: 160, dir: "right" }}
              to={{ x: 360, y: 60, dir: "right" }}
              routing="straight"
              defaultBends={[{ t: 0.5, o: 40 }]}
              revealed
              showHitRegion={show}
              terminalHitRadius={effective}
            />
          </svg>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <TraceEditorHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });
    const svg = canvasElement.querySelector('[data-testid="editor-stage"]');
    if (!(svg instanceof SVGSVGElement)) throw new Error("expected the editor stage");

    const terminal = svg.querySelector('[data-slot="trace-handle"][data-handle-kind="terminal"]');
    if (!(terminal instanceof SVGCircleElement)) throw new Error("expected a terminal handle");

    // The invisible grab circle is r=13 — wider than the drawn glyph (9).
    let rect = terminal.getBoundingClientRect();
    await expect(rect.width).toBeCloseTo(TERMINAL_HIT_RADIUS_DOCUMENTED * 2, 1);

    // K2 — probe the real hit test just inside and just outside the
    // circle, horizontally away from the wire so only the circle answers.
    const center = () => {
      const r = terminal.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    };
    let c = center();
    await expect(hitTargetAt(c.x - (c.r - 2), c.y, EDITOR_TARGETS)?.label).toBe("terminal grab circle");
    const outside = hitTargetAt(c.x - (c.r + 3), c.y, EDITOR_TARGETS);
    await expect(outside?.label ?? null).not.toBe("terminal grab circle");

    // The bend handle: its painted r=4 circle IS the whole target.
    const bend = svg.querySelector('[data-handle-kind="bend"]');
    if (!(bend instanceof SVGCircleElement)) throw new Error("expected a bend handle");
    const bendRect = bend.getBoundingClientRect();
    await expect(bendRect.width).toBeCloseTo(8, 1);
    const bendCenter = { x: bendRect.left + bendRect.width / 2, y: bendRect.top + bendRect.height / 2 };
    await expect(hitTargetAt(bendCenter.x, bendCenter.y, EDITOR_TARGETS)?.label).toBe("bend handle");
    // 8px out is past the bend circle — whatever answers, it is not the bend.
    await expect(hitTargetAt(bendCenter.x, bendCenter.y - 8, EDITOR_TARGETS)?.label ?? null).not.toBe("bend handle");

    // K4 — the slider resizes the REAL terminal circle, both directions.
    const slider = canvas.getByLabelText("TERMINAL_HANDLE_HIT_RADIUS");
    await fireEvent.change(slider, { target: { value: "24" } });
    await waitFor(() => expect(terminal.getBoundingClientRect().width).toBeCloseTo(48, 1));
    c = center();
    await expect(hitTargetAt(c.x - (c.r - 2), c.y, EDITOR_TARGETS)?.label).toBe("terminal grab circle");
    await fireEvent.change(slider, { target: { value: "6" } });
    await waitFor(() => expect(terminal.getBoundingClientRect().width).toBeCloseTo(12, 1));
    await fireEvent.change(slider, { target: { value: String(TERMINAL_HIT_RADIUS_DOCUMENTED) } });
    await waitFor(() =>
      expect(terminal.getBoundingClientRect().width).toBeCloseTo(TERMINAL_HIT_RADIUS_DOCUMENTED * 2, 1),
    );

    // K5 — the overlay adds paint-only circles (pointer-events: none) and
    // moves nothing: every handle's rect is identical with it off.
    const handleRects = () =>
      Array.from(svg.querySelectorAll('[data-slot="trace-handle"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.getAttribute("data-handle-kind"), x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const withOverlay = handleRects();
    const paintCircles = svg.querySelectorAll('[data-slot="trace-handle-hit-region"]');
    await expect(paintCircles.length).toBeGreaterThan(0);
    for (const paint of paintCircles) {
      await expect(getComputedStyle(paint).pointerEvents).toBe("none");
    }
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => expect(svg.querySelectorAll('[data-slot="trace-handle-hit-region"]')).toHaveLength(0));
    await expect(handleRects()).toEqual(withOverlay);
    // Hit behaviour identical with the overlay off:
    c = center();
    await expect(hitTargetAt(c.x - (c.r - 2), c.y, EDITOR_TARGETS)?.label).toBe("terminal grab circle");
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
  },
};
