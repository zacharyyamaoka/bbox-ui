/**
 * src/components/blockPortMembers.layout.test.ts — a collapsed member's
 * ports length, asserted as pure math against the rail plan it has to fit.
 * The rendered claim (dots inside their band, bands tiling the parent) is
 * measured in a real browser by `BlockPortMembers.stories.tsx`.
 */
import { describe, expect, it } from "vitest";

import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, alignedFirstCentrePx, railPlanFor, type BlockBands } from "./blockPort.layout";
import { memberPortsLengthPx } from "./blockPortMembers.layout";

describe("memberPortsLengthPx", () => {
  it("is n slots and n - 1 gaps", () => {
    expect(memberPortsLengthPx(1)).toBe(PORT_EDGE_SLOT_MIN_PX);
    expect(memberPortsLengthPx(2)).toBe(2 * PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX);
    expect(memberPortsLengthPx(3)).toBe(3 * PORT_EDGE_SLOT_MIN_PX + 2 * RAIL_GAP_PX);
  });

  it("keeps one slot for a member with no ports, so the member never vanishes", () => {
    expect(memberPortsLengthPx(0)).toBe(PORT_EDGE_SLOT_MIN_PX);
  });

  it("holds the last slot of the port-view rail exactly, with nothing left over", () => {
    for (const count of [1, 2, 3, 5]) {
      const itemIds = Array.from({ length: count }, (_, i) => `p${i}`);
      const plan = railPlanFor({ view: "port", portLayout: "inline", edge: "left", itemIds, leadCount: 0, collapsePorts: false, populatedEdges: ["left", "right"] });
      const length = memberPortsLengthPx(count);
      const bands: BlockBands = { blockLeft: 0, blockTop: 0, blockWidth: 200, blockHeight: length, bodyTop: 0, bodyBottom: length };
      const first = alignedFirstCentrePx(plan, bands);
      expect(first).not.toBeNull();
      const lastCentre = first! + (count - 1) * (PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX);
      expect(lastCentre + PORT_EDGE_SLOT_MIN_PX / 2).toBe(length);
    }
  });
});
