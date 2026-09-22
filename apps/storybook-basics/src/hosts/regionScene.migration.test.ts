// src/hosts/regionScene.migration.test.ts — the region scene-schema
// migration (Codex audit, 2026-09-22). Before that date a record carried only
// `region.view`, and `view: "opaque"` meant the FOLDED CARD — the Port view
// now. A record with `view: "opaque"` and no `presentation` is legacy and must
// read as Port; every new Expanded Opaque record carries `presentation`
// explicitly, so it can never be read as legacy. Pure node, `unit` project.

import { describe, expect, it } from "vitest";

import { REGION_NODE_TYPE } from "../scene/region";
import type { HostScene } from "./hostScene";
import {
  isLegacyOpaqueRegion,
  isOpaqueRegion,
  migrateRegionScene,
  regionFaceOf,
  setRegionPresentation,
  toggleBlackbox,
} from "./regionScene";

function scene(region: NonNullable<HostScene["nodes"][number]["data"]["region"]>): HostScene {
  return {
    nodes: [
      { id: "src", type: "block", position: { x: 0, y: 0 }, data: { name: "src" } },
      { id: "loop", type: REGION_NODE_TYPE, position: { x: 200, y: 0 }, data: { name: "For Loop", region, w: 400 } },
    ],
    edges: [],
  };
}

describe("a legacy record keeps its meaning", () => {
  it("reads `view: \"opaque\"` with no `presentation` as Port, the old folded card", () => {
    const legacy = scene({ kind: "loop", view: "opaque" });
    expect(isLegacyOpaqueRegion(legacy.nodes[1])).toBe(true);
    expect(regionFaceOf(legacy.nodes[1])).toBe("port");
    expect(isOpaqueRegion(legacy.nodes[1])).toBe(true);
  });

  it("migrates it to `presentation: \"port\", view: \"expanded\"`, which reads the same", () => {
    const legacy = scene({ kind: "loop", view: "opaque" });
    const migrated = migrateRegionScene(legacy);
    expect(migrated.nodes[1].data.region).toEqual({ kind: "loop", presentation: "port", view: "expanded" });
    expect(regionFaceOf(migrated.nodes[1])).toBe("port");
    expect(migrated.nodes[0]).toBe(legacy.nodes[0]);
    expect(migrated.edges).toBe(legacy.edges);
    // Idempotent: a migrated scene is the SAME object the second time.
    expect(migrateRegionScene(migrated)).toBe(migrated);
  });

  it("leaves Port on the expanded frame, not on Expanded Opaque", () => {
    const next = setRegionPresentation(scene({ kind: "loop", view: "opaque" }), "loop", "expanded");
    expect(regionFaceOf(next.nodes[1])).toBe("expanded");
  });
});

describe("a new Expanded Opaque record can never be mistaken for legacy", () => {
  it("is written with the explicit discriminator by the Blackbox toggle", () => {
    const opened = toggleBlackbox(scene({ kind: "loop" }), "loop");
    expect(opened.nodes[1].data.region).toEqual({ kind: "loop", presentation: "expanded", view: "opaque" });
    expect(regionFaceOf(opened.nodes[1])).toBe("opaque");
    expect(isLegacyOpaqueRegion(opened.nodes[1])).toBe(false);
    const closed = toggleBlackbox(opened, "loop");
    expect(regionFaceOf(closed.nodes[1])).toBe("expanded");
  });

  it("round-trips through JSON and the migration unchanged", () => {
    const opened = toggleBlackbox(scene({ kind: "loop" }), "loop");
    const loaded = JSON.parse(JSON.stringify(opened)) as HostScene;
    expect(regionFaceOf(loaded.nodes[1])).toBe("opaque");
    expect(migrateRegionScene(loaded)).toBe(loaded);
    expect(loaded).toEqual(opened);
  });

  it("toggles a LEGACY record out of Port and into Expanded Opaque, discriminated", () => {
    const next = toggleBlackbox(scene({ kind: "loop", view: "opaque" }), "loop");
    expect(next.nodes[1].data.region).toEqual({ kind: "loop", presentation: "expanded", view: "opaque" });
  });
});
