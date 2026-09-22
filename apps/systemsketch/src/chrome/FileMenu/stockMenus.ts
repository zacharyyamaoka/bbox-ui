// src/chrome/FileMenu/stockMenus.ts — Edit ▸, View ▸, Export ▸ and Preferences ▸,
// built from tldraw's OWN action table.
//
// This file is configuration, not chrome: it decides WHICH of tldraw's actions
// appear and in which group, and hands the rows to `@trunk/components/appMenu`
// as data. How a row, a separator or a checkbox row LOOKS is the trunk's
// (`chromeBar.tsx`'s `BurgerMenuEntry`). Zach, 2026-09-19: "system sketch
// should just be kinda like importing these stock menus and doing a light bit
// of configuration."
//
// WHY every row runs `action.onSelect(...)` and nothing else: there is exactly
// one undo, one zoom-to-100 and one snap-mode preference in this app, and it
// is the engine's. A second implementation beside it would be a second thing
// to keep in step with Ctrl+Z, with the context menu, and with the keyboard
// shortcuts dialog the last row of the burger opens — three surfaces that
// would then be able to disagree about what "Undo" means. The plan's stock
// table says this in one line: "unchanged (stock seam): useActions,
// useCanUndo, useCanRedo, useTranslation, useDialogs, useToasts".
import { useMemo } from "react";
import { unwrapLabel, useActions, useEditor, useTranslation, useValue, type TLUiActionItem } from "tldraw";

import { formatShortcut, type MenuAction, type MenuGroupSpec, type ShortcutPlatform } from "@trunk/editor/appMenu";

/**
 * Which modifier spelling this machine's menus print.
 *
 * WHY `userAgent` and not the `platform` property the donor would have used:
 * `navigator.platform` is deprecated and already frozen to a lie in some
 * builds. This is a DISPLAY choice only — every row runs tldraw's action
 * either way, and tldraw binds both chords regardless — so guessing wrong
 * costs a wrong glyph in a menu, never a broken command.
 */
export function shortcutPlatform(userAgent: string = navigator.userAgent): ShortcutPlatform {
  return /mac(intosh| os)/i.test(userAgent) ? "mac" : "other";
}

/**
 * tldraw lists every chord an action answers to in ONE comma-separated
 * string, mac first: `"cmd+z,ctrl+z"`, `"cmd+=,ctrl+=,="`, `"shift+0"`.
 * `formatShortcut` prints ONE chord, so the host picks the chord that matches
 * its platform — which is precisely what `appMenu.ts`'s `KeyChord` doc says a
 * host must do ("a host splits on `,` and passes the one chord that matches
 * its platform").
 *
 * Falls back to the FIRST chord when no platform-specific one exists, so
 * `"shift+0"` still prints "⇧ + 0" rather than nothing.
 */
export function chordForPlatform(kbd: string | undefined, platform: ShortcutPlatform): string | undefined {
  if (!kbd) return undefined;
  const chords = kbd
    .split(",")
    .map((chord) => chord.trim())
    .filter((chord) => chord.length > 0);
  if (chords.length === 0) return undefined;
  const token = platform === "mac" ? "cmd" : "ctrl";
  const match = chords.find((chord) => chord.split("+").some((part) => part.toLowerCase() === token));
  return match ?? chords[0];
}

/** One tldraw action as a burger row, or `null` when this build of tldraw
 *  does not ship it — a row for an action that does not exist is a row that
 *  does nothing.
 *
 * WHY every action that HAS a chord gets its column, with no id-keyed
 * exception list: until 2026-09-19 this function suppressed the column for
 * `delete`, because `src/testing/menus.ts`'s `rowsOf` recovered a row's label
 * by subtracting the shortcut's text from the row's, so "Delete" + "Del" read
 * back as "eteDel" and the acceptance went red. Deleting a shortcut Zach uses
 * — from the one row in Edit ▸ whose keystroke is the least guessable of the
 * six — to make a broken reader happy is the product serving the test. The
 * reader now reads the shortcut NODE (`labelOf`), and this file is back to
 * configuration: WHICH tldraw actions appear and in which group, never how
 * much of one is allowed to show. If a future row's shortcut looks wrong in
 * the menu, the fix is in the trunk's `formatShortcut` or in the reader —
 * never a row quietly losing part of itself here. */
function actionRow(
  action: TLUiActionItem | undefined,
  msg: (id?: string) => string,
  platform: ShortcutPlatform,
  options: { checked?: boolean } = {},
): MenuAction | null {
  if (!action) return null;
  const chord = chordForPlatform(action.kbd, platform);
  // `"menu"` is the variant tldraw's own menus ask for: `toggle-snap-mode`
  // reads "Always snap" there rather than "Toggle always snap", and
  // `export-as-svg` reads "SVG" rather than "Export as SVG" — the wording
  // Zach already has in the old app's Export ▸ submenu.
  const label = unwrapLabel(action.label, "menu");
  return {
    id: action.id,
    label: label ? msg(label) : action.id,
    shortcut: chord ? formatShortcut(chord, platform) : undefined,
    checked: options.checked,
    run: () => {
      void action.onSelect("menu");
    },
  };
}

function group(id: string, items: (MenuAction | null)[]): MenuGroupSpec | null {
  const kept = items.filter((item): item is MenuAction => item !== null);
  return kept.length > 0 ? { id, items: kept } : null;
}

function groups(...candidates: (MenuGroupSpec | null)[]): MenuGroupSpec[] {
  return candidates.filter((candidate): candidate is MenuGroupSpec => candidate !== null);
}

export interface StockMenus {
  edit: MenuGroupSpec[];
  view: MenuGroupSpec[];
  export: MenuGroupSpec[];
  preferences: MenuGroupSpec[];
  /** Opens tldraw's own keyboard-shortcuts dialog (`open-kbd-shortcuts`). */
  openKeyboardShortcuts: (() => void) | undefined;
}

/**
 * The four stock submenus for the burger.
 *
 * Group boundaries are separators, and they are the old app's: Edit ▸ splits
 * history | clipboard | shapes, View ▸ is one zoom group, Preferences ▸ is one
 * canvas group. Order inside each group is tldraw's own (the order its
 * keyboard-shortcuts dialog lists them in), so the burger and that dialog
 * cannot disagree.
 */
export function useStockMenus(): StockMenus {
  const editor = useEditor();
  const actions = useActions();
  const msg = useTranslation();
  const platform = useMemo(() => shortcutPlatform(), []);

  // The three toggles below are CHECKBOX rows: `MenuAction.checked` present
  // (even as `false`) is what makes the trunk render a real
  // `menuitemcheckbox` with `aria-checked` instead of a plain row
  // (chromeBar.tsx's `BurgerMenuEntry`). Read reactively so the tick follows
  // a change made from tldraw's own context menu or its keyboard shortcut.
  const snap = useValue("ss snap mode", () => editor.user.getIsSnapMode(), [editor]);
  const grid = useValue("ss grid mode", () => editor.getInstanceState().isGridMode, [editor]);
  const dark = useValue("ss dark mode", () => editor.user.getIsDarkMode(), [editor]);

  return useMemo(() => {
    const row = (id: string, options?: { checked?: boolean }) => actionRow(actions[id], msg, platform, options);
    return {
      edit: groups(
        group("edit-history", [row("undo"), row("redo")]),
        group("edit-clipboard", [row("cut"), row("copy"), row("paste")]),
        group("edit-shapes", [row("duplicate"), row("delete"), row("select-all")]),
      ),
      view: groups(
        group("view-zoom", [
          row("zoom-in"),
          row("zoom-out"),
          row("zoom-to-100"),
          row("zoom-to-fit"),
          row("zoom-to-selection"),
        ]),
      ),
      export: groups(group("export-current", [row("export-as-svg"), row("export-as-png")])),
      preferences: groups(
        group("preferences-canvas", [
          row("toggle-snap-mode", { checked: snap }),
          row("toggle-grid", { checked: grid }),
          row("toggle-dark-mode", { checked: dark }),
        ]),
      ),
      openKeyboardShortcuts: actions["open-kbd-shortcuts"]
        ? () => {
            void actions["open-kbd-shortcuts"].onSelect("menu");
          }
        : undefined,
    };
  }, [actions, msg, platform, snap, grid, dark]);
}
