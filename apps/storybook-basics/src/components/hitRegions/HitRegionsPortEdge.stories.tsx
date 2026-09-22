/**
 * Components/Ports/PortEdge/Hit Regions — the rail itself has no hit region of its own: a
 * layout container whose pointer targets are the things it lays out. The
 * ports it renders carry Port's 40px halo (`PORT_HIT_PX`); the dnd-kit
 * drag surface is each member's own DOM box. This story paints the port
 * halos INSIDE the rail via the `renderItem` seam — the same seam a host
 * would use — so nothing in portEdge.tsx itself had to change.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { LabeledPort } from "../labeledPort";
import { PortEdge, type PortEdgeItem } from "../portEdge";
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
  title: "Components/Ports/PortEdge/Hit Regions",
  tags: ["object:port", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TARGETS: HitTarget[] = [
  { label: "port (dot + halo)", selector: '[data-slot="port-dot"]' },
  { label: "member box (the drag surface)", selector: '[data-slot="port-edge-member"]' },
];

const ITEMS: PortEdgeItem[] = [
  { id: "rows", label: "rows", state: "wired" },
  { id: "window", label: "window", state: "empty" },
  { id: "out", label: "out", state: "received" },
];

const STAGE_W = 380;
const STAGE_H = 400;

function PortEdgeHitPlayground() {
  const [show, setShow] = useState(true);
  const [showCard, setShowCard] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  const [hitPx, setHitPx] = useState(PORT_HIT_PX);
  const effective = effectiveHitValue(hitPx, zoom, policy);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <Checkbox label="Show dnd-kit card" checked={showCard} onChange={setShowCard} />
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
          <div style={{ padding: "40px 120px", width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}>
            <PortEdge
              edge="left"
              items={ITEMS}
              showPorts
              showCard={showCard}
              renderItem={(item, ctx) => (
                <LabeledPort
                  edge="left"
                  state={item.state ?? "empty"}
                  diameter="md"
                  textLayout={ctx.textLayout}
                  disabled
                  hitPx={effective}
                  showHitRegion={show}
                >
                  {item.label}
                </LabeledPort>
              )}
            />
          </div>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <PortEdgeHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });

    // Every port in the rail carries the painted 40px halo.
    const halos = Array.from(canvasElement.querySelectorAll('[data-slot="port-dot-halo"]'));
    await expect(halos).toHaveLength(ITEMS.length);
    for (const halo of halos) {
      await expect(halo.getBoundingClientRect().width).toBeCloseTo(PORT_HIT_PX, 1);
    }

    // K2 — probe the middle port's halo horizontally (perpendicular to
    // the rail, so a vertical neighbour can never answer instead).
    const middle = halos[1];
    if (!(middle instanceof HTMLElement)) throw new Error("expected the middle halo");
    const rect = middle.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    await expect(hitTargetAt(rect.left + 2, cy, TARGETS)?.label).toBe("port (dot + halo)");
    const outsideLabel = hitTargetAt(rect.left - 3, cy, TARGETS)?.label ?? null;
    await expect(outsideLabel).not.toBe("port (dot + halo)");

    // K4 — the slider reaches every halo through the renderItem seam.
    const slider = canvas.getByLabelText("PORT_HIT_PX");
    await fireEvent.change(slider, { target: { value: "28" } });
    await waitFor(() => expect(middle.getBoundingClientRect().width).toBeCloseTo(28, 1));
    await fireEvent.change(slider, { target: { value: String(PORT_HIT_PX) } });
    await waitFor(() => expect(middle.getBoundingClientRect().width).toBeCloseTo(PORT_HIT_PX, 1));

    // K5 — toggling the overlay off moves nothing in the rail.
    const slots = () =>
      Array.from(canvasElement.querySelectorAll('[data-slot="port-edge"] [data-slot]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { slot: el.getAttribute("data-slot"), x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const before = slots();
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => {
      const first = canvasElement.querySelector('[data-slot="port-dot-halo"]');
      expect(first && getComputedStyle(first).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    });
    await expect(slots()).toEqual(before);
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
  },
};
