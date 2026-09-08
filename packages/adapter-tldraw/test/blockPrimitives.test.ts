import { beforeEach, describe, expect, it, vi } from "vitest";

import { PORT_DIAMETERS, TEXT_SIZES, layoutSimpleBlock, portAnchor } from "@bbox-ui/core";

import type { BBoxBlockShapeProps } from "../src/block-shape-util";
import * as portPrimitivesModule from "../src/detach/portPrimitives";
import { primitivesForBlock, type BlockPrimitives } from "../src/detach/blockPrimitives";
import { measureText } from "../src/detach/stockPartials";

/** Plain text of the title primitive (the first text shape after the card). */
function titleTextOf(built: BlockPrimitives): string {
  const collectText = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const record = node as Record<string, unknown>;
    const own = typeof record.text === "string" ? record.text : "";
    const children = Array.isArray(record.content)
      ? record.content.map(collectText).join("")
      : "";
    return own + children;
  };
  const texts = built.shapes.filter((partial) => partial.type === "text");
  // Glyph (when present) precedes the title in paint order; skip it by its
  // single-glyph content matching the icon.
  const title = texts.find((partial) => {
    const text = collectText((partial.props as { richText?: unknown }).richText);
    return text !== "🔍";
  });
  return collectText((title?.props as { richText?: unknown })?.richText);
}

// Spy on the real module: the assertion below is that Block's reduction
// INVOKES Port's through the shared function — not that it happens to
// produce similar-looking circles of its own.
vi.mock("../src/detach/portPrimitives", { spy: true });

const STOCK_TYPES = new Set(["geo", "text", "line", "arrow", "draw", "note", "frame"]);

function blockProps(overrides: Partial<BBoxBlockShapeProps> = {}): BBoxBlockShapeProps {
  return {
    w: 384,
    h: 258,
    title: "Detect",
    titleSize: "xl",
    blockType: "dataflow",
    description: "blackbox modelling",
    icon: "🔍",
    tag: "Draft 1",
    orientation: "horizontal",
    ports: [
      {
        id: "image",
        direction: "input",
        state: "wired",
        size: "md",
        label: "image",
        textLayout: "right",
        side: "left",
        t: 0.35,
      },
      {
        id: "out",
        direction: "output",
        state: "empty",
        size: "md",
        label: "boxes",
        textLayout: "left",
        side: "right",
        t: 0.5,
      },
    ],
    ...overrides,
  };
}

describe("primitivesForBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces only stock tldraw shape types", () => {
    const built = primitivesForBlock(blockProps(), { x: 0, y: 0 });
    for (const partial of built.shapes) {
      expect(STOCK_TYPES.has(partial.type)).toBe(true);
    }
  });

  it("the card comes first, standing exactly where the Block stood", () => {
    const built = primitivesForBlock(blockProps(), { x: 50, y: 60 });
    const card = built.shapes[0];
    expect(card.id).toBe(built.cardId);
    expect(card.type).toBe("geo");
    expect(card.x).toBe(50);
    expect(card.y).toBe(60);
    expect(card.props).toMatchObject({ geo: "rectangle", w: 384, h: 258 });
  });

  it("does not re-implement the Port reduction — it invokes it, once per port", () => {
    const props = blockProps();
    primitivesForBlock(props, { x: 10, y: 20 });
    const spy = vi.mocked(portPrimitivesModule.primitivesForPort);
    expect(spy).toHaveBeenCalledTimes(props.ports.length);
    // ...at the anchor the shared layout module dictates, with the dot
    // centered on the container boundary.
    const first = props.ports[0];
    const dia = PORT_DIAMETERS[first.size];
    const anchor = portAnchor(first.side, first.t, props.w, props.h);
    expect(spy.mock.calls[0][1]).toEqual({
      x: 10 + anchor.x - dia / 2,
      y: 20 + anchor.y - dia / 2,
    });
    expect(spy.mock.calls[0][0]).toMatchObject({
      state: first.state,
      size: first.size,
      label: first.label,
      textLayout: first.textLayout,
    });
  });

  it("reports one port row per port, holding exactly that port's shapes", () => {
    const props = blockProps();
    const built = primitivesForBlock(props, { x: 0, y: 0 });
    expect(built.portRows.map((row) => row.portId)).toEqual(["image", "out"]);
    const allIds = new Set(built.shapes.map((partial) => partial.id));
    for (const row of built.portRows) {
      expect(row.shapeIds.length).toBeGreaterThan(0);
      for (const id of row.shapeIds) expect(allIds.has(id)).toBe(true);
    }
    // wired + label → ring, core, label; empty + label → ring, label.
    expect(built.portRows[0].shapeIds).toHaveLength(3);
    expect(built.portRows[1].shapeIds).toHaveLength(2);
  });

  it("ellipsizes a title that outgrows the header, like the live component", () => {
    const longTitle = "W".repeat(40);
    const props = blockProps({ title: longTitle, tag: "Draft 1", titleSize: "xl" });
    const built = primitivesForBlock(props, { x: 0, y: 0 });
    const emitted = titleTextOf(built);
    // Explicit ellipsis, never the full string wrapped over the card…
    expect(emitted).not.toBe(longTitle);
    expect(emitted.endsWith("…")).toBe(true);
    expect(longTitle.startsWith(emitted.slice(0, -1))).toBe(true);
    // …and the shortened string actually fits the room the chip leaves.
    const layout = layoutSimpleBlock({
      width: props.w,
      height: props.h,
      title: props.title,
      titleSize: props.titleSize,
      icon: props.icon,
      tag: props.tag,
      description: props.description,
      blockType: props.blockType,
      orientation: props.orientation,
      measure: measureText,
    });
    expect(measureText(emitted, TEXT_SIZES.xl, 500)).toBeLessThanOrEqual(
      layout.title!.w,
    );
  });

  it("a title that fits is emitted verbatim, ellipsis-free", () => {
    const built = primitivesForBlock(blockProps(), { x: 0, y: 0 });
    expect(titleTextOf(built)).toBe("Detect");
  });

  it("a chipless, portless, bare-title block still has its card and title", () => {
    const built = primitivesForBlock(
      blockProps({ icon: "", tag: "", description: "", blockType: "", ports: [] }),
      { x: 0, y: 0 },
    );
    expect(built.shapes).toHaveLength(2);
    expect(built.shapes[1].type).toBe("text");
    expect(built.portRows).toEqual([]);
  });
});
