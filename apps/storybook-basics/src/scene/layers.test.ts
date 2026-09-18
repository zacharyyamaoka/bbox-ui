// src/scene/layers.test.ts
//
// SystemSketch's `tunnelLayers.ts` had no test file either (it was Editor-
// bound, so testing it meant booting tldraw). These are written against the
// re-expressed contract in `layers.ts`, and the three that pin a DEVIATION
// from the donor say so at the assertion.

import { describe, expect, it } from "vitest";

import type { BlockScene } from "./scene";
import {
  canonicalSceneLayer,
  edgeLayer,
  edgeTunnels,
  edgesOnLayer,
  sceneLayers,
  type SceneLayerData,
} from "./layers";

type LayerScene = BlockScene<Record<string, unknown>, SceneLayerData>;

function scene(
  edges: { id: string; layer?: string; tunnel?: boolean }[],
): LayerScene {
  return {
    nodes: [],
    edges: edges.map(({ id, layer, tunnel }) => ({
      id,
      source: "a",
      target: "b",
      data: { ...(layer === undefined ? {} : { layer }), ...(tunnel === undefined ? {} : { tunnel }) },
    })),
  };
}

describe("edge layer membership", () => {
  it("reads a trimmed name, and treats blank as no layer", () => {
    expect(edgeLayer({ data: { layer: "Diagnostics" } })).toBe("Diagnostics");
    expect(edgeLayer({ data: { layer: "  Power  " } })).toBe("Power");
    expect(edgeLayer({ data: { layer: "   " } })).toBeNull();
    expect(edgeLayer({ data: {} })).toBeNull();
    expect(edgeLayer({})).toBeNull();
  });

  it("only `true` is a tunnel — an absent or truthy-ish flag is not", () => {
    expect(edgeTunnels({ data: { tunnel: true } })).toBe(true);
    expect(edgeTunnels({ data: { tunnel: false } })).toBe(false);
    expect(edgeTunnels({ data: {} })).toBe(false);
    expect(edgeTunnels({})).toBe(false);
  });
});

describe("sceneLayers — the set is DERIVED, never stored", () => {
  it("collects every named layer, sorted, deduped case-insensitively", () => {
    const board = scene([
      { id: "e1", layer: "Power", tunnel: true },
      { id: "e2", layer: "Diagnostics", tunnel: true },
      { id: "e3", layer: "diagnostics", tunnel: true },
      { id: "e4" },
    ]);
    expect(sceneLayers(board)).toEqual(["Diagnostics", "Power"]);
  });

  it("DEVIATION from the donor: a layer counts even if no edge on it tunnels", () => {
    // `getTunnelLayers` required `props.tunnel === true`. Under that rule
    // this layer is invisible in the picker — yet focusing it still tunnels
    // every OTHER edge, because tunnelDisplayState checks focusedLayer
    // before enabled. A layer you can act on but cannot see is the bug.
    const board = scene([{ id: "e1", layer: "Telemetry", tunnel: false }]);
    expect(sceneLayers(board)).toEqual(["Telemetry"]);
  });

  it("DEVIATION from the donor: the FIRST spelling wins, not the last", () => {
    // The donor's bare Map.set kept the last, so adding a lowercase edge
    // silently relabelled an existing layer in the picker.
    expect(sceneLayers(scene([
      { id: "e1", layer: "Diagnostics" },
      { id: "e2", layer: "diagnostics" },
    ]))).toEqual(["Diagnostics"]);
    expect(sceneLayers(scene([
      { id: "e1", layer: "diagnostics" },
      { id: "e2", layer: "Diagnostics" },
    ]))).toEqual(["diagnostics"]);
  });

  it("is empty for a scene nobody has layered", () => {
    expect(sceneLayers(scene([{ id: "e1" }, { id: "e2", layer: "  " }]))).toEqual([]);
    expect(sceneLayers(scene([]))).toEqual([]);
  });
});

describe("canonicalSceneLayer — how '+ New layer' works without a registry", () => {
  const board = scene([{ id: "e1", layer: "Diagnostics", tunnel: true }]);

  it("resolves a typed name to the scene's existing spelling", () => {
    expect(canonicalSceneLayer(board, "diagnostics")).toBe("Diagnostics");
    expect(canonicalSceneLayer(board, "  DIAGNOSTICS  ")).toBe("Diagnostics");
  });

  it("keeps a brand-new name — this is the fallback the empty-layer cost rides on", () => {
    expect(canonicalSceneLayer(board, "  Power  ")).toBe("Power");
    expect(canonicalSceneLayer(scene([]), "First")).toBe("First");
  });
});

describe("edgesOnLayer", () => {
  const board = scene([
    { id: "e1", layer: "Diagnostics", tunnel: true },
    { id: "e2", layer: "diagnostics", tunnel: true },
    { id: "e3", layer: "Power", tunnel: true },
    { id: "e4" },
  ]);

  it("matches case-insensitively, so the picker and the render agree", () => {
    expect(edgesOnLayer(board, "DIAGNOSTICS").map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(edgesOnLayer(board, "  power ").map((e) => e.id)).toEqual(["e3"]);
  });

  it("returns nothing for a blank or unknown layer", () => {
    expect(edgesOnLayer(board, "   ")).toEqual([]);
    expect(edgesOnLayer(board, "Nope")).toEqual([]);
  });

  it("partitions the scene — every layered edge belongs to exactly one layer", () => {
    const layered = board.edges.filter((edge) => edgeLayer(edge) !== null);
    const collected = sceneLayers(board).flatMap((layer) => edgesOnLayer(board, layer));
    expect(collected).toHaveLength(layered.length);
    expect(new Set(collected.map((e) => e.id)).size).toBe(layered.length);
  });
});
