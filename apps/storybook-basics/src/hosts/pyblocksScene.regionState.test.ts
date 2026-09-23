// src/hosts/pyblocksScene.regionState.test.ts — the pyblocks boundary never
// lets network bytes set a region's VIEW (Codex re-judge, 2026-09-22). A
// region's view is client-owned UI state; pyblocks never authors it, so
// `loadPyblocksScene` drops `data.region.view`/`presentation` and every
// region loads Expanded — including a historical `view: "opaque"`, which
// would otherwise render as Expanded Opaque. See `withoutRegionViewState`.
// Node project, no DOM.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { loadPyblocksScene, parsePyblocksScene, withoutRegionViewState } from "./pyblocksScene";
import { regionFaceOf } from "./regionScene";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/fixtures/pyblocks-scene");
const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));

type RawNode = { id: string; type: string; data: Record<string, unknown> };

/** The frozen `region_for_if` document, network-shaped, with the historical
 *  region fields injected onto every region node. */
function withHistoricalRegionFields(region: Record<string, unknown>): { json: Record<string, unknown>; regionIds: string[] } {
  const json = fixture("region_for_if.scene.json");
  const nodes = (json.scene as { nodes: RawNode[] }).nodes;
  const regionIds: string[] = [];
  for (const node of nodes) {
    if (node.type !== "region") continue;
    node.data.region = { ...region };
    regionIds.push(node.id);
  }
  return { json, regionIds };
}

describe("region view state at the pyblocks boundary", () => {
  test("a historical `view: \"opaque\"` loads as Expanded — the view is the client's, not the network's", () => {
    const { json, regionIds } = withHistoricalRegionFields({ kind: "loop", view: "opaque" });
    expect(regionIds.length).toBeGreaterThan(0);
    const { scene } = loadPyblocksScene(json);
    for (const id of regionIds) {
      const node = scene.nodes.find((candidate) => candidate.id === id)!;
      expect(regionFaceOf(node), `${id} renders`).toBe("expanded");
      // Every OTHER region field survives — only the view state is dropped.
      expect(node.data.region).toEqual({ kind: "loop" });
    }
  });

  test("a `presentation` from the network is dropped too", () => {
    const { json, regionIds } = withHistoricalRegionFields({ kind: "group", view: "opaque", presentation: "port" });
    const { scene } = loadPyblocksScene(json);
    for (const id of regionIds) {
      const node = scene.nodes.find((candidate) => candidate.id === id)!;
      expect(regionFaceOf(node)).toBe("expanded");
      expect(node.data.region).toEqual({ kind: "group" });
    }
  });

  test("the parsed document is still exactly what was sent — only the loaded scene is cleaned", () => {
    const { json } = withHistoricalRegionFields({ kind: "loop", view: "opaque" });
    const raw = JSON.stringify(json);
    expect(JSON.stringify(parsePyblocksScene(JSON.parse(raw)))).toBe(raw);
  });

  test("a scene with no view state comes back as the SAME object", () => {
    const { scene } = loadPyblocksScene(fixture("region_for_if.scene.json"));
    expect(withoutRegionViewState(scene)).toBe(scene);
  });
});

describe("a non-record `region` from the network is not view state", () => {
  test.each([
    ["null", null],
    ["a string", "opaque"],
    ["a number", 3],
  ])("region = %s: parses, loads without throwing, and passes through as sent", (_label, value) => {
    const json = fixture("region_for_if.scene.json");
    const nodes = (json.scene as { nodes: RawNode[] }).nodes;
    const target = nodes.find((node) => node.type === "region")!;
    target.data.region = value;
    const parsed = parsePyblocksScene(JSON.parse(JSON.stringify(json)));
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(json));
    const { scene } = loadPyblocksScene(json);
    const loaded = scene.nodes.find((node) => node.id === target.id)!;
    expect((loaded.data as { region?: unknown }).region).toBe(value);
  });
});
