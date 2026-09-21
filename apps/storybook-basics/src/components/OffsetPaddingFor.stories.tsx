import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { PORT_EDGE_SLOT_MIN_PX } from "../components/blockPort.layout";
import { PortEdge, type PortEdgeItem } from "../components/portEdge";
import { DEFAULT_ALIGN_GAP, offsetPaddingFor, type Distribution } from "../components/portEdge.layout";

/**
 * Ports/PortEdge/OffsetPaddingFor — docs/PROPOSALS-2026-09-17.md P9a, the
 * story `offsetPaddingFor` never had. The function has zero production call
 * sites (`blockPort.layout.ts`'s own offset rail uses its sibling
 * `offsetEdgePaddingPx` instead), so nothing rendered would ever have
 * caught a wrong formula — this file exists specifically to be that catch.
 *
 * The rig: two real `PortEdge` tracks, `left` (4 leading ports) and `right`
 * (2 trailing ports), given the SAME coordinate frame (stacked via
 * `position: absolute` inset:0 inside one relative wrapper) so their real
 * `[data-slot="port-edge-member"]` slot boxes live in one comparable
 * viewport frame. The right track's `edgePadding` is
 * `offsetPaddingFor(leadCount, slotMainPx, gap)` — exactly the call the
 * "Offset" preset docs describe. If the formula under-shoots, the two
 * tracks' slots overlap for real, measurably, the same way the bug looked
 * before this file existed.
 *
 * MUTATION TEST (2026-09-17): with `offsetPaddingFor` temporarily reverted
 * to `return count * gap;` (ignoring `slotMainPx` entirely — the exact
 * pre-fix body), `pnpm exec vitest --project=storybook run
 * OffsetPaddingFor` went red on the non-overlap assertion below, real
 * measured boxes actually intersecting:
 *
 *   FAIL  |storybook (chromium)| src/stories/OffsetPaddingFor.stories.tsx
 *     > Overlaid Offset Lanes
 *   AssertionError:
 *   expected true to be false // Object.is equality
 *     ❯ toBe src/stories/OffsetPaddingFor.stories.tsx:113:66
 *       111|     for (const trailingSlot of trailingSlots) {
 *       112|       for (const leadingSlot of leadingSlots) {
 *       113|         await expect(overlapsMainAxis(trailingSlot, leadingSlot)).toBe…
 *
 * Restored immediately after capturing this; `pnpm exec vitest
 * --project=storybook run OffsetPaddingFor` back to `1 passed (1)`.
 */

const LEADING_ITEMS: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "gain", label: "gain", state: "valueSet" },
  { id: "reset", label: "reset", state: "empty" },
  { id: "mode", label: "mode", state: "empty" },
];

const TRAILING_ITEMS: PortEdgeItem[] = [
  { id: "cmd", label: "cmd", state: "wired" },
  { id: "status", label: "status", state: "empty" },
];

const GAP = DEFAULT_ALIGN_GAP;
const SLOT_MAIN_PX = PORT_EDGE_SLOT_MIN_PX;
const TRACK_SIZE = { width: 160, height: 420 };

const leadingDistribution: Distribution = { mode: "aligned", anchor: "start", gap: GAP, edgePadding: 0 };
const trailingDistribution: Distribution = {
  mode: "aligned",
  anchor: "start",
  gap: GAP,
  edgePadding: offsetPaddingFor(LEADING_ITEMS.length, SLOT_MAIN_PX, GAP),
};

function OverlaidOffsetLanesDemo() {
  return (
    <div style={{ position: "relative", width: TRACK_SIZE.width, height: TRACK_SIZE.height }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <PortEdge edge="left" items={LEADING_ITEMS} distribution={leadingDistribution} size={TRACK_SIZE} showContainer={false} showCenterLine={false} />
      </div>
      <div style={{ position: "absolute", inset: 0 }}>
        <PortEdge edge="right" items={TRAILING_ITEMS} distribution={trailingDistribution} size={TRACK_SIZE} showContainer={false} showCenterLine={false} />
      </div>
    </div>
  );
}

function slotRects(track: Element): DOMRect[] {
  return Array.from(track.querySelectorAll('[data-slot="port-edge-member"]')).map((el) => el.getBoundingClientRect());
}

/** Two ranges on the main (vertical, column-axis) span overlap iff each
 *  starts before the other ends. */
function overlapsMainAxis(a: DOMRect, b: DOMRect): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

const meta = {
  title: "Ports/PortEdge/OffsetPaddingFor",
  tags: ["area:ports", "lane:baseline"],
  component: PortEdge,
  parameters: { layout: "padded" },
  // `render` below supplies two real tracks with story-local props — these
  // args are never read, just enough to satisfy PortEdge's required props
  // at the meta level (same seam PortEdge.stories.tsx's own meta works
  // around).
  args: { edge: "left", items: [] },
} satisfies Meta<typeof PortEdge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverlaidOffsetLanes: Story = {
  render: () => <OverlaidOffsetLanesDemo />,
  play: async ({ canvasElement }) => {
    const leading = canvasElement.querySelector('[data-slot="port-edge"][data-edge="left"]');
    const trailing = canvasElement.querySelector('[data-slot="port-edge"][data-edge="right"]');
    if (!leading) throw new Error("expected the leading (left) PortEdge track");
    if (!trailing) throw new Error("expected the trailing (right) PortEdge track");

    const leadingSlots = slotRects(leading);
    const trailingSlots = slotRects(trailing);
    await expect(leadingSlots).toHaveLength(LEADING_ITEMS.length);
    await expect(trailingSlots).toHaveLength(TRAILING_ITEMS.length);

    // THE assertion this story exists for: no trailing-edge slot may
    // overlap the main-axis span of any leading-edge slot. This is the
    // measurable version of "the two lanes visually interleave" — real
    // rects, not inferred from the padding number that produced them.
    for (const trailingSlot of trailingSlots) {
      for (const leadingSlot of leadingSlots) {
        await expect(overlapsMainAxis(trailingSlot, leadingSlot)).toBe(false);
      }
    }

    // The positive shape of the same claim: the trailing lane's first slot
    // starts at least one full pitch (slot + gap) below the leading lane's
    // last slot — one continuous column of slots, not two that happen not
    // to touch.
    const leadingLast = leadingSlots[leadingSlots.length - 1];
    const trailingFirst = trailingSlots[0];
    await expect(trailingFirst.top - leadingLast.bottom).toBeGreaterThanOrEqual(GAP - 1);
  },
};
