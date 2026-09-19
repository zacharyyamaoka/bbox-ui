// src/shapes/port/index.ts — the floating-Port kit (lane L2).
//
// A floating port is the smallest block: a one-port node. That is why it binds
// a wire at all, and why its single measured anchor always carries
// `FLOATING_PORT_ID` — "everything is really a block" applies to the one-port
// case too (plan §2, §6's L2 row). Its anchor is a DATA endpoint and nothing
// in this kit draws a line; control flow is containment and marks.
//
// WHY `createElement` instead of JSX (kept verbatim from block/index.ts):
// src/document/stockBoundary.test.ts requires every kind to publish its kit
// from `index.ts` exactly ("a missing directory is a broken registry"), and a
// `.ts` file cannot carry JSX. One icon element is not worth a second file.
import { createElement } from "react";
import { CircleDot } from "lucide-react";

import type { ShapeKit } from "../registry";
import { PORT_TOOL_ID } from "../types";
import { PortShapeUtil } from "./PortShapeUtil";
import { PortTool } from "./PortTool";

export { PortShapeUtil, type PortDirection, type PortShape, type PortShapeProps } from "./PortShapeUtil";
export { PortTool } from "./PortTool";
export { PortFace } from "./PortFace";

export const portKit: ShapeKit = {
  shapeUtils: [PortShapeUtil],
  bindingUtils: [],
  tools: [PortTool],
  // A row of the ONE system family. WHY no `shortcutHint` beside it, where
  // Block carries "B": the dock renders the hint as TEXT inside the row
  // (toolDock.tsx:331 `DropdownMenuShortcut`), so the row would read "PortP"
  // — and `src/port.smoke.test.tsx` finds this row by `/^\s*port\s*$/i` on its
  // textContent, which is the acceptance writing that rule down. A hint is
  // display only anyway (`ToolItem.shortcutHint`'s own doc); the real
  // keybinding would be a `kbd` in the `toolUi` entry below, and adding one is
  // a two-line change once Zach picks the letter.
  familyItems: [{ id: PORT_TOOL_ID, label: "Port", icon: createElement(CircleDot) }],
  toolUi: (editor, tools) => ({
    ...tools,
    // Without this entry the dock row is a SILENT NO-OP: tldraw's `useTools()`
    // only builds entries for its own stock list, so a tool passed through
    // `<Tldraw tools={…}>` has a state machine and no UI entry (the `toolUi`
    // contract in ../registry, and archive
    // src/bboxUi/adapter/bboxToolUi.tsx:15-25).
    [PORT_TOOL_ID]: {
      id: PORT_TOOL_ID,
      label: "Port",
      // A stock tldraw icon name, resolved from the app's self-hosted asset
      // map: a dot is what a port is.
      icon: "geo-ellipse",
      onSelect: () => {
        editor.setCurrentTool(PORT_TOOL_ID);
      },
    },
  }),
};
