// src/shapes/code/index.ts — the Code kit (lane L1).
//
// WHY `createElement` instead of JSX: src/document/stockBoundary.test.ts
// requires every kind to publish its kit from `index.ts` exactly ("a missing
// directory is a broken registry"), and a `.ts` file cannot carry JSX. Same
// call block/index.ts made.
//
// This file replaces L0's placeholder whole. The SCHEMA it carried moved to
// ./CodeShapeUtil.tsx unchanged — one contract, one arbiter
// (src/document/documentModel.test.ts's "ss-code (L1)").
import { createElement } from "react";
import { Code2 } from "lucide-react";

import type { ShapeKit } from "../registry";
import { CODE_TOOL_ID } from "../types";
import { CodeShapeUtil } from "./CodeShapeUtil";
import { CodeTool } from "./CodeTool";

export { CodeShapeUtil, type CodeShape, type CodeShapeProps, type CodeLanguage, type CodeOrigin } from "./CodeShapeUtil";
export { CodeTool } from "./CodeTool";
export { CodeFace } from "./CodeFace";

export const codeKit: ShapeKit = {
  shapeUtils: [CodeShapeUtil],
  bindingUtils: [],
  tools: [CodeTool],
  // The second row of the ONE system family. There is no "code" family and no
  // second slot: a Code node is a block-shaped thing placed from the same
  // dock face as a Block, which is the whole point of Zach's "lets just have
  // the 1 icon".
  familyItems: [{ id: CODE_TOOL_ID, label: "Code", icon: createElement(Code2) }],
  toolUi: (editor, tools) => ({
    ...tools,
    // Archive src/bboxUi/adapter/bboxToolUi.tsx:15-25, restated by
    // registry.ts's `ShapeKit.toolUi` doc: a tool passed through
    // `<Tldraw tools={…}>` has a state machine and NO UI entry, so without
    // this the dock row renders and the press does nothing.
    //
    // WHY no `kbd` where Block has `b`: a single letter is a global binding
    // in tldraw's UI, and this lane has no mandate to spend one — the row and
    // its label are the discoverable surface. A shortcut is a later, deliberate
    // choice (and `shortcutHint` on the row above would otherwise be a lie).
    [CODE_TOOL_ID]: {
      id: CODE_TOOL_ID,
      label: "Code",
      icon: "tool-text",
      onSelect: () => {
        editor.setCurrentTool(CODE_TOOL_ID);
      },
    },
  }),
};
