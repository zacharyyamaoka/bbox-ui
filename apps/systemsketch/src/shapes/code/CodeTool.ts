// src/shapes/code/CodeTool.ts — arming and placing an `ss-code`.
//
// Stock `BaseBoxShapeTool` and nothing else, exactly as BlockTool: a click
// drops `getDefaultProps()`'s 320x120 box centred on the point, a drag sizes
// it, and cancel / tool-lock / undo are the engine's. Everything is a block,
// and a block is placed one way — Code does not get its own gesture.
import { BaseBoxShapeTool } from "tldraw";

import { CODE_SHAPE_TYPE, CODE_TOOL_ID } from "../types";

export class CodeTool extends BaseBoxShapeTool {
  static override id = CODE_TOOL_ID;
  static override initial = "idle";
  override shapeType = CODE_SHAPE_TYPE;
}
