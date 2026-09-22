// src/editor/appMenu.ts — the burger's stock shape, as a pure builder.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `buildAppMenu` and `formatShortcut` THROW until lane `chrome-rename-burger`
// fills them in. The data below (`FILE_MENU_ROWS`, `APP_MENU_GROUP_IDS`) is
// the spec itself and is not the builder's to reorder. Acceptance:
// `appMenu.test.ts` (unit) and `src/editor/AppMenu.stories.tsx` — both
// off-limits to the builder.
//
// WHY a builder in the trunk and not a list in apps/systemsketch: Zach,
// 2026-09-19 — "all of the feedback regarding the chrome should be made in
// bbox-ui editor-components, not in system sketch, system sketch should just
// be kinda like importing these stock menus and doing a light bit of
// configuration". The ORDER and GROUPING of the burger is chrome; which rows
// a host can honour (its callbacks) is configuration. A host that passes
// `file.new` gets the "New  Ctrl + N" row in the old app's slot; a host that
// does not gets no row — never a disabled row for a feature that does not
// exist (the ask doc's dispatcher reading).
//
// WHY `ChromeBar.menu` stays menu-as-data (`MenuSpec`) rather than this file
// returning JSX: chromeBar.tsx already renders a `MenuSpec` recursively, and
// that data shape is the one place the menu kit allows menu-as-data (its
// `ChromeBarProps.menu` WHY). This file only decides WHAT the spec says.
import { createElement } from "react";
import { Settings as SettingsIcon } from "lucide-react";

import type { MenuAction, MenuGroupSpec, MenuSpec } from "./chromeBar";

/** Which modifier spelling a shortcut renders in. `"other"` = Linux/Windows. */
export type ShortcutPlatform = "mac" | "other";

/**
 * One key chord in tldraw's own `kbd` token spelling, lower-case, `+`-joined:
 * `"mod+shift+n"`, `"ctrl+z"`, `"cmd+="`, `"f2"`, `"shift+1"`.
 * `mod` is ⌘ on mac and Ctrl elsewhere; `cmd`/`ctrl` are taken literally
 * (tldraw's action table lists `"cmd+z,ctrl+z"` — a host splits on `,` and
 * passes the one chord that matches its platform).
 */
export type KeyChord = string;

/**
 * A chord as the menu's shortcut column prints it.
 *
 * `"other"` joins tokens with `" + "` exactly as the old app's burger did
 * (screenshot `Pasted image 20260919135314.png`: "Ctrl + ⇧ + N"):
 *   mod|ctrl → "Ctrl", shift → "⇧", alt|option → "Alt", cmd → "Ctrl",
 *   a single letter → upper-case, `f1`…`f12` → "F1"…"F12" (ONE token — the
 *   old app's "F + 2" was tldraw splitting `f2`, a bug not to port),
 *   `del`/`delete`/`backspace`/`⌫` → "Del", anything else verbatim.
 * `"mac"` uses Apple's glyph order ⌃⌥⇧⌘ then the key, no separator:
 *   `"mod+shift+n"` → "⇧⌘N", `"f2"` → "F2", `"alt+mod+g"` → "⌥⌘G".
 */
// WHY one token table feeds both platforms rather than two independent
// switch statements: "other" prints every token (modifier or key) through
// this same map/verbatim rule, in chord order — the mac branch reuses it
// ONLY for the trailing key, because mac's modifiers get reordered into
// Apple's fixed ⌃⌥⇧⌘ glyph sequence regardless of how the chord spelled
// them (`formatShortcut`'s own doc comment). One table keeps "f2 → F2, not
// the old app's F + 2" true in both places instead of drifting.
const MODIFIER_LABELS: Record<string, string> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  cmd: "Ctrl",
  shift: "⇧",
  alt: "Alt",
  option: "Alt",
};

const DELETE_KEYS = new Set(["del", "delete", "backspace", "⌫"]);

function formatToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower in MODIFIER_LABELS) return MODIFIER_LABELS[lower];
  if (DELETE_KEYS.has(lower)) return "Del";
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase();
  if (/^[a-z]$/.test(lower)) return lower.toUpperCase();
  return token;
}

type MacModifier = "ctrl" | "alt" | "shift" | "mod";

const MAC_MODIFIER_SYMBOLS: Record<MacModifier, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  mod: "⌘",
};

// Apple's own fixed order, independent of how the chord spelled its
// modifiers ("alt+mod+g" and "mod+alt+g" print identically on mac).
const MAC_ORDER: readonly MacModifier[] = ["ctrl", "alt", "shift", "mod"];

function macModifier(token: string): MacModifier | null {
  switch (token.toLowerCase()) {
    case "ctrl":
      return "ctrl";
    case "alt":
    case "option":
      return "alt";
    case "shift":
      return "shift";
    case "mod":
    case "cmd":
      return "mod";
    default:
      return null;
  }
}

export function formatShortcut(chord: KeyChord, platform: ShortcutPlatform): string {
  const tokens = chord.split("+");
  if (platform === "other") {
    return tokens.map(formatToken).join(" + ");
  }
  const present = new Set(tokens.map(macModifier).filter((m): m is MacModifier => m !== null));
  const key = tokens.find((token) => macModifier(token) === null) ?? "";
  const symbols = MAC_ORDER.filter((modifier) => present.has(modifier)).map((modifier) => MAC_MODIFIER_SYMBOLS[modifier]);
  return [...symbols, formatToken(key)].join("");
}

/** The File submenu's row ids, in the order the old app showed them. */
export type FileCommandId =
  | "new"
  | "new-window"
  | "open"
  | "open-recent"
  | "save"
  | "save-as"
  | "export-copy"
  | "rename"
  | "copy-path"
  | "reveal"
  | "trash";

export interface FileRowSpec {
  id: FileCommandId;
  label: string;
  /** Printed through `formatShortcut`; absent → no shortcut column. */
  chord?: KeyChord;
  /** Rows sharing a `group` sit between the same two separators. */
  group: 0 | 1 | 2;
  destructive?: boolean;
}

/**
 * The old app's File submenu, verbatim order and labels.
 *
 * Source, read on disk: `/home/bam/systemsketch/src/workspace/
 * LocalWorkspace.tsx:1535-1590` (`SystemSketchFileMenu`), and Zach's
 * screenshot `Pasted image 20260919135314.png`. Zach: "Important is the file
 * tab at the start with then new, new window, open, open recent, etc I use
 * those a lot.." — so this list is muscle memory, and a builder never
 * reorders it.
 *
 * `export-copy` is the donor's "Export to tldraw…". Kept in the spec for
 * fidelity; SystemSketch-new passes no callback for it (its file IS a
 * `.tldr`), so the row is absent there.
 */
export const FILE_MENU_ROWS: readonly FileRowSpec[] = Object.freeze([
  { id: "new", label: "New", chord: "mod+n", group: 0 },
  { id: "new-window", label: "New window", chord: "mod+shift+n", group: 0 },
  { id: "open", label: "Open…", chord: "mod+o", group: 0 },
  { id: "open-recent", label: "Open recent", group: 0 },
  { id: "save", label: "Save", chord: "mod+s", group: 1 },
  { id: "save-as", label: "Save As…", chord: "mod+shift+s", group: 1 },
  { id: "export-copy", label: "Export to tldraw…", group: 1 },
  { id: "rename", label: "Rename", chord: "f2", group: 1 },
  { id: "copy-path", label: "Copy Absolute Path", group: 2 },
  { id: "reveal", label: "Show in Files", group: 2 },
  { id: "trash", label: "Move to Trash…", group: 2, destructive: true },
] satisfies FileRowSpec[]);

/** The copy on the single disabled row an empty Open recent submenu shows. */
export const NO_RECENT_FILES_LABEL = "No recent files";

export interface RecentEntry {
  /** Absolute path — becomes the row's `title` (hover shows it whole). */
  path: string;
  /** What the row reads, e.g. the file name without its suffix. */
  title: string;
}

/**
 * What the host can do, one optional callback per File row. A row exists iff
 * its callback does (`openRecent` → the Open recent submenu). `disabled`
 * greys a row that exists but cannot run right now (Copy Absolute Path on a
 * board that was never saved) — that is state, not a missing feature.
 */
export interface FileMenuCallbacks {
  newDocument?(): void;
  newWindow?(): void;
  open?(): void;
  openRecent?: { entries: readonly RecentEntry[]; onOpen(path: string): void };
  save?(): void;
  saveAs?(): void;
  exportCopy?(): void;
  rename?(): void;
  copyPath?(): void;
  reveal?(): void;
  trash?(): void;
  disabled?: Partial<Record<FileCommandId, boolean>>;
}

/**
 * The top-level group ids, in order. The separators between them are the
 * old app's (screenshot 135314) and Figma's (135146): File | Settings |
 * Edit View Export | Preferences Keyboard shortcuts | host extras.
 */
export const APP_MENU_GROUP_IDS = Object.freeze({
  file: "file",
  settings: "settings",
  stock: "stock",
  preferences: "preferences",
} as const);

/** Submenu / row ids a test (or a host) can find without matching copy. */
export const APP_MENU_ITEM_IDS = Object.freeze({
  file: "file",
  openRecent: "open-recent",
  settings: "settings",
  edit: "edit",
  view: "view",
  export: "export",
  preferences: "preferences",
  keyboardShortcuts: "keyboard-shortcuts",
} as const);

export interface AppMenuInput {
  /** The burger's accessible name / tooltip ("SystemSketch"). */
  label: string;
  platform: ShortcutPlatform;
  file: FileMenuCallbacks;
  /** Present → a "Settings" row (gear icon) in its own group after File. */
  onSettings?(): void;
  /** Host-built rows for the stock submenus, grouped (a group boundary is a
   *  separator). Absent or all-empty → that submenu is omitted. */
  edit?: readonly MenuGroupSpec[];
  view?: readonly MenuGroupSpec[];
  export?: readonly MenuGroupSpec[];
  preferences?: readonly MenuGroupSpec[];
  /** Present → a "Keyboard shortcuts" row after Preferences. */
  onKeyboardShortcuts?(): void;
  /** Host groups appended last, verbatim (e.g. "Switch to old SystemSketch"). */
  extra?: readonly MenuGroupSpec[];
}

/**
 * The whole burger as one `MenuSpec`.
 *
 * Output contract (what `appMenu.test.ts` pins):
 *   - `id` "app", `label` = `input.label`.
 *   - groups, in order, each omitted when it would be empty (so no stray
 *     separator ever renders):
 *       1. `file`        — ONE item: the `File` submenu (id `file`). Inside
 *                          it, `FILE_MENU_ROWS` filtered to the rows whose
 *                          callback exists, split into up to three groups by
 *                          `group` (empty ones dropped). Row `id` = the
 *                          `FileCommandId`; `shortcut` = `formatShortcut(
 *                          chord, platform)`; `destructive` carried; no icons
 *                          (the old app's File rows had none).
 *                          `open-recent` is a nested submenu (id
 *                          `open-recent`): one row per entry (id
 *                          `recent:<path>`, label `title`, `title` = path),
 *                          or, with no entries, one disabled row reading
 *                          `NO_RECENT_FILES_LABEL`.
 *       2. `settings`    — the Settings row (id `settings`, gear icon).
 *       3. `stock`       — Edit ▸, View ▸, Export ▸ submenus (ids `edit`,
 *                          `view`, `export`), each the host's groups verbatim.
 *       4. `preferences` — Preferences ▸ (id `preferences`) then the
 *                          Keyboard shortcuts row (id `keyboard-shortcuts`).
 *       5. …`extra`      — verbatim, in order.
 *   - Pure: no DOM, no storage, and the same input builds a deep-equal spec.
 */
const FILE_CALLBACK_KEYS: Record<Exclude<FileCommandId, "open-recent">, keyof FileMenuCallbacks> = {
  new: "newDocument",
  "new-window": "newWindow",
  open: "open",
  save: "save",
  "save-as": "saveAs",
  "export-copy": "exportCopy",
  rename: "rename",
  "copy-path": "copyPath",
  reveal: "reveal",
  trash: "trash",
};

// WHY a cache instead of a plain `() => onOpen(entry.path)` closure below:
// `buildAppMenu` is documented pure — "the same input builds a deep-equal
// spec" (`appMenu.test.ts`'s own purity case) — and a freshly allocated
// closure is a fresh object identity every call, so two builds of the same
// input would otherwise disagree on nothing a human can see (`toEqual`'s
// "no visual difference" verdict on two structurally-identical functions).
// Keying on the entry AND its host callback (both stable across builds of
// the same input) returns the SAME row-runner every time either is unchanged.
const openRecentRunCache = new WeakMap<RecentEntry, WeakMap<(path: string) => void, () => void>>();

function runForRecentEntry(entry: RecentEntry, onOpen: (path: string) => void): () => void {
  let byCallback = openRecentRunCache.get(entry);
  if (!byCallback) {
    byCallback = new WeakMap();
    openRecentRunCache.set(entry, byCallback);
  }
  let run = byCallback.get(onOpen);
  if (!run) {
    run = () => onOpen(entry.path);
    byCallback.set(onOpen, run);
  }
  return run;
}

const NO_RECENT_FILES_ROW: MenuAction = Object.freeze({
  id: "no-recent-files",
  label: NO_RECENT_FILES_LABEL,
  disabled: true,
  run: () => {},
});

function buildOpenRecentSubmenu(openRecent: NonNullable<FileMenuCallbacks["openRecent"]>): MenuSpec {
  const items: MenuAction[] =
    openRecent.entries.length > 0
      ? openRecent.entries.map((entry) => ({
          id: `recent:${entry.path}`,
          label: entry.title,
          title: entry.path,
          run: runForRecentEntry(entry, openRecent.onOpen),
        }))
      : [NO_RECENT_FILES_ROW];
  return { id: "open-recent", label: "Open recent", groups: [{ id: "open-recent-items", items }] };
}

/** Builds the top-level `file` group — one item, the File submenu — or
 *  `null` when the host honours none of `FILE_MENU_ROWS` (no stray
 *  submenu-with-nothing-in-it, same "omitted when empty" rule as every
 *  other top group). */
function buildFileGroup(file: FileMenuCallbacks, platform: ShortcutPlatform): MenuGroupSpec | null {
  const byGroup = new Map<FileRowSpec["group"], (MenuAction | { submenu: MenuSpec })[]>();
  for (const row of FILE_MENU_ROWS) {
    let entry: MenuAction | { submenu: MenuSpec } | null = null;
    if (row.id === "open-recent") {
      if (file.openRecent) entry = { submenu: buildOpenRecentSubmenu(file.openRecent) };
    } else {
      const callback = file[FILE_CALLBACK_KEYS[row.id]] as (() => void) | undefined;
      if (callback) {
        entry = {
          id: row.id,
          label: row.label,
          shortcut: row.chord ? formatShortcut(row.chord, platform) : undefined,
          disabled: file.disabled?.[row.id],
          destructive: row.destructive,
          run: callback,
        };
      }
    }
    if (!entry) continue;
    const list = byGroup.get(row.group) ?? [];
    list.push(entry);
    byGroup.set(row.group, list);
  }
  const groups: MenuGroupSpec[] = ([0, 1, 2] as const)
    .filter((group) => (byGroup.get(group)?.length ?? 0) > 0)
    .map((group) => ({ id: `file-group-${group}`, items: byGroup.get(group)! }));
  if (groups.length === 0) return null;
  return {
    id: APP_MENU_GROUP_IDS.file,
    items: [{ submenu: { id: APP_MENU_ITEM_IDS.file, label: "File", groups } }],
  };
}

function hasRows(groups: readonly MenuGroupSpec[] | undefined): groups is readonly MenuGroupSpec[] {
  return !!groups && groups.some((group) => group.items.length > 0);
}

/** A stock submenu (Edit/View/Export/Preferences) — the host's own groups
 *  passed through verbatim (`docs/CHROME-FILES-SETTINGS-PLAN.md` §3: this
 *  builder decides the SHAPE, never the host's content) — or omitted when
 *  the host gave it nothing to show. */
function buildStockSubmenu(id: string, label: string, groups: readonly MenuGroupSpec[] | undefined): { submenu: MenuSpec } | null {
  if (!hasRows(groups)) return null;
  return { submenu: { id, label, groups } };
}

function buildSettingsGroup(onSettings: (() => void) | undefined): MenuGroupSpec | null {
  if (!onSettings) return null;
  return {
    id: APP_MENU_GROUP_IDS.settings,
    items: [
      {
        id: APP_MENU_ITEM_IDS.settings,
        label: "Settings",
        icon: createElement(SettingsIcon, { "aria-hidden": true }),
        run: onSettings,
      },
    ],
  };
}

function buildStockGroup(input: AppMenuInput): MenuGroupSpec | null {
  const items = [
    buildStockSubmenu(APP_MENU_ITEM_IDS.edit, "Edit", input.edit),
    buildStockSubmenu(APP_MENU_ITEM_IDS.view, "View", input.view),
    buildStockSubmenu(APP_MENU_ITEM_IDS.export, "Export", input.export),
  ].filter((item): item is { submenu: MenuSpec } => item !== null);
  if (items.length === 0) return null;
  return { id: APP_MENU_GROUP_IDS.stock, items };
}

function buildPreferencesGroup(input: AppMenuInput): MenuGroupSpec | null {
  const items: (MenuAction | { submenu: MenuSpec })[] = [];
  const preferences = buildStockSubmenu(APP_MENU_ITEM_IDS.preferences, "Preferences", input.preferences);
  if (preferences) items.push(preferences);
  if (input.onKeyboardShortcuts) {
    items.push({ id: APP_MENU_ITEM_IDS.keyboardShortcuts, label: "Keyboard shortcuts", run: input.onKeyboardShortcuts });
  }
  if (items.length === 0) return null;
  return { id: APP_MENU_GROUP_IDS.preferences, items };
}

export function buildAppMenu(input: AppMenuInput): MenuSpec {
  const groups: MenuGroupSpec[] = [];
  const fileGroup = buildFileGroup(input.file, input.platform);
  if (fileGroup) groups.push(fileGroup);
  const settingsGroup = buildSettingsGroup(input.onSettings);
  if (settingsGroup) groups.push(settingsGroup);
  const stockGroup = buildStockGroup(input);
  if (stockGroup) groups.push(stockGroup);
  const preferencesGroup = buildPreferencesGroup(input);
  if (preferencesGroup) groups.push(preferencesGroup);
  if (input.extra) groups.push(...input.extra);
  return { id: "app", label: input.label, groups };
}

/** Re-exported so a host building rows for `edit`/`view`/… needs one import. */
export type { MenuAction, MenuGroupSpec, MenuSpec };
