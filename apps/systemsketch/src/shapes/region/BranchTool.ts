// src/shapes/region/BranchTool.ts — arming and placing a BRANCH region.
//
// The same stock `BaseBoxShapeTool` gesture as `./LoopTool.ts`, whose header
// carries the full reasoning for the preset arming (and the measurement that
// rules `onCreate` out). What differs is only the data: a branch starts with
// two arms.
import { BaseBoxShapeTool } from "tldraw";

import { BRANCH_TOOL_ID, REGION_SHAPE_TYPE } from "../types";
import { armRegionPreset, type RegionPreset } from "./cornerBlock";

/**
 * `if` / `else`, open, at the trunk's own default arm height.
 *
 * WHY two arms and not one: an `if` with no alternative is a bare scope, and
 * the shape that already means that is a plain region. The construct a Branch
 * row places is the one Zach's sketches draw — a selector with a row per
 * outcome (`Pasted image 20260918143241.png`). A third arm (`elif`, another
 * `case`) is an ordinary edit to `props.arms`, never a new shape type: "one
 * Branch with N arms rather than an if component and a match component"
 * (`@trunk/presets/branch/branch.ts`).
 *
 * `title` is free text as an author writes it — `if fast:` — never code to be
 * parsed back; `id` is the stable handle a member's `parentId` will one day
 * name.
 */
export const BRANCH_PRESET: RegionPreset = {
  kind: "branch",
  name: "Branch",
  toolId: BRANCH_TOOL_ID,
  arms: [
    { id: "if", title: "if", open: true, h: 160 },
    { id: "else", title: "else", open: true, h: 160 },
  ],
};

export class BranchTool extends BaseBoxShapeTool {
  static override id = BRANCH_TOOL_ID;
  static override initial = "idle";
  override shapeType = REGION_SHAPE_TYPE;

  private disarm: (() => void) | null = null;

  override onEnter() {
    this.disarm?.();
    this.disarm = armRegionPreset(this.editor, BRANCH_PRESET);
  }

  override onExit() {
    this.disarm?.();
    this.disarm = null;
  }
}
