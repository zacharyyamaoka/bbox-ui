import { BaseBoxShapeTool } from "tldraw";

export const BBOX_BLOCK_TOOL_ID = "bbox-block";
export const BBOX_PORT_TOOL_ID = "bbox-port";

/**
 * The toolbar tools. Both extend `BaseBoxShapeTool` so the stock box tool
 * owns pointer capture, click/drag creation, resize, cancellation, history
 * and tool locking — nothing here is a miniature drawing state machine.
 * A click drops the shape at its default size; a drag sizes it.
 */
export class BBoxBlockTool extends BaseBoxShapeTool {
  static override id = BBOX_BLOCK_TOOL_ID;
  static override initial = "idle";
  override shapeType = "bbox-block" as const;
}

export class BBoxPortTool extends BaseBoxShapeTool {
  static override id = BBOX_PORT_TOOL_ID;
  static override initial = "idle";
  override shapeType = "bbox-port" as const;
}
