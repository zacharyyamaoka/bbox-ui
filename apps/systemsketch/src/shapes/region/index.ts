// src/shapes/region/index.ts — the Region kit (lane L5): Loop and Branch.
//
// A region is a NODE KIND, isolated — never an occurrence of a shared
// definition, so `ss-region` carries no `definitionId` and `sceneFromRecords`
// never mints one (`@trunk/scene/region.ts:4-26`; Zach, 2026-09-18: "100% its
// a node ... 100% region is isolated").
//
// The two load-bearing ideas, as this directory spends them:
//   • EVERYTHING IS A BLOCK — a region's header contract is a real `ss-block`
//     CHILD in its top-left corner (`./cornerBlock.ts`), so a loop's
//     `Iterable` is wired by the same gesture as any other port. The region
//     itself has no ports and no port schema.
//   • NEVER MIX DATA AND CONTROL LINES — control flow is CONTAINMENT (tldraw
//     frame parenting) plus arm rows; the region refuses every wire binding
//     (`RegionShapeUtil.canBind` → false), and a `break` will be a mark, never
//     a cable.
//
// TWO ROWS, ONE SHAPE TYPE. Loop and Branch are dock rows over the same
// `ss-region`, which is why each tool arms a preset rather than naming its own
// shape (see `./LoopTool.ts`'s header). `while` is the Loop's other header
// contract, reached from a view control on a placed region — L4's floating
// toolbar owns that file, so it is OWED wiring, not a third row.
//
// WHY `createElement` instead of JSX (kept verbatim from block/index.ts):
// src/document/stockBoundary.test.ts requires every kind to publish its kit
// from `index.ts` exactly ("a missing directory is a broken registry"), and a
// `.ts` file cannot carry JSX.
import { createElement } from "react";
import { GitBranch, Repeat } from "lucide-react";

import type { ShapeKit } from "../registry";
import { BRANCH_TOOL_ID, LOOP_TOOL_ID } from "../types";
import { BranchTool } from "./BranchTool";
import { installRegionKit } from "./cornerBlock";
import { LoopTool } from "./LoopTool";
import { RegionShapeUtil } from "./RegionShapeUtil";

export { RegionShapeUtil, type RegionArm, type RegionKind, type RegionShape, type RegionShapeProps } from "./RegionShapeUtil";
export { RegionFace } from "./RegionFace";
export { BranchTool, BRANCH_PRESET } from "./BranchTool";
export { LoopTool, FOR_LOOP_PRESET } from "./LoopTool";
export {
  cornerBlockPropsFor,
  cornerBlockOf,
  createCornerBlock,
  installRegionKit,
  isRegionPlaceholder,
  reconcileRegionProps,
  regionHugHeightOf,
  regionLayoutOf,
  regionMinHeightOf,
  REGION_MIN_HEIGHT_PX,
  type RegionPreset,
} from "./cornerBlock";

export const regionKit: ShapeKit = {
  shapeUtils: [RegionShapeUtil],
  bindingUtils: [],
  tools: [LoopTool, BranchTool],
  // Two permanent repairs, neither of which any TOOL can own because neither
  // is a gesture: a duplicated region must stop naming the original's corner
  // block, and a frame must follow the card it hugs once that card has
  // measured itself. Full reasoning in `./cornerBlock`'s `installRegionKit`.
  install: installRegionKit,
  // Two more rows of the ONE system family, after Block, Code and Port. No
  // `shortcutHint` on either: the dock renders the hint as TEXT inside the row
  // (toolDock.tsx's `DropdownMenuShortcut`), and neither construct has a
  // letter Zach has picked — a hint for a keybinding that does not exist would
  // be a row that lies. Adding one is a `kbd` in the `toolUi` entry below plus
  // the hint here, two lines, once he does.
  familyItems: [
    { id: LOOP_TOOL_ID, label: "Loop", icon: createElement(Repeat) },
    { id: BRANCH_TOOL_ID, label: "Branch", icon: createElement(GitBranch) },
  ],
  toolUi: (editor, tools) => ({
    ...tools,
    // Without these entries both dock rows are SILENT NO-OPS: tldraw's
    // `useTools()` only builds entries for its own stock list, so a tool
    // passed through `<Tldraw tools={…}>` has a state machine and no UI entry
    // (the `toolUi` contract in ../registry, and archive
    // src/bboxUi/adapter/bboxToolUi.tsx:15-25).
    [LOOP_TOOL_ID]: {
      id: LOOP_TOOL_ID,
      label: "Loop",
      // Stock tldraw icon names, resolved from the app's self-hosted asset
      // map: a cycle for the loop, the flowchart decision diamond for the
      // branch.
      icon: "arrow-cycle",
      onSelect: () => {
        editor.setCurrentTool(LOOP_TOOL_ID);
      },
    },
    [BRANCH_TOOL_ID]: {
      id: BRANCH_TOOL_ID,
      label: "Branch",
      icon: "geo-rhombus",
      onSelect: () => {
        editor.setCurrentTool(BRANCH_TOOL_ID);
      },
    },
  }),
};
