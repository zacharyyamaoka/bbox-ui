// src/hosts/regionScene.literal.test.ts — a region record renders LITERALLY
// (Codex re-judge, 2026-09-22). What the public writers write must render as
// what they mean, before and after a JSON round-trip: `setRegionView(…,
// "opaque")` and `toggleRegionView` produce Expanded Opaque, never Port, and
// an absent `presentation` is "expanded". There is no legacy reading of
// `view: "opaque"` — see `RegionData.view`'s WHY. Pure node, `unit` project.

import { describe, expect, it } from "vitest";

import { REGION_NODE_TYPE } from "../scene/region";
import type { HostScene } from "./hostScene";
import { isOpaqueRegion, regionFaceOf, setRegionPresentation, setRegionView, toggleRegionView } from "./regionScene";

function fresh(): HostScene {
  return {
    nodes: [
      { id: "src", type: "block", position: { x: 0, y: 0 }, data: { name: "src" } },
      { id: "loop", type: REGION_NODE_TYPE, position: { x: 200, y: 0 }, data: { name: "For Loop", region: { kind: "loop" }, w: 400 } },
    ],
    edges: [],
  };
}

const roundTrip = (scene: HostScene): HostScene => JSON.parse(JSON.stringify(scene)) as HostScene;

describe("what the writers write renders as what they mean", () => {
  it("setRegionView(…, \"opaque\") renders Expanded Opaque, and still does after a JSON round-trip", () => {
    const written = setRegionView(fresh(), "loop", "opaque");
    expect(written.nodes[1].data.region).toEqual({ kind: "loop", view: "opaque" });
    expect(regionFaceOf(written.nodes[1])).toBe("opaque");
    expect(regionFaceOf(roundTrip(written).nodes[1])).toBe("opaque");
    expect(isOpaqueRegion(roundTrip(written).nodes[1])).toBe(true);
  });

  it("toggleRegionView round-trips Expanded → Expanded Opaque → Expanded, through JSON each time", () => {
    const opened = roundTrip(toggleRegionView(fresh(), "loop"));
    expect(regionFaceOf(opened.nodes[1])).toBe("opaque");
    const closed = roundTrip(toggleRegionView(opened, "loop"));
    expect(regionFaceOf(closed.nodes[1])).toBe("expanded");
  });

  it("reads an absent presentation as expanded, and Port only when written", () => {
    expect(regionFaceOf(fresh().nodes[1])).toBe("expanded");
    const port = roundTrip(setRegionPresentation(fresh(), "loop", "port"));
    expect(regionFaceOf(port.nodes[1])).toBe("port");
    // Port wins over the toggle's state, and leaving Port returns to it.
    const opaquePort = setRegionPresentation(setRegionView(fresh(), "loop", "opaque"), "loop", "port");
    expect(regionFaceOf(opaquePort.nodes[1])).toBe("port");
    expect(regionFaceOf(setRegionPresentation(opaquePort, "loop", "expanded").nodes[1])).toBe("opaque");
  });
});
