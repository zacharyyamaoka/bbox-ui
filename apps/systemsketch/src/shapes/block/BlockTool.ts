// src/shapes/block/BlockTool.ts — arming and placing an `ss-block`.
//
// Stock `BaseBoxShapeTool` and nothing else: click drops `getDefaultProps()`'s
// box centred on the point, drag sizes it, and cancel/tool-lock/undo are the
// engine's. That is the whole reason the rebuild starts from plain tldraw
// (plan §4, "Shape creation gesture").
import { BaseBoxShapeTool } from "tldraw";

import { BLOCK_SHAPE_TYPE, BLOCK_TOOL_ID } from "../types";

export class BlockTool extends BaseBoxShapeTool {
  static override id = BLOCK_TOOL_ID;
  static override initial = "idle";
  override shapeType = BLOCK_SHAPE_TYPE;
}
