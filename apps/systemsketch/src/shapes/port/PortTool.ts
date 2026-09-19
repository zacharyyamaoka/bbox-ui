// src/shapes/port/PortTool.ts — arming and placing an `ss-port`.
//
// Stock `BaseBoxShapeTool` and nothing else, exactly as BlockTool: a click
// drops `getDefaultProps()`'s 120×32 box at the point, and cancel, tool-lock
// and undo stay the engine's. The archive's own floating-port tool was the
// same subclass (/home/bam/systemsketch/src/floatingPort/FloatingPortTool.ts:
// "a click makes a one-dot Port at the pointer; a drag is still stock box-tool
// creation").
import { BaseBoxShapeTool } from "tldraw";

import { PORT_SHAPE_TYPE, PORT_TOOL_ID } from "../types";

export class PortTool extends BaseBoxShapeTool {
  static override id = PORT_TOOL_ID;
  static override initial = "idle";
  override shapeType = PORT_SHAPE_TYPE;
}
