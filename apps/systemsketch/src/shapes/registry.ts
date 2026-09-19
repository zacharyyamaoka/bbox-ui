// src/shapes/registry.ts — the ONE place the app learns what shapes exist.
//
// WHY a kit per kind instead of five hand-maintained lists (shapeUtils,
// bindingUtils, tools, dock rows, keyboard entries): the archive hand-edited
// six places to add one tool (`toolbarModel.ts`'s union + validation array, a
// `*_MENU_ITEMS` table, a `*FamilySlot` component, the toolbar JSX, a
// `select*FamilyTool` function and a preference-writing wrapper) — the same
// six-place cost `@trunk/components/toolDock`'s `FamilyDeclaration` was built
// to end. Here a kind ships ONE `index.ts` exporting ONE `ShapeKit`, this
// file flat-maps them, and `src/App.tsx` never learns a kind's name.
//
// WHY that matters for the lanes: L1 (code), L2 (port), L3 (wire), L5
// (region) each own exactly one directory under `src/shapes/`. None of them
// edits this file or `App.tsx`, so their write sets cannot collide.
import type { ComponentType } from "react";
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
  TLUiToolsContextType,
} from "tldraw";

import type { ToolItem } from "@trunk/components/toolDock";

import { blockKit } from "./block";
import { codeKit } from "./code";
import { portKit } from "./port";
import { regionKit } from "./region";
import { wireKit } from "./wire";

/** Everything one shape kind contributes to the running app. */
export interface ShapeKit {
  shapeUtils: readonly TLAnyShapeUtilConstructor[];
  bindingUtils: readonly TLAnyBindingUtilConstructor[];
  tools: readonly TLStateNodeConstructor[];
  /** Rows of the ONE system family, in display order
   *  (`@trunk/components/toolDock`'s `ToolItem`). */
  familyItems: readonly ToolItem[];
  /**
   * `TLUiOverrides.tools` entries for this kind's tools.
   *
   * WHY every kit must supply this even though `tools` already registers the
   * state machine (archive: src/bboxUi/adapter/bboxToolUi.tsx:15-25):
   * tldraw's `useTools()` only builds entries for its own fixed stock list,
   * so a tool passed through `<Tldraw tools={…}>` has a state machine and no
   * UI entry. A dock row whose id has no `tools[id]` entry is a SILENT
   * NO-OP — the row renders, the press does nothing — and the keyboard
   * shortcut (`kbd`) has nowhere to live at all.
   */
  toolUi(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType;
  /** Mount-time side effect, torn down by the returned stop function. L3's
   *  wire press-drag gesture is the one this exists for. */
  install?(editor: Editor): () => void;
  /** Rendered inside `components.InFrontOfTheCanvas` by src/chrome/overlay.tsx. */
  Overlay?: ComponentType;
}

/**
 * The canonical "contributes nothing" kit: the app runs, the vocabulary simply
 * has fewer members.
 *
 * The four placeholder kinds spell this literal out themselves rather than
 * importing it — see any of `./code`, `./port`, `./wire`, `./region` for why
 * (a value import back into this module is a runtime cycle). It lives here as
 * the documented shape, and for a real kit that wants to spread a base.
 */
export const EMPTY_KIT: ShapeKit = {
  shapeUtils: [],
  bindingUtils: [],
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
};

/** Display order of the system family's rows follows this order. */
export const KITS: readonly ShapeKit[] = [blockKit, codeKit, portKit, wireKit, regionKit];

export const SHAPE_UTILS: readonly TLAnyShapeUtilConstructor[] = KITS.flatMap((kit) => [...kit.shapeUtils]);
export const BINDING_UTILS: readonly TLAnyBindingUtilConstructor[] = KITS.flatMap((kit) => [...kit.bindingUtils]);
export const TOOLS: readonly TLStateNodeConstructor[] = KITS.flatMap((kit) => [...kit.tools]);

/** Every row of the ONE system-family slot (Zach, 2026-09-18: "lets just
 *  have the 1 icon"). There is no second family for bbox primitives — that
 *  split is exactly what this rebuild removes. */
export const SYSTEM_FAMILY_ITEMS: readonly ToolItem[] = KITS.flatMap((kit) => [...kit.familyItems]);

/** Folded left-to-right so a later kit can see (and, if it ever needs to,
 *  override) an earlier kit's entry — the same shape as tldraw's own
 *  `TLUiOverrides.tools`, which receives the accumulated map. */
export function withToolUi(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType {
  return KITS.reduce((acc, kit) => kit.toolUi(editor, acc), tools);
}
