/**
 * Hit Regions/LabeledPort — the composite owns TWO pointer targets: the
 * dot's 40px halo (Port's `PORT_HIT_PX`) and the label's click-to-edit
 * box. The second is an IMPLICIT region — no named constant; the target is
 * the label's own rendered box, so it grows and shrinks with the text.
 * That asymmetry (one designed number, one accidental box) is the finding
 * this story exists to show.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { LabeledPort } from "../labeledPort";
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
import { effectiveHitValue, type HitPolicy } from "../../scene/hitPolicy";

const meta = {
  title: "Hit Regions/LabeledPort",
  tags: ["area:hit-regions", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TARGETS: HitTarget[] = [
  { label: "label (click to edit)", selector: '[data-slot="port-label"]' },
  { label: "port (dot + halo)", selector: '[data-slot="port-dot"]' },
];

const STAGE_W = 380;
const STAGE_H = 150;

function LabeledPortHitPlayground() {
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
      <HitProbe targets={TARGETS}>
        <ZoomStage zoom={zoom} width={STAGE_W} height={STAGE_H}>
          <div
            data-testid="labeled-row"
            style={{ display: "flex", gap: 120, alignItems: "center", padding: "60px 70px", width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}
          >
            <LabeledPort edge="left" state="wired" diameter="md" textLayout="right" hitPx={effective} showHitRegion={show}>
              value_data
            </LabeledPort>
            {/* Disabled twin: no click handler on its label, so no region
                is painted there — the overlay refuses to show a target
                that does not exist. */}
            <LabeledPort
              data-testid="disabled-port"
              edge="left"
              state="empty"
              diameter="md"
              textLayout="right"
              disabled
              hitPx={effective}
              showHitRegion={show}
            >
              read_only
            </LabeledPort>
          </div>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <LabeledPortHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });
    const row = canvasElement.querySelector('[data-testid="labeled-row"]');
    if (!(row instanceof HTMLElement)) throw new Error("expected the labeled row");
    const editable = row.querySelector('[data-slot="port"][data-state="wired"]');
    if (!(editable instanceof HTMLElement)) throw new Error("expected the editable LabeledPort");

    // Target 1 — the dot's halo, same contract Port's own story verifies.
    const halo = editable.querySelector('[data-slot="port-dot-halo"]');
    if (!(halo instanceof HTMLElement)) throw new Error("expected the halo");
    const haloRect = halo.getBoundingClientRect();
    await expect(haloRect.width).toBeCloseTo(PORT_HIT_PX, 1);
    const cy = haloRect.top + haloRect.height / 2;
    await expect(hitTargetAt(haloRect.left + 2, cy, TARGETS)?.label).toBe("port (dot + halo)");
    await expect(hitTargetAt(haloRect.left - 3, cy, TARGETS)).toBeNull();

    // Target 2 — the label's box IS the click-to-edit region (implicit,
    // no constant): inside hits, just below misses.
    const label = editable.querySelector('[data-slot="port-label"]');
    if (!(label instanceof HTMLElement)) throw new Error("expected the label");
    const labelRect = label.getBoundingClientRect();
    const labelCx = labelRect.left + labelRect.width / 2;
    await expect(hitTargetAt(labelCx, labelRect.top + labelRect.height / 2, TARGETS)?.label).toBe(
      "label (click to edit)",
    );
    await expect(hitTargetAt(labelCx, labelRect.bottom + 4, TARGETS)).toBeNull();
    // Painted, because it is editable:
    await expect(getComputedStyle(label).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

    // The disabled twin paints NO label region — there is no handler, so
    // there is no region to show.
    const disabled = canvasElement.querySelector('[data-testid="disabled-port"] [data-slot="port-label"]');
    if (!(disabled instanceof HTMLElement)) throw new Error("expected the disabled label");
    await expect(getComputedStyle(disabled).backgroundColor).toBe("rgba(0, 0, 0, 0)");

    // K4 — the slider drives the dot's halo through the composite.
    const slider = canvas.getByLabelText("PORT_HIT_PX");
    await fireEvent.change(slider, { target: { value: "56" } });
    await waitFor(() => expect(halo.getBoundingClientRect().width).toBeCloseTo(56, 1));
    await fireEvent.change(slider, { target: { value: String(PORT_HIT_PX) } });
    await waitFor(() => expect(halo.getBoundingClientRect().width).toBeCloseTo(PORT_HIT_PX, 1));

    // K5 — overlay off: geometry of every slot identical, hit unchanged.
    const slots = () =>
      Array.from(row.querySelectorAll("[data-slot]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { slot: el.getAttribute("data-slot"), x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const before = slots();
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => expect(getComputedStyle(halo).backgroundColor).toBe("rgba(0, 0, 0, 0)"));
    await expect(slots()).toEqual(before);
    await expect(hitTargetAt(haloRect.left + 2, cy, TARGETS)?.label).toBe("port (dot + halo)");
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
  },
};
