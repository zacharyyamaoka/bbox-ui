// src/components/appMenu.ts — the burger's stock shape, as a pure builder.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `buildAppMenu` and `formatShortcut` THROW until lane `chrome-rename-burger`
// fills them in. The data below (`FILE_MENU_ROWS`, `APP_MENU_GROUP_IDS`) is
// the spec itself and is not the builder's to reorder. Acceptance:
// `appMenu.test.ts` (unit) and `src/stories/AppMenu.stories.tsx` — both
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
export function formatShortcut(chord: KeyChord, platform: ShortcutPlatform): string {
  void chord;
  void platform;
  throw new Error("formatShortcut: not implemented (lane chrome-rename-burger)");
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
export function buildAppMenu(input: AppMenuInput): MenuSpec {
  void input;
  throw new Error("buildAppMenu: not implemented (lane chrome-rename-burger)");
}

/** Re-exported so a host building rows for `edit`/`view`/… needs one import. */
export type { MenuAction, MenuGroupSpec, MenuSpec };
