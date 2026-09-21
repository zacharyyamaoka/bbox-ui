// src/shapes/block/index.ts — the Block kit (lane L0).
//
// WHY `createElement` instead of JSX: src/document/stockBoundary.test.ts
// requires every kind to publish its kit from `index.ts` exactly ("a missing
// directory is a broken registry"), and a `.ts` file cannot carry JSX. One
// icon element is not worth a second file.
import { createElement } from "react";
import { Box } from "lucide-react";

import { releaseShortcut, type ShapeKit } from "../registry";
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
  // default (src/chrome/ShareMenu/preferences.ts's `lastSystemTool`).
  familyItems: [{ id: BLOCK_TOOL_ID, label: "Block", icon: createElement(Box), shortcutHint: "B" }],
  toolUi: (editor, tools) => ({
    // `b` is the Block's, and nothing else's. Zach, 2026-09-21: "Yes, please
    // unbind B from pencil". tldraw ships draw as `kbd: "d,b,x"` and its
    // dispatcher fires EVERY tool that matches a key, so without this release
    // pressing B armed the pencil and then the Block — a visible flash of the
    // wrong tool. `releaseShortcut` explains the dispatcher; what belongs
    // HERE is that the claim and the release sit in one object literal, so
    // the key cannot be given up without also being let go of, or let go of
    // without anyone noticing it is now unclaimed.
    ...releaseShortcut(tools, "draw", "b"),
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
