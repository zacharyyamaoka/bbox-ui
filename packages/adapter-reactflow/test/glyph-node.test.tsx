import { describe, expect, it } from "vitest";
import { GLYPH_SIZES } from "@bbox-ui/core";
import type { NodeChange } from "@xyflow/react";

import {
  glyphNodeFootprint,
  glyphSizeFromNodeSize,
  sizeChangeFromDimensions,
  type BBoxGlyphNodeData,
} from "../src/glyph-node";

/**
 * Unit tests for the pure helpers only (docs/GLYPH-PLAN.md phase 4's own
 * instruction). `BBoxGlyphNode` itself mounts `NodeResizer` (real DOM refs,
 * d3-drag) and `useReactFlow()` (a store hook) — that is exactly what the
 * real-browser CDP journey (`.scratch-host/drive.mjs`) exists to prove,
 * not react-test-renderer's headless fiber tree.
 */

function data(overrides: Partial<BBoxGlyphNodeData> = {}): BBoxGlyphNodeData {
  return { content: "", sizePreset: "sm", padding: 0, ...overrides };
}

describe("glyphNodeFootprint", () => {
  it("resolves the preset alone when size is absent (undefined)", () => {
    expect(glyphNodeFootprint(data({ sizePreset: "md" }))).toEqual({
      w: GLYPH_SIZES.md,
      h: GLYPH_SIZES.md,
    });
  });

  it("treats size: null the same as absent — the preset wins", () => {
    expect(glyphNodeFootprint(data({ sizePreset: "lg", size: null }))).toEqual({
      w: GLYPH_SIZES.lg,
      h: GLYPH_SIZES.lg,
    });
  });

  it("an explicit size override wins over the preset", () => {
    expect(glyphNodeFootprint(data({ sizePreset: "sm", size: 52 }))).toEqual({ w: 52, h: 52 });
  });

  it("size: 0 is a real override, not falsy-equivalent to absent (checked !== undefined upstream)", () => {
    expect(glyphNodeFootprint(data({ size: 0 }))).toEqual({ w: 0, h: 0 });
  });

  it("padding is additive to the outer footprint on both sides", () => {
    expect(glyphNodeFootprint(data({ sizePreset: "sm", padding: 8 }))).toEqual({
      w: GLYPH_SIZES.sm + 16,
      h: GLYPH_SIZES.sm + 16,
    });
  });
});

describe("glyphSizeFromNodeSize", () => {
  it("a square drag at padding 0 reports that side as the size", () => {
    expect(glyphSizeFromNodeSize(data(), 40, 40)).toBe(40);
  });

  it("takes the SMALLER side when width and height briefly disagree mid-drag", () => {
    expect(glyphSizeFromNodeSize(data(), 60, 44)).toBe(44);
    expect(glyphSizeFromNodeSize(data(), 44, 60)).toBe(44);
  });

  it("subtracts padding from both sides before resolving size", () => {
    expect(glyphSizeFromNodeSize(data({ padding: 8 }), 40, 40)).toBe(24);
  });

  it("clamps to the 8px floor rather than going negative or zero", () => {
    expect(glyphSizeFromNodeSize(data({ padding: 8 }), 10, 10)).toBe(8);
    expect(glyphSizeFromNodeSize(data({ padding: 100 }), 10, 10)).toBe(8);
  });

  it("clamps to the 512px ceiling the size field declares (glyph.fields.ts min/max), rather than accepting a handle dragged past it", () => {
    expect(glyphSizeFromNodeSize(data(), 900, 900)).toBe(512);
    expect(glyphSizeFromNodeSize(data({ padding: 8 }), 900, 700)).toBe(512);
  });
});

describe("sizeChangeFromDimensions", () => {
  it("turns the RESIZE-ENDING dimensions change (resizing: false) into the same size a direct call would produce", () => {
    const change: NodeChange = {
      id: "glyph-1",
      type: "dimensions",
      dimensions: { width: 52, height: 52 },
      resizing: false,
    };
    expect(sizeChangeFromDimensions(change, data())).toBe(52);
    expect(sizeChangeFromDimensions(change, data())).toBe(glyphSizeFromNodeSize(data(), 52, 52));
  });

  it("returns null for a non-dimensions change (position, select, remove, add)", () => {
    const position: NodeChange = { id: "glyph-1", type: "position", dragging: true };
    const select: NodeChange = { id: "glyph-1", type: "select", selected: true };
    expect(sizeChangeFromDimensions(position, data())).toBeNull();
    expect(sizeChangeFromDimensions(select, data())).toBeNull();
  });

  it("returns null for a dimensions change with no dimensions payload yet", () => {
    const change: NodeChange = { id: "glyph-1", type: "dimensions", resizing: true };
    expect(sizeChangeFromDimensions(change, data())).toBeNull();
  });

  it("returns null for a MID-DRAG resize tick (resizing: true) even with a dimensions payload — only the final tick writes", () => {
    const change: NodeChange = {
      id: "glyph-1",
      type: "dimensions",
      dimensions: { width: 52, height: 52 },
      resizing: true,
    };
    expect(sizeChangeFromDimensions(change, data())).toBeNull();
  });

  it("returns null for a mount-time DOM remeasure — no `resizing` key at all, the shape @xyflow/system emits when React Flow first measures a node", () => {
    const change: NodeChange = {
      id: "glyph-1",
      type: "dimensions",
      dimensions: { width: 24, height: 24 },
    };
    expect(sizeChangeFromDimensions(change, data())).toBeNull();
  });
});
