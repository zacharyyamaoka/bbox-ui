// src/shapes/wire/edgeDropCatalog.test.ts — the edge-drop catalogue's own
// gate (backlog W1-24 + ruling 6, "reduce the presets to only the 5 most
// common"). Plain node, no DOM, no tldraw: `edgeDropCatalog.ts` is the pure
// half of the menu precisely so this can run in milliseconds.
//
// What is asserted is the RULE, not the current spelling: five rows, five
// genuinely different shapes, and — the one that actually protects the
// document — that what the menu advertises is what the creator mints.
import { describe, expect, it } from "vitest";

import { catalogFor } from "@trunk/editor/nodeCatalog";

import { EDGE_DROP_CATALOG, landingPortId, presetDocPorts, presetPorts } from "./edgeDropCatalog";

describe("the edge-drop catalogue", () => {
  it("offers exactly five presets — Zach's ruling 6, not a range", () => {
    expect(EDGE_DROP_CATALOG).toHaveLength(5);
    expect(EDGE_DROP_CATALOG.map((preset) => preset.id)).toEqual(["block", "source", "sink", "branch", "group"]);
  });

  it("every preset is a DISTINCT (inputs, outputs, view) shape", () => {
    // The cut's whole premise: `ss-block` carries no `blockType`, so two rows
    // that agree on arity AND view create the same block under two names.
    // Nine of the donor's fourteen collapsed for exactly this reason
    // (`edgeDropCatalog.ts`'s header) — this is the assertion that stops them
    // creeping back one well-meaning row at a time.
    const shapes = EDGE_DROP_CATALOG.map((preset) => `${preset.inputs}/${preset.outputs}/${preset.view}`);
    expect(new Set(shapes).size).toBe(EDGE_DROP_CATALOG.length);
  });

  it("advertised counts are the port ids, so the menu cannot promise what the creator will not mint", () => {
    for (const preset of EDGE_DROP_CATALOG) {
      expect(preset.inputs, preset.id).toBe(preset.inPortIds.length);
      expect(preset.outputs, preset.id).toBe(preset.outPortIds.length);
      const ports = presetPorts(preset, "Pose");
      expect(ports.left.map((port) => port.id), preset.id).toEqual([...preset.inPortIds]);
      expect(ports.right.map((port) => port.id), preset.id).toEqual([...preset.outPortIds]);
      expect(ports.top, preset.id).toEqual([]);
      expect(ports.bottom, preset.id).toEqual([]);
      // The scene the judge examines names the same ports the shape gets.
      expect(presetDocPorts(preset), preset.id).toEqual({
        left: [...preset.inPortIds],
        right: [...preset.outPortIds],
        top: [],
        bottom: [],
      });
    }
  });

  it("carries the one shape the donor's fourteen exist to distinguish: a 1-in/2-out Branch", () => {
    const branch = EDGE_DROP_CATALOG.find((preset) => preset.id === "branch")!;
    expect([branch.inputs, branch.outputs]).toEqual([1, 2]);
    expect(branch.outPortIds).toEqual(["then", "else"]);
  });

  it("polarity filtering drops the row that cannot answer the cable", () => {
    // A cable leaving a SOURCE needs a consumer: Source (0 in) is the only
    // row that cannot answer it, and Sink (0 out) is the only row that cannot
    // answer the opposite. Both directions exercised — one filtered row each.
    expect(catalogFor(EDGE_DROP_CATALOG, { direction: "sink" }).map((p) => p.id)).toEqual(["block", "sink", "branch", "group"]);
    expect(catalogFor(EDGE_DROP_CATALOG, { direction: "source" }).map((p) => p.id)).toEqual(["block", "source", "branch", "group"]);
  });

  it("the cable lands on the first dot of the rail it needs, and on nothing when there is no such rail", () => {
    const branch = EDGE_DROP_CATALOG.find((preset) => preset.id === "branch")!;
    expect(landingPortId(branch, "source")).toBe("then");
    expect(landingPortId(branch, "sink")).toBe("in");
    const source = EDGE_DROP_CATALOG.find((preset) => preset.id === "source")!;
    expect(landingPortId(source, "sink")).toBeUndefined();
    const sink = EDGE_DROP_CATALOG.find((preset) => preset.id === "sink")!;
    expect(landingPortId(sink, "source")).toBeUndefined();
  });

  it("a port's declaration carries the inherited type, and an unset type leaves no trailing colon", () => {
    const branch = EDGE_DROP_CATALOG.find((preset) => preset.id === "branch")!;
    expect(presetPorts(branch, "Pose").right.map((port) => port.declaration)).toEqual(["then: Pose", "else: Pose"]);
    expect(presetPorts(branch, "").right.map((port) => port.declaration)).toEqual(["then", "else"]);
  });

  it("the Group is the only expanded row, and it is sized like the ones this app makes by hand", () => {
    const expanded = EDGE_DROP_CATALOG.filter((preset) => preset.view === "expanded");
    expect(expanded.map((preset) => preset.id)).toEqual(["group"]);
    // menus.smoke 300x200, wiring.smoke 300x220, blockHitTest.smoke 320x240 —
    // a container needs room for what goes in it, so it is bigger than the
    // 160x100 `ss-block` default on both axes.
    expect(expanded[0]!.w).toBeGreaterThanOrEqual(300);
    expect(expanded[0]!.h).toBeGreaterThanOrEqual(200);
  });
});
