// src/shapes/region/LoopTool.ts — arming and placing a LOOP region.
//
// Stock `BaseBoxShapeTool` for the gesture itself, exactly as the block, code
// and port tools: a click drops the default frame at the point, a drag sizes
// it, and cancel / tool-lock / undo stay the engine's. The archive's own loop
// tool was the same subclass (`/home/bam/systemsketch/src/loop/LoopTool.ts`).
//
// What this tool adds is the only thing that cannot come from the shape: WHICH
// KIND of region it is. `ss-region` is one shape type serving two dock rows,
// so `getDefaultProps()` cannot know, and the answer has to ride the armed
// tool. `armRegionPreset` is that arming, installed while the tool is the
// current one and removed when it is not — see its own WHY in `./cornerBlock`
// for why it is a pair of store side effects rather than `onCreate` (measured:
// `onCreate` never fires on the CLICK path in tldraw 5.3.2, and the acceptance
// test clicks).
//
// A `while` loop is the same tool with the other header contract. Reaching it
// is a VIEW control on the placed region — L4's floating toolbar, whose file
// is not in this lane's write set — so today Loop places a `for` and `while`
// is owed that one wiring.
import { BaseBoxShapeTool } from "tldraw";

import { LOOP_TOOL_ID, REGION_SHAPE_TYPE } from "../types";
import { armRegionPreset, type RegionPreset } from "./cornerBlock";

/** `for item in iterable` — the default a Loop row places. Typed header,
 *  unnamed (DP - Loop), no arms: a loop's body is the frame itself, so it
 *  needs no titled rows the way a branch does. */
export const FOR_LOOP_PRESET: RegionPreset = { kind: "for", name: "For Loop", arms: [] };

export class LoopTool extends BaseBoxShapeTool {
  static override id = LOOP_TOOL_ID;
  static override initial = "idle";
  override shapeType = REGION_SHAPE_TYPE;

  private disarm: (() => void) | null = null;

  override onEnter() {
    this.disarm?.();
    this.disarm = armRegionPreset(this.editor, FOR_LOOP_PRESET);
  }

  override onExit() {
    this.disarm?.();
    this.disarm = null;
  }
}
