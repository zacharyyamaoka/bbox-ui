// src/shapes/block/blockPlacement.test.ts — P-045's grammar, in the `unit`
// project (plain node, milliseconds). The BROWSER half of this item — that a
// real drag on a real board actually lands these views — is
// `src/blockPlacement.smoke.test.tsx`.
import { readFileSync } from "node:fs";
import path from "node:path";

import { BaseBoxShapeTool } from "tldraw";
import { describe, expect, it } from "vitest";

import { BlockTool } from "./BlockTool";
import {
  BLOCK_EXPANDED_PLACEMENT_H_PX,
  BLOCK_EXPANDED_PLACEMENT_W_PX,
  BLOCK_PORT_PLACEMENT_H_PX,
  BLOCK_PORT_PLACEMENT_W_PX,
  blockViewForPlacement,
} from "./blockPlacement";

const PORT_W = BLOCK_PORT_PLACEMENT_W_PX;
const PORT_H = BLOCK_PORT_PLACEMENT_H_PX;
const BIG_W = BLOCK_EXPANDED_PLACEMENT_W_PX;
const BIG_H = BLOCK_EXPANDED_PLACEMENT_H_PX;

const drag = (w: number, h: number, enclosesShapes = false) => blockViewForPlacement({ kind: "drag", w, h, enclosesShapes });

describe("P-045 — the placement gesture picks the Block's view", () => {
  it("sentence 1: a click is simple, and it is a click — not the default box run through the ladder", () => {
    expect(blockViewForPlacement({ kind: "click" })).toBe("simple");
  });

  it("sentence 2: a very small drag is simple, with NO minimum size clamped anywhere", () => {
    expect(drag(1, 1)).toBe("simple");
    expect(drag(40, 24)).toBe("simple");
    expect(drag(PORT_W - 1, PORT_H - 1)).toBe("simple");
  });

  it("sentence 3: a block-sized drag is port, and BOTH dimensions have to clear the rung", () => {
    expect(drag(PORT_W, PORT_H)).toBe("port");
    expect(drag(BIG_W - 1, BIG_H - 1)).toBe("port");
    // A wide short band is a caption card; a tall narrow strip is not a canvas.
    expect(drag(BIG_W, PORT_H - 1)).toBe("simple");
    expect(drag(PORT_W - 1, BIG_H)).toBe("simple");
  });

  it("sentence 5: a really big drag is expanded even around empty canvas", () => {
    expect(drag(BIG_W, BIG_H)).toBe("expanded");
    expect(drag(BIG_W * 3, BIG_H * 3)).toBe("expanded");
    // Both dimensions again: a very wide, port-tall band stays port.
    expect(drag(BIG_W * 2, BIG_H - 1)).toBe("port");
  });

  it("sentence 4: enclosing anything wins outright, at ANY size", () => {
    expect(drag(1, 1, true)).toBe("expanded");
    expect(drag(PORT_W, PORT_H, true)).toBe("expanded");
    expect(drag(BIG_W, BIG_H, true)).toBe("expanded");
  });

  it("the port rung IS the app's own canonical block box — the two do not drift", () => {
    // Asserted against the SOURCE rather than by importing `BlockShapeUtil`,
    // which pulls React, the trunk components and the engine into a node test
    // for two integers. If `getDefaultProps` is re-sized, this goes red and
    // the rung has to move with it.
    const source = readFileSync(path.join(__dirname, "BlockShapeUtil.tsx"), "utf8");
    const defaults = /getDefaultProps\(\): BlockShapeProps \{[\s\S]*?\n {2}\}/.exec(source)?.[0];
    expect(defaults, "getDefaultProps() in BlockShapeUtil.tsx").toBeTruthy();
    expect(defaults).toContain(`w: ${PORT_W},`);
    expect(defaults).toContain(`h: ${PORT_H},`);
  });

  it("the click rung has a state to hang on: BlockTool substitutes its own `pointing` child", () => {
    // The whole click branch depends on tldraw still calling this state
    // `pointing`. If an upgrade renames it, `BlockTool.ts` throws at import —
    // so reaching this line at all is half the assertion.
    const stock = BaseBoxShapeTool.children().find((child) => child.id === "pointing");
    expect(stock).toBeTruthy();
    const ours = BlockTool.children().find((child) => child.id === "pointing");
    expect(ours).toBeTruthy();
    expect(ours).not.toBe(stock);
    // and the other children are still tldraw's own, untouched.
    expect(BlockTool.children().filter((child) => child.id !== "pointing")).toEqual(BaseBoxShapeTool.children().filter((child) => child.id !== "pointing"));
  });
});
