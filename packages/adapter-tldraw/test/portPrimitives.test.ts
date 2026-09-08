import { describe, expect, it } from "vitest";

import { PORT_LABEL_GAP, TEXT_SIZES, wiredInnerPx } from "@bbox-ui/core";

import { primitivesForPort } from "../src/detach/portPrimitives";

const STOCK_TYPES = new Set(["geo", "text", "line", "arrow", "draw", "note", "frame"]);

describe("primitivesForPort", () => {
  it("produces only stock tldraw shape types", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "wired", size: "md", label: "image", textLayout: "right" },
      { x: 0, y: 0 },
    );
    for (const partial of built.shapes) {
      expect(STOCK_TYPES.has(partial.type)).toBe(true);
      expect(partial.type.startsWith("bbox-")).toBe(false);
    }
  });

  it("an empty unlabeled port is exactly the hollow ring", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "empty", size: "md", label: "", textLayout: "right" },
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

  it("wired adds the accent core at the fixed rung diameter, centered", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "wired", size: "md", label: "", textLayout: "right" },
      { x: 0, y: 0 },
    );
    expect(built.shapes).toHaveLength(2);
    const inner = built.shapes[1];
    const dia = wiredInnerPx("md");
    expect(inner.props).toMatchObject({ geo: "ellipse", w: dia, h: dia, color: "orange" });
    expect(inner.x).toBeCloseTo(12.5 - dia / 2);
    expect(inner.y).toBeCloseTo(12.5 - dia / 2);
  });

  it("default state is the muted wash, not the hollow ring", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "default", size: "md", label: "", textLayout: "right" },
      { x: 0, y: 0 },
    );
    expect(built.shapes[0].props).toMatchObject({ color: "grey", fill: "solid" });
  });

  it("places a right-layout label one gap clear of the dot's edge", () => {
    const built = primitivesForPort(
      { w: 25, h: 25, state: "empty", size: "md", label: "tick", textLayout: "right" },
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
      { w: 25, h: 25, state: "empty", size: "md", label: "tick", textLayout: "left" },
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
