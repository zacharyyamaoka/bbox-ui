/**
 * Hit Regions/Block — the component with NO hit constant, on purpose. As a
 * DOM element Block's pointer target is the browser's own hit test, which
 * stops at the border box exactly — the same "there was no number to
 * choose" React Flow's DOM nodes have. Contrast tldraw, which grabs a
 * shape from ±3 SCREEN px outside its border (`hitTestMargin`). The
 * pyblocks hit-constants gallery kept tldraw's margin for blocks ("the one
 * row where tldraw is the more forgiving of the two"); this repo's Block
 * currently has no equivalent — a real finding, and if a margin is ever
 * wanted it is HOST work (spatial hit-testing is host-owned), not a Block
 * prop.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { Text } from "../components/text";
import {
  Checkbox,
  HitProbe,
  PolicyControl,
  ZoomControl,
  ZoomStage,
  hitTargetAt,
  type HitTarget,
} from "../hitRegions/harness";
import type { HitPolicy } from "../hitRegions/hitPolicy";

const meta = {
  title: "Hit Regions/Block",
  tags: ["area:hit-regions", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TARGETS: HitTarget[] = [{ label: "block (its DOM border box — no margin)", selector: '[data-slot="block"]' }];

const STAGE_W = 420;
const STAGE_H = 220;

function BlockHitPlayground() {
  const [show, setShow] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [policy, setPolicy] = useState<HitPolicy>("scene");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Checkbox label="Show hit regions" checked={show} onChange={setShow} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <PolicyControl policy={policy} onChange={setPolicy} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)", maxWidth: 560 }}>
        no slider: Block has no hit constant — the region is the border box the browser hit-tests,
        so there is no number to adjust. (The policy control is inert here for the same reason;
        a DOM box always scales with the transform.)
      </div>
      <HitProbe targets={TARGETS}>
        <ZoomStage zoom={zoom} width={STAGE_W} height={STAGE_H}>
          <div style={{ padding: 40, width: STAGE_W, height: STAGE_H, boxSizing: "border-box" }}>
            <Block
              width={300}
              header={<Text>build_report</Text>}
              body={<Text tone="muted">the border box is the whole target</Text>}
              showHitRegion={show}
            />
          </div>
        </ZoomStage>
      </HitProbe>
    </div>
  );
}

export const Playground: Story = {
  render: () => <BlockHitPlayground />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvasElement.scrollIntoView({ block: "center" });
    const block = canvasElement.querySelector('[data-slot="block"]');
    if (!(block instanceof HTMLElement)) throw new Error("expected the block");
    const rect = block.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;

    // K2 — the region is the border box EXACTLY: 2px inside hits, and
    // BOTH 2px and 4px outside miss (tldraw's ±3 would have hit at -2).
    await expect(hitTargetAt(rect.left + 2, cy, TARGETS)?.label).toContain("block");
    await expect(hitTargetAt(rect.left - 2, cy, TARGETS)).toBeNull();
    await expect(hitTargetAt(rect.left - 4, cy, TARGETS)).toBeNull();
    await expect(hitTargetAt(rect.right + 2, cy, TARGETS)).toBeNull();

    // The painted overlay covers that same box: its rect equals the
    // block's own border box, ±1px for the live border-width token.
    const overlay = block.querySelector('[data-slot="block-hit-region"]');
    if (!(overlay instanceof HTMLElement)) throw new Error("expected the hit-region overlay");
    const overlayRect = overlay.getBoundingClientRect();
    await expect(Math.abs(overlayRect.left - rect.left)).toBeLessThanOrEqual(1);
    await expect(Math.abs(overlayRect.right - rect.right)).toBeLessThanOrEqual(1);
    await expect(Math.abs(overlayRect.top - rect.top)).toBeLessThanOrEqual(1);
    await expect(Math.abs(overlayRect.bottom - rect.bottom)).toBeLessThanOrEqual(1);
    // ...and it is inert: paint, not a new pointer target.
    await expect(getComputedStyle(overlay).pointerEvents).toBe("none");

    // K5 — toggling it off moves nothing and changes no hit behaviour.
    const slots = () =>
      Array.from(block.querySelectorAll("[data-slot]"))
        .filter((el) => el.getAttribute("data-slot") !== "block-hit-region")
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { slot: el.getAttribute("data-slot"), x: r.x, y: r.y, w: r.width, h: r.height };
        });
    const before = slots();
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
    await waitFor(() => expect(block.querySelector('[data-slot="block-hit-region"]')).toBeNull());
    await expect(slots()).toEqual(before);
    await expect(hitTargetAt(rect.left + 2, cy, TARGETS)?.label).toContain("block");
    await expect(hitTargetAt(rect.left - 2, cy, TARGETS)).toBeNull();
    await fireEvent.click(canvas.getByLabelText("Show hit regions"));
  },
};
