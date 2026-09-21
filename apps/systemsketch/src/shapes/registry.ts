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

/**
 * Take `key` off `toolId`'s `kbd`, leaving that tool's other chords alone.
 *
 * WHY this exists at all — Zach, 2026-09-21: *"Yes, please unbind B from
 * pencil"*. tldraw ships the draw tool as `kbd: "d,b,x"`
 * (tldraw 5.3.2 `lib/ui/hooks/useTools.mjs:75`), and a kit that also wants
 * `b` does NOT displace it: `useKeyboardShortcuts` builds ONE registration
 * per tool and its `handleKeyDown` `break`s out of the inner *parsed-chord*
 * loop only, so it keeps walking the registry and fires EVERY match. Two
 * tools holding `b` therefore both run, stock-first — the pencil arms, then
 * the Block arms over it, and what Zach sees is the pencil flashing before
 * the tool he asked for.
 *
 * WHY a released key rather than a re-ordered override: there is no order to
 * win. The dispatcher has no "first match wins" and no `stopPropagation` to
 * reach for, so the only way one key means one tool is for exactly one entry
 * to claim it. Taking the letter off the loser is that.
 *
 * It also fixes the SHOWN shortcut for free: tldraw's own keyboard-shortcuts
 * dialog and its toolbar tooltips read this same `kbd`, so the pencil stops
 * advertising a key it no longer has.
 */
export function releaseShortcut(
  tools: TLUiToolsContextType,
  toolId: string,
  key: string,
): TLUiToolsContextType {
  const tool = tools[toolId];
  if (!tool?.kbd) return tools;
  // tldraw's own chord separator, and its own whitespace tolerance
  // (`getKeys` strips spaces before splitting on ",").
  const kept = tool.kbd
    .split(",")
    .map((chord) => chord.trim())
    .filter((chord) => chord.length > 0 && chord.toLowerCase() !== key.toLowerCase());
  if (kept.length === tool.kbd.split(",").filter((chord) => chord.trim().length > 0).length) return tools;
  // An empty `kbd` is how tldraw spells "this tool has no shortcut":
  // `useKeyboardShortcuts` skips a falsy `kbd`, and `parseKbd` returns [] for
  // one, so either way nothing is registered.
  return { ...tools, [toolId]: { ...tool, kbd: kept.join(",") } };
}
