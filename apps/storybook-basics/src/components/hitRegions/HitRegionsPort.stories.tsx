/**
 * Hit Regions/Port — the 40px halo (`PORT_HIT_PX`, port.layout.ts:58),
 * visible, probed live, and adjustable.
 *
 * WHY a `Hit Regions/` top-level group rather than stories beside each
 * component: the whole point is comparing ONE treatment (region painted on
 * the real hit element + zoom + policy + slider) across every component,
 * on a shared harness — the same reason `Presets/` is its own section.
 * It also keeps this lane's story files adds-only: the per-component
 * story files belong to their own lanes and are not touched.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { PORT_STATES, Port } from "../port";
import { PORT_HIT_PX } from "../port.layout";
import {
  Checkbox,
  ConstantSlider,
  HitProbe,
  PolicyControl,
  ZoomControl,
  ZoomStage,
  hitTargetAt,
  type HitTarget,
} from "./harness.fixture";
import { ZOOM_LEVELS, effectiveHitValue, screenHitValue, type HitPolicy } from "../../scene/hitPolicy";

const meta = {
  title: "Components/Ports/Port/Hit Regions",
  tags: ["object:port", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PORT_TARGETS: HitTarget[] = [{ label: "port (dot + 40px halo)", selector: '[data-slot="port-dot"]' }];

/** Scene-space stage box; generous so a grown halo never leaves it. */
const STAGE_W = 420;
const STAGE_H = 150;

function PortHitPlayground() {
  const [show, setShow] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  const [hitPx, setHitPx] = useState(PORT_HIT_PX);
  const effective = effectiveHitValue(hitPx, zoom, policy);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <ConstantSlider
        name="PORT_HIT_PX"
        source="port.layout.ts:58"
        value={hitPx}
        defaultValue={PORT_HIT_PX}
        min={8}
        max={80}
        onChange={setHitPx}
      />
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)" }}>
        component receives hitPx={effective.toFixed(1)} → {screenHitValue(hitPx, zoom, policy).toFixed(1)}px on screen
      </div>
      <HitProbe targets={PORT_TARGETS}>
        <ZoomStage zoom={zoom} width={STAGE_W} height={STAGE_H}>
          <div
            data-testid="port-row"
            style={{ display: "flex", gap: 88, alignItems: "center", padding: "55px 70px", width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}
          >
            {PORT_STATES.map((state) => (
              <Port key={state} state={state} diameter="md" hitPx={effective} showHitRegion={show} />
            ))}
          </div>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <PortHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });

    const dot = canvasElement.querySelector('[data-slot="port-dot"][data-state="wired"]');
    if (!(dot instanceof HTMLElement)) throw new Error("expected the wired port dot");
    const halo = dot.querySelector('[data-slot="port-dot-halo"]');
    if (!(halo instanceof HTMLElement)) throw new Error("expected the halo span");

    // The halo is the constant: 40px across at the default slider value.
    let rect = halo.getBoundingClientRect();
    await expect(rect.width).toBeCloseTo(PORT_HIT_PX, 1);
    await expect(rect.height).toBeCloseTo(PORT_HIT_PX, 1);

    // K2 — the DRAWN region matches the ACTUAL hit target. Probing with the
    // browser's own hit test (elementsFromPoint), just inside and just
    // outside the circle's horizontal extreme:
    const cy = rect.top + rect.height / 2;
    const hitInside = hitTargetAt(rect.left + 2, cy, PORT_TARGETS);
    const hitOutside = hitTargetAt(rect.left - 3, cy, PORT_TARGETS);
    await expect(hitInside?.label ?? null).toBe("port (dot + 40px halo)");
    await expect(hitOutside).toBeNull();
    // ...and the region is a CIRCLE (rounded-full clips hit-testing): the
    // rect's corner is inside the box but outside the disc.
    await expect(hitTargetAt(rect.left + 3, rect.top + 3, PORT_TARGETS)).toBeNull();

    // K4 — the slider changes the real region live, in both directions.
    const slider = canvas.getByLabelText("PORT_HIT_PX");
    await fireEvent.change(slider, { target: { value: "60" } });
    await waitFor(() => expect(halo.getBoundingClientRect().width).toBeCloseTo(60, 1));
    await expect(hitTargetAt(halo.getBoundingClientRect().left + 2, cy, PORT_TARGETS)).not.toBeNull();
    await fireEvent.change(slider, { target: { value: "24" } });
    await waitFor(() => expect(halo.getBoundingClientRect().width).toBeCloseTo(24, 1));
    await fireEvent.change(slider, { target: { value: String(PORT_HIT_PX) } });
    await waitFor(() => expect(halo.getBoundingClientRect().width).toBeCloseTo(PORT_HIT_PX, 1));

    // K5 — toggling the overlay off changes no geometry AND no hit
    // behaviour (the halo is the hit element whether or not it is painted).
    const slots = () =>
      Array.from(canvasElement.querySelectorAll('[data-testid="port-row"] [data-slot]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { slot: el.getAttribute("data-slot"), x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const withOverlay = slots();
    await userEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => {
      const style = getComputedStyle(halo);
      expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    });
    const withoutOverlay = slots();
    await expect(withoutOverlay).toEqual(withOverlay);
    // Hit test unchanged with the overlay off:
    rect = halo.getBoundingClientRect();
    await expect(hitTargetAt(rect.left + 2, rect.top + rect.height / 2, PORT_TARGETS)).not.toBeNull();
    await expect(hitTargetAt(rect.left - 3, rect.top + rect.height / 2, PORT_TARGETS)).toBeNull();
    await userEvent.click(canvas.getByLabelText("Show hit regions"));
  },
};

/**
 * K3 — the zoom question, measured. One cell per (zoom, policy): the same
 * Port under a real CSS viewport transform. Scene policy: the region is
 * 20 screen px at 0.5× and 160 at 4×. Screen policy: 40 at both, because
 * the host divided the constant by its zoom. TODAY the components
 * implement the scene column — no zoom compensation exists anywhere in
 * `src/components` — and the screen column is what a host builds with
 * `effectiveHitValue`.
 */
const POLICY_CASES = ([0.5, 4] as const).flatMap((zoom) =>
  (["scene", "screen"] as const).map((policy) => ({ zoom, policy })),
);

/** Every cell gets the SAME 200px screen footprint — the scene box is
 * 200/zoom, so a 4× cell doesn't reserve a 720px void around one port. */
const CELL_SCREEN_PX = 200;

function PortZoomPolicies() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {POLICY_CASES.map(({ zoom, policy }) => (
        <div key={`${policy}-${zoom}`} style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, width: 190 }}>
            {policy} · {zoom}× → {screenHitValue(PORT_HIT_PX, zoom, policy)}px on screen
          </span>
          <div data-testid={`cell-${policy}-${zoom}`} data-zoom={zoom} data-policy={policy}>
            <ZoomStage zoom={zoom} width={CELL_SCREEN_PX / zoom} height={CELL_SCREEN_PX / zoom}>
              <div
                style={{
                  width: CELL_SCREEN_PX / zoom,
                  height: CELL_SCREEN_PX / zoom,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Port state="wired" diameter="md" hitPx={effectiveHitValue(PORT_HIT_PX, zoom, policy)} showHitRegion />
              </div>
            </ZoomStage>
          </div>
        </div>
      ))}
    </div>
  );
}

export const ZoomPolicies: Story = {
  render: () => <PortZoomPolicies />,
  play: async ({ canvasElement }) => {
    for (const { zoom, policy } of POLICY_CASES) {
      const cell = canvasElement.querySelector(`[data-testid="cell-${policy}-${zoom}"]`);
      if (!(cell instanceof HTMLElement)) throw new Error(`missing cell ${policy}-${zoom}`);
      cell.scrollIntoView({ block: "center" });
      const halo = cell.querySelector('[data-slot="port-dot-halo"]');
      if (!(halo instanceof HTMLElement)) throw new Error("expected a halo");
      const rect = halo.getBoundingClientRect();
      const expected = screenHitValue(PORT_HIT_PX, zoom, policy);
      await expect(rect.width).toBeCloseTo(expected, 0);
      // The region is REAL at that screen size, not just painted: probe the
      // browser's hit test just inside and just outside. The margin scales
      // with zoom so it stays a real distance in SCENE space too — at 4× a
      // 3-screen-px margin is only 0.75 scene px, inside the hit test's
      // boundary rounding on a transformed circle (measured: it reads HIT).
      const eps = Math.max(2, 2 * zoom);
      const cy = rect.top + rect.height / 2;
      await expect(hitTargetAt(rect.left + eps, cy, PORT_TARGETS)).not.toBeNull();
      await expect(hitTargetAt(rect.left - eps, cy, PORT_TARGETS)).toBeNull();
    }
    // The two policies genuinely diverge away from 1× — the metric can
    // move (today's components are the scene row; see the doc above).
    await expect(screenHitValue(PORT_HIT_PX, 4, "scene")).not.toBe(screenHitValue(PORT_HIT_PX, 4, "screen"));
    // All four zoom stops exist for the interactive story's control.
    await expect(ZOOM_LEVELS).toEqual([0.5, 1, 2, 4]);
  },
};
