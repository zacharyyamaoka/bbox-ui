import type {
  TLUiOverrides,
  TLUiToolItem,
  TLUiToolsContextType,
} from "tldraw";

import { BBOX_BLOCK_TOOL_ID, BBOX_PORT_TOOL_ID } from "@bbox-ui/adapter-tldraw";

import { BlockToolIcon, PortToolIcon } from "./icons";
import {
  updateToolbarPreferences,
  type DrawFamilyTool,
  type ShapeFamilyTool,
} from "./toolbarModel";

function withoutShortcut(
  kbd: string | undefined,
  shortcut: string,
): string | undefined {
  if (!kbd) return kbd;
  const next = kbd
    .split(",")
    .filter((candidate) => candidate.trim() !== shortcut)
    .join(",");
  return next || undefined;
}

/** Take one key away from every stock tool that has it, so a bbox tool can own it. */
function releaseShortcut(
  tools: TLUiToolsContextType,
  shortcut: string,
): TLUiToolsContextType {
  return Object.fromEntries(
    Object.entries(tools).map(([id, tool]) => [
      id,
      tool.kbd?.split(",").some((candidate) => candidate.trim() === shortcut)
        ? { ...tool, kbd: withoutShortcut(tool.kbd, shortcut) }
        : tool,
    ]),
  ) as TLUiToolsContextType;
}

function wrapTool(
  tool: TLUiToolItem | undefined,
  beforeSelect: () => void,
): TLUiToolItem | undefined {
  if (!tool) return undefined;
  return {
    ...tool,
    onSelect(source) {
      beforeSelect();
      tool.onSelect(source);
    },
  };
}

const REMEMBERED_SHAPE_TOOLS: readonly ShapeFamilyTool[] = [
  "rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "line",
  "arrow",
];
const REMEMBERED_DRAW_TOOLS: readonly DrawFamilyTool[] = ["draw", "highlight"];

/**
 * Register Block and Port in tldraw's UI-tool registry (so `useTools()`
 * finds them with icons, labels and shortcuts — B and P go through tldraw's
 * own shortcut mechanism, never a bare document listener), and wrap every
 * family member so selecting it — from the menu, the family button, or its
 * key — remembers it as that family's last-used tool.
 */
export const playgroundUiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    // Stock draw is "d,b,x"; B belongs to Block now. P is unclaimed but
    // released anyway so a future stock change cannot silently collide.
    const next = releaseShortcut(releaseShortcut({ ...tools }, "b"), "p");

    for (const id of REMEMBERED_SHAPE_TOOLS) {
      const wrapped = wrapTool(next[id], () =>
        updateToolbarPreferences({ lastShapeTool: id }),
      );
      if (wrapped) next[id] = wrapped;
    }
    for (const id of REMEMBERED_DRAW_TOOLS) {
      const wrapped = wrapTool(next[id], () =>
        updateToolbarPreferences({ lastDrawTool: id }),
      );
      if (wrapped) next[id] = wrapped;
    }

    next[BBOX_BLOCK_TOOL_ID] = {
      id: BBOX_BLOCK_TOOL_ID,
      label: "Block",
      icon: <BlockToolIcon />,
      kbd: "b",
      onSelect() {
        updateToolbarPreferences({ lastBlackBoxTool: BBOX_BLOCK_TOOL_ID });
        editor.setCurrentTool(BBOX_BLOCK_TOOL_ID);
      },
    };
    next[BBOX_PORT_TOOL_ID] = {
      id: BBOX_PORT_TOOL_ID,
      label: "Port",
      icon: <PortToolIcon />,
      kbd: "p",
      onSelect() {
        updateToolbarPreferences({ lastBlackBoxTool: BBOX_PORT_TOOL_ID });
        editor.setCurrentTool(BBOX_PORT_TOOL_ID);
      },
    };

    return next;
  },
};
