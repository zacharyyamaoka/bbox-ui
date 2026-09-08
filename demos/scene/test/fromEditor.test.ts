import { describe, expect, it } from "vitest";

import {
  extractionSummary,
  sceneFromEditor,
  type SceneSource,
} from "../src/fromEditor";

/** A stubbed editor — the extraction only reads getCurrentPageShapes(). */
function stubEditor(shapes: ReturnType<SceneSource["getCurrentPageShapes"]>) {
  return { getCurrentPageShapes: () => shapes } satisfies SceneSource;
}

const blockShape = {
  id: "shape:blk1",
  type: "bbox-block",
  x: 120,
  y: 80,
  props: {
    w: 384,
    h: 258,
    title: "Detect",
    titleSize: "xl",
    blockType: "dataflow",
    description: "",
    icon: "🔍",
    tag: "",
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
    ],
  },
};

const portShape = {
  id: "shape:prt1",
  type: "bbox-port",
  x: 700,
  y: 300,
  props: {
    w: 25,
    h: 25,
    state: "empty",
    size: "md",
    label: "tick",
    textLayout: "right",
  },
};

describe("sceneFromEditor", () => {
  it("projects bbox-block shapes into scene blocks in world coordinates", () => {
    const { scene, blockCount, comparedShapeCount } = sceneFromEditor(
      stubEditor([blockShape]),
    );
    expect(blockCount).toBe(1);
    expect(comparedShapeCount).toBe(1);
    const block = scene.blocks[0];
    expect(block).toMatchObject({
      id: "blk1", // shape: prefix stripped so createShapeId round-trips
      x: 120,
      y: 80,
      w: 384,
      h: 258,
      title: "Detect",
      blockType: "dataflow",
      icon: "🔍",
    });
    expect(block.ports).toHaveLength(1);
    expect(block.ports[0]).toMatchObject({ id: "image", side: "left", t: 0.35 });
  });

  it('normalizes tldraw\'s stored "" to undefined so React Flow renders no slot', () => {
    // "" through to React Flow would render an EMPTY slot element and shift
    // the hug-contents geometry off the tldraw host's fixed w/h.
    const { scene } = sceneFromEditor(stubEditor([blockShape]));
    expect(scene.blocks[0].description).toBeUndefined();
    expect(scene.blocks[0].tag).toBeUndefined();
  });

  it("wraps standalone bbox-port shapes and counts them separately", () => {
    const { scene, standalonePortCount, comparedShapeCount } = sceneFromEditor(
      stubEditor([portShape]),
    );
    expect(standalonePortCount).toBe(1);
    expect(comparedShapeCount).toBe(1);
    expect(scene.blocks).toHaveLength(0);
    expect(scene.standalonePorts).toEqual([
      {
        id: "prt1",
        x: 700,
        y: 300,
        w: 25,
        h: 25,
        state: "empty",
        size: "md",
        label: "tick",
        textLayout: "right",
      },
    ]);
  });

  it("counts stock tldraw shapes by type instead of silently dropping them", () => {
    const extraction = sceneFromEditor(
      stubEditor([
        blockShape,
        portShape,
        { id: "shape:g1", type: "geo", x: 0, y: 0, props: {} },
        { id: "shape:g2", type: "geo", x: 10, y: 10, props: {} },
        { id: "shape:a1", type: "arrow", x: 5, y: 5, props: {} },
      ]),
    );
    expect(extraction.comparedShapeCount).toBe(2);
    expect(extraction.stockShapeCount).toBe(3);
    expect(extraction.stockShapeTypes).toEqual({ geo: 2, arrow: 1 });
    expect(extraction.totalShapeCount).toBe(5);
  });

  it("yields an empty scene with honest counts for an empty board", () => {
    const extraction = sceneFromEditor(stubEditor([]));
    expect(extraction.scene.blocks).toHaveLength(0);
    expect(extraction.scene.standalonePorts).toHaveLength(0);
    expect(extraction.comparedShapeCount).toBe(0);
    expect(extraction.totalShapeCount).toBe(0);
  });
});

describe("extractionSummary", () => {
  it("states the denominator and names the excluded stock shapes", () => {
    const summary = extractionSummary({
      comparedShapeCount: 4,
      standalonePortCount: 0,
      stockShapeTypes: { geo: 5, arrow: 1, text: 1 },
      stockShapeCount: 7,
      totalShapeCount: 11,
    });
    expect(summary.empty).toBe(false);
    expect(summary.headline).toBe(
      "comparing 4 of 11 shapes — 7 stock tldraw shapes (geo ×5, arrow ×1, text ×1) have no React Flow counterpart",
    );
  });

  it("discloses the standalone-port wrapper instead of hiding it", () => {
    const summary = extractionSummary({
      comparedShapeCount: 2,
      standalonePortCount: 1,
      stockShapeTypes: { geo: 1 },
      stockShapeCount: 1,
      totalShapeCount: 3,
    });
    expect(summary.headline).toContain("comparing 2 of 3 shapes");
    expect(summary.headline).toContain("1 stock tldraw shape (geo ×1)");
    expect(summary.notes).toEqual([
      "1 standalone port compared via a chrome-less React Flow wrapper node",
    ]);
  });

  it("is EMPTY, never a clean zero, when the board has no bbox-ui shapes", () => {
    // Zero things compared is not agreement — the single most likely way
    // this feature could lie is rendering "max |Δ| = 0.00 px" here.
    const summary = extractionSummary({
      comparedShapeCount: 0,
      standalonePortCount: 0,
      stockShapeTypes: { note: 2 },
      stockShapeCount: 2,
      totalShapeCount: 2,
    });
    expect(summary.empty).toBe(true);
    expect(summary.headline).toContain("no bbox-ui shapes");
    expect(summary.headline).toContain(
      "2 stock tldraw shapes (note ×2) have no React Flow counterpart",
    );
    expect(summary.headline).not.toContain("0.00");
  });

  it("is empty with no stock clause on a truly blank board", () => {
    const summary = extractionSummary({
      comparedShapeCount: 0,
      standalonePortCount: 0,
      stockShapeTypes: {},
      stockShapeCount: 0,
      totalShapeCount: 0,
    });
    expect(summary.empty).toBe(true);
    expect(summary.headline).toBe(
      "Nothing to compare — this board has no bbox-ui shapes.",
    );
  });
});
