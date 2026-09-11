import { describe, expect, it } from "vitest";

import { PORT_LABEL_GAP, TEXT_SIZES } from "@bbox-ui/core";

import { primitivesForPort } from "../src/detach/portPrimitives";

const STOCK_TYPES = new Set(["geo", "text", "line", "arrow", "draw", "note", "frame"]);

describe("primitivesForPort", () => {
  it("produces only stock tldraw shape types", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "wired", label: "image", textLayout: "right" },
      { x: 0, y: 0 },
    );
    for (const partial of built.shapes) {
      expect(STOCK_TYPES.has(partial.type)).toBe(true);
      expect(partial.type.startsWith("bbox-")).toBe(false);
    }
  });

  it("an empty unlabeled port is exactly the hollow ring", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "empty", label: "", textLayout: "right" },
      { x: 100, y: 200 },
    );
    expect(built.shapes).toHaveLength(1);
    const ring = built.shapes[0];
    expect(ring.type).toBe("geo");
    expect(ring.x).toBe(100);
    expect(ring.y).toBe(200);
    expect(ring.props).toMatchObject({ geo: "ellipse", w: 25, h: 25, fill: "none" });
    expect(built.ringId).toBe(ring.id);
  });

  // INTEGRATION (docs/T1-SPEC.md §2, appearance.ts's STATE_TOKENS): the live
  // dot now paints `wired` as ONE fully-filled disc (ring token === fill
  // token) rather than a hollow ring plus a separate small accent core —
  // there is no second "inner" shape left to assert on; the ring itself
  // carries the orange fill. See portPrimitives.ts's STATE_STOCK_RING.
  it("wired is a single solid orange disc, not a ring plus an accent core", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "wired", label: "", textLayout: "right" },
      { x: 0, y: 0 },
    );
    expect(built.shapes).toHaveLength(1);
    expect(built.shapes[0].props).toMatchObject({
      geo: "ellipse",
      w: 25,
      h: 25,
      color: "orange",
      fill: "fill",
    });
  });

  it("valueSet state is the muted wash, not the hollow ring", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "valueSet", label: "", textLayout: "right" },
      { x: 0, y: 0 },
    );
    expect(built.shapes[0].props).toMatchObject({ color: "grey", fill: "solid" });
  });

  it("places a right-layout label one gap clear of the dot's edge", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "empty", label: "tick", textLayout: "right" },
      { x: 0, y: 0 },
    );
    const label = built.shapes.find((partial) => partial.type === "text")!;
    expect(label).toBeDefined();
    expect(label.x).toBe(25 + PORT_LABEL_GAP);
    // The label rides the md rung at scale 1 — no snapping to another size.
    expect(label.props).toMatchObject({ size: "m", scale: 1 });
  });

  it("a left-layout label ends one gap short of the dot", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "empty", label: "tick", textLayout: "left" },
      { x: 0, y: 0 },
    );
    const label = built.shapes.find((partial) => partial.type === "text")!;
    const labelProps = label.props as { w: number; scale: number };
    // textAt aligns the widened text box's right edge to the layout box's
    // right edge, which portLabelBox pinned at -gap.
    expect(label.x! + labelProps.w * labelProps.scale).toBeCloseTo(-PORT_LABEL_GAP);
    expect(TEXT_SIZES.md).toBe(24);
  });
});
