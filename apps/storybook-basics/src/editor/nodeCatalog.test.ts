import { describe, expect, it } from "vitest";

import { catalogFor, type NodeCatalogEntry } from "./nodeCatalog";

const sink: NodeCatalogEntry = { id: "sink", label: "Sink", kind: "test", inputs: 1, outputs: 0 };
const source: NodeCatalogEntry = { id: "source", label: "Source", kind: "test", inputs: 0, outputs: 1 };
const both: NodeCatalogEntry = { id: "both", label: "Both", kind: "test", inputs: 1, outputs: 1 };
const neither: NodeCatalogEntry = { id: "neither", label: "Neither", kind: "test", inputs: 0, outputs: 0 };

const CATALOG = [sink, source, both, neither];

describe("catalogFor", () => {
  it("wanting a producer (direction: source) keeps only entries with an output — a producer needs an output", () => {
    // Re-expression of blockPickerPresetsFor(true): outputs > 0.
    expect(catalogFor(CATALOG, { direction: "source" })).toEqual([source, both]);
  });

  it("wanting a consumer (direction: sink) keeps only entries with an input — a consumer an input", () => {
    // Re-expression of blockPickerPresetsFor(false): inputs > 0.
    expect(catalogFor(CATALOG, { direction: "sink" })).toEqual([sink, both]);
  });

  it("preserves the catalog's own order rather than re-sorting", () => {
    const reordered = [both, source, sink];
    expect(catalogFor(reordered, { direction: "source" })).toEqual([both, source]);
  });

  it("an entry with zero matching ports never qualifies for either direction", () => {
    expect(catalogFor([neither], { direction: "source" })).toEqual([]);
    expect(catalogFor([neither], { direction: "sink" })).toEqual([]);
  });

  describe("type filtering — undefined is unconstrained (lint.ts's convention)", () => {
    const untyped: NodeCatalogEntry = { id: "untyped", label: "Untyped", kind: "test", inputs: 0, outputs: 1 };
    const numberOut: NodeCatalogEntry = { id: "number-out", label: "Number", kind: "test", inputs: 0, outputs: 1, types: ["number"] };
    const stringOut: NodeCatalogEntry = { id: "string-out", label: "String", kind: "test", inputs: 0, outputs: 1, types: ["string"] };

    it("no `want.types` admits every polarity-qualifying entry regardless of its own types", () => {
      expect(catalogFor([untyped, numberOut, stringOut], { direction: "source" })).toEqual([untyped, numberOut, stringOut]);
    });

    it("an entry with `types: undefined` is unconstrained and always passes a typed want", () => {
      expect(catalogFor([untyped], { direction: "source", types: ["number"] })).toEqual([untyped]);
    });

    it("a typed want filters out a typed entry with no intersecting tag", () => {
      const result = catalogFor([numberOut, stringOut], { direction: "source", types: ["number"] });
      expect(result).toEqual([numberOut]);
      expect(result).not.toContainEqual(stringOut);
    });

    it("accepts a caller-supplied `compatible` in place of the default typesIntersect", () => {
      const alwaysFalse = () => false;
      expect(catalogFor([numberOut], { direction: "source", types: ["number"] }, alwaysFalse)).toEqual([]);
    });
  });
});
