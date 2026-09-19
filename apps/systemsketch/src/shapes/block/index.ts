// src/shapes/block/index.ts — the Block kit (lane L0).
//
// WHY `createElement` instead of JSX: src/document/stockBoundary.test.ts
// requires every kind to publish its kit from `index.ts` exactly ("a missing
// directory is a broken registry"), and a `.ts` file cannot carry JSX. One
// icon element is not worth a second file.
import { createElement } from "react";
import { Box } from "lucide-react";

import type { ShapeKit } from "../registry";
import { BLOCK_TOOL_ID } from "../types";
import { BlockShapeUtil } from "./BlockShapeUtil";
import { BlockTool } from "./BlockTool";

export { BlockShapeUtil, type BlockShape, type BlockShapeProps } from "./BlockShapeUtil";
export { BlockTool } from "./BlockTool";

export const blockKit: ShapeKit = {
  shapeUtils: [BlockShapeUtil],
  bindingUtils: [],
  tools: [BlockTool],
  // The first row of the ONE system family, and the tool its face arms by
  // default (src/chrome/preferences.ts's `lastSystemTool`).
  familyItems: [{ id: BLOCK_TOOL_ID, label: "Block", icon: createElement(Box), shortcutHint: "B" }],
  toolUi: (editor, tools) => ({
    ...tools,
    // Archive src/bboxUi/adapter/bboxToolUi.tsx:15-25: without this entry the
    // dock row and the `B` shortcut are a silent no-op — the state machine is
    // registered, but tldraw's `useTools()` has nothing to select.
    [BLOCK_TOOL_ID]: {
      id: BLOCK_TOOL_ID,
      label: "Block",
      icon: "geo-rectangle",
      kbd: "b",
      onSelect: () => {
        editor.setCurrentTool(BLOCK_TOOL_ID);
      },
    },
  }),
};
