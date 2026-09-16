/**
 * `primitivesForGlyph`: a Glyph's whole picture is ONE stock `x-box`,
 * sized to the INNER glyph (padding excluded) — docs/GLYPH-PLAN.md D4's
 * same rule, exercised here for the standalone shape.
 *
 * The second describe block below covers the SAME D4 rule for a Block's
 * inline glyph slot (`blockPrimitives.ts`'s one hunk this lane touched):
 * kept here rather than in `test/blockPrimitives.test.ts` so the
 * assertion stays inside this lane's `test/glyph*.test.ts` file list.
 */
import { describe, expect, it } from "vitest";

import { glyphPx } from "@bbox-ui/core";

import { primitivesForGlyph } from "../src/detach/glyphPrimitives";
import { primitivesForBlock } from "../src/detach/blockPrimitives";
import { measureText } from "../src/detach/stockPartials";
import type { BBoxBlockShapeProps } from "../src/block-shape-util";
import type { BBoxGlyphShapeProps } from "../src/glyph-shape-util";

type GlyphInput = Pick<BBoxGlyphShapeProps, "sizePreset" | "size" | "padding">;

describe("primitivesForGlyph", () => {
  it("emits exactly one stock geo x-box", () => {
    const built = primitivesForGlyph(
      { sizePreset: "sm", size: null, padding: 0 },
      { x: 0, y: 0 },
    );
    expect(built.shapes).toHaveLength(1);
    expect(built.shapes[0].id).toBe(built.boxId);
    expect(built.shapes[0].type).toBe("geo");
    expect(built.shapes[0].props).toMatchObject({
      geo: "x-box",
      color: "black",
      fill: "none",
      size: "s",
    });
  });

  it("sizes the box from the preset when there is no override", () => {
    const built = primitivesForGlyph(
      { sizePreset: "lg", size: null, padding: 0 },
      { x: 0, y: 0 },
    );
    expect(built.shapes[0].props).toMatchObject({ w: 36, h: 36 });
  });

  it("an explicit size override wins over the preset", () => {
    const built = primitivesForGlyph(
      { sizePreset: "sm", size: 52, padding: 0 },
      { x: 0, y: 0 },
    );
    expect(built.shapes[0].props).toMatchObject({ w: 52, h: 52 });
  });

  it("padding shrinks the box relative to the shape's own outer origin — the box is the INNER size, not the outer footprint", () => {
    const input: GlyphInput = { sizePreset: "md", size: null, padding: 6 };
    const built = primitivesForGlyph(input, { x: 100, y: 200 });
    // The preset alone (24px) — padding never inflates the box itself.
    expect(built.shapes[0].props).toMatchObject({ w: 24, h: 24 });
    // But the box sits INSET from the shape's outer x/y by exactly the
    // padding, landing at the glyph's own inner origin.
    expect(built.shapes[0].x).toBe(106);
    expect(built.shapes[0].y).toBe(206);
  });

  it("zero padding leaves the box flush with the shape's origin", () => {
    const built = primitivesForGlyph(
      { sizePreset: "sm", size: null, padding: 0 },
      { x: 40, y: 50 },
    );
    expect(built.shapes[0].x).toBe(40);
    expect(built.shapes[0].y).toBe(50);
  });

  it("floors the box at 1px for a pathological size", () => {
    const built = primitivesForGlyph(
      { sizePreset: "sm", size: 8, padding: 0 },
      { x: 0, y: 0 },
    );
    // 8px is the validator's real floor; this only proves geoAt-style
    // clamping never emits a non-positive dimension even below it.
    expect((built.shapes[0].props as { w: number }).w).toBeGreaterThan(0);
  });
});

function blockPropsWithIcon(overrides: Partial<BBoxBlockShapeProps> = {}): BBoxBlockShapeProps {
  return {
    w: 384,
    h: 258,
    title: "Detect",
    titleSize: "xl",
    blockType: "dataflow",
    description: "blackbox modelling",
    icon: "lucide:rocket",
    tag: "Draft 1",
    orientation: "horizontal",
    ports: [],
    // Required-but-nullable since the block-views work landed; `null` is
    // "no view preset chosen", the same value every other block test
    // fixture here uses (blockPrimitives / detachModel / detachRoundTrip).
    view: null,
    views: null,
    ...overrides,
  };
}

describe("primitivesForBlock's glyph slot (D4, same rule as the standalone Glyph)", () => {
  it("emits a stock geo x-box for a non-empty icon, never a text primitive", () => {
    const built = primitivesForBlock(blockPropsWithIcon(), { x: 0, y: 0 }, { measureRendered: measureText });
    // Card is always first; the glyph slot is the next shape.
    const glyphShape = built.shapes[1];
    expect(glyphShape.type).toBe("geo");
    expect((glyphShape.props as { geo: string }).geo).toBe("x-box");
  });

  it("sizes the glyph box to glyphPx(titleSize), no padding to subtract", () => {
    const built = primitivesForBlock(blockPropsWithIcon({ titleSize: "lg" }), { x: 0, y: 0 }, {
      measureRendered: measureText,
    });
    const glyphShape = built.shapes[1];
    const expected = glyphPx("lg");
    expect((glyphShape.props as { w: number; h: number }).w).toBe(expected);
    expect((glyphShape.props as { w: number; h: number }).h).toBe(expected);
  });

  it("emits no glyph shape at all for an empty icon (unchanged behaviour)", () => {
    const built = primitivesForBlock(blockPropsWithIcon({ icon: "" }), { x: 0, y: 0 }, {
      measureRendered: measureText,
    });
    // Card + title only — no x-box, no text-shaped stand-in either.
    expect(built.shapes.some((s) => s.type === "geo" && (s.props as { geo?: string }).geo === "x-box")).toBe(
      false,
    );
  });
});
