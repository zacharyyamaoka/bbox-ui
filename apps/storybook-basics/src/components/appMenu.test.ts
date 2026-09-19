// src/components/appMenu.test.ts — the burger's stock shape. ACCEPTANCE
// committed by the planning lane of docs/CHROME-FILES-SETTINGS-PLAN.md before
// any builder; off-limits to lane `chrome-rename-burger`.
//
// The File order and shortcut spellings are Zach's muscle memory (the old
// app's burger, screenshot `Pasted image 20260919135314.png`) — these cases
// pin them exactly so a well-meaning "tidy" cannot reorder them.
import { describe, expect, it, vi } from "vitest";

import {
  APP_MENU_GROUP_IDS,
  FILE_MENU_ROWS,
  NO_RECENT_FILES_LABEL,
  buildAppMenu,
  formatShortcut,
  type AppMenuInput,
  type FileMenuCallbacks,
} from "./appMenu";
import type { MenuAction, MenuGroupSpec, MenuSpec } from "./chromeBar";

type Entry = MenuAction | { submenu: MenuSpec };
const isSubmenu = (entry: Entry): entry is { submenu: MenuSpec } => "submenu" in entry;

function everyFileCallback(): Required<Omit<FileMenuCallbacks, "disabled" | "openRecent">> & Pick<FileMenuCallbacks, "openRecent"> {
  return {
    newDocument: vi.fn(),
    newWindow: vi.fn(),
    open: vi.fn(),
    openRecent: {
      entries: [
        { path: "/home/bam/SystemSketch/CAD Exporter.tldr", title: "CAD Exporter" },
        { path: "/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr", title: "series_a_pose_pipeline_v7" },
      ],
      onOpen: vi.fn(),
    },
    save: vi.fn(),
    saveAs: vi.fn(),
    exportCopy: vi.fn(),
    rename: vi.fn(),
    copyPath: vi.fn(),
    reveal: vi.fn(),
    trash: vi.fn(),
  };
}

const stockGroup = (id: string, labels: string[]): MenuGroupSpec => ({
  id,
  items: labels.map((label) => ({ id: label.toLowerCase().replace(/\W+/g, "-"), label, run: vi.fn() })),
});

function fullInput(overrides: Partial<AppMenuInput> = {}): AppMenuInput {
  return {
    label: "SystemSketch",
    platform: "other",
    file: everyFileCallback(),
    onSettings: vi.fn(),
    edit: [stockGroup("undo", ["Undo", "Redo"]), stockGroup("clipboard", ["Cut", "Copy", "Paste"])],
    view: [stockGroup("zoom", ["Zoom in", "Zoom out"])],
    export: [stockGroup("formats", ["Export as SVG", "Export as PNG"])],
    preferences: [{ id: "toggles", items: [{ id: "snap", label: "Always snap", checked: true, run: vi.fn() }] }],
    onKeyboardShortcuts: vi.fn(),
    extra: [{ id: "legacy", items: [{ id: "switch-to-old-systemsketch", label: "Switch to old SystemSketch", run: vi.fn() }] }],
    ...overrides,
  };
}

const labelsOf = (group: MenuGroupSpec) => group.items.map((entry) => (isSubmenu(entry as Entry) ? (entry as { submenu: MenuSpec }).submenu.label : (entry as MenuAction).label));
const fileSubmenu = (menu: MenuSpec) => (menu.groups[0].items[0] as { submenu: MenuSpec }).submenu;
const flatRows = (spec: MenuSpec) => spec.groups.flatMap((group) => group.items as Entry[]);

describe("formatShortcut", () => {
  it("prints Linux/Windows chords the way the old app's burger did", () => {
    expect(formatShortcut("mod+n", "other")).toBe("Ctrl + N");
    expect(formatShortcut("mod+shift+n", "other")).toBe("Ctrl + ⇧ + N");
    expect(formatShortcut("mod+shift+s", "other")).toBe("Ctrl + ⇧ + S");
    expect(formatShortcut("ctrl+z", "other")).toBe("Ctrl + Z");
    expect(formatShortcut("ctrl+shift+z", "other")).toBe("Ctrl + ⇧ + Z");
    expect(formatShortcut("cmd+=", "other")).toBe("Ctrl + =");
    expect(formatShortcut("ctrl+-", "other")).toBe("Ctrl + -");
    expect(formatShortcut("shift+0", "other")).toBe("⇧ + 0");
    expect(formatShortcut("alt+shift+f", "other")).toBe("Alt + ⇧ + F");
  });

  it("keeps a function key ONE token — F2, never the old app's 'F + 2'", () => {
    expect(formatShortcut("f2", "other")).toBe("F2");
    expect(formatShortcut("f12", "mac")).toBe("F12");
  });

  it("maps delete keys to Del", () => {
    expect(formatShortcut("del", "other")).toBe("Del");
    expect(formatShortcut("delete", "other")).toBe("Del");
    expect(formatShortcut("backspace", "other")).toBe("Del");
  });

  it("prints mac chords in Apple's modifier order with no separators", () => {
    expect(formatShortcut("mod+n", "mac")).toBe("⌘N");
    expect(formatShortcut("mod+shift+n", "mac")).toBe("⇧⌘N");
    expect(formatShortcut("alt+mod+g", "mac")).toBe("⌥⌘G");
    expect(formatShortcut("ctrl+alt+shift+mod+k", "mac")).toBe("⌃⌥⇧⌘K");
  });
});

describe("FILE_MENU_ROWS", () => {
  it("is the old app's File submenu, in its order", () => {
    expect(FILE_MENU_ROWS.map((row) => row.label)).toEqual([
      "New",
      "New window",
      "Open…",
      "Open recent",
      "Save",
      "Save As…",
      "Export to tldraw…",
      "Rename",
      "Copy Absolute Path",
      "Show in Files",
      "Move to Trash…",
    ]);
  });
});

describe("buildAppMenu", () => {
  it("builds File | Settings | Edit View Export | Preferences Keyboard shortcuts | extras, in that order", () => {
    const menu = buildAppMenu(fullInput());
    expect(menu.id).toBe("app");
    expect(menu.label).toBe("SystemSketch");
    expect(menu.groups.map((group) => group.id)).toEqual([
      APP_MENU_GROUP_IDS.file,
      APP_MENU_GROUP_IDS.settings,
      APP_MENU_GROUP_IDS.stock,
      APP_MENU_GROUP_IDS.preferences,
      "legacy",
    ]);
    expect(menu.groups.map(labelsOf)).toEqual([
      ["File"],
      ["Settings"],
      ["Edit", "View", "Export"],
      ["Preferences", "Keyboard shortcuts"],
      ["Switch to old SystemSketch"],
    ]);
  });

  it("gives File the old rows, grouped by the old separators, with shortcuts and no icons", () => {
    const file = fileSubmenu(buildAppMenu(fullInput()));
    expect(file.id).toBe("file");
    expect(file.groups.map((group) => labelsOf(group))).toEqual([
      ["New", "New window", "Open…", "Open recent"],
      ["Save", "Save As…", "Export to tldraw…", "Rename"],
      ["Copy Absolute Path", "Show in Files", "Move to Trash…"],
    ]);
    const rows = flatRows(file).filter((entry): entry is MenuAction => !isSubmenu(entry));
    expect(rows.map((row) => [row.id, row.shortcut ?? ""])).toEqual([
      ["new", "Ctrl + N"],
      ["new-window", "Ctrl + ⇧ + N"],
      ["open", "Ctrl + O"],
      ["save", "Ctrl + S"],
      ["save-as", "Ctrl + ⇧ + S"],
      ["export-copy", ""],
      ["rename", "F2"],
      ["copy-path", ""],
      ["reveal", ""],
      ["trash", ""],
    ]);
    expect(rows.every((row) => row.icon === undefined)).toBe(true);
    expect(rows.find((row) => row.id === "trash")?.destructive).toBe(true);
  });

  it("omits a row whose callback is absent — never a disabled stand-in — and drops a group left empty", () => {
    const file = fileSubmenu(
      buildAppMenu(fullInput({ file: { newDocument: vi.fn(), newWindow: vi.fn(), open: vi.fn(), save: vi.fn(), saveAs: vi.fn() } })),
    );
    expect(file.groups.map((group) => labelsOf(group))).toEqual([
      ["New", "New window", "Open…"],
      ["Save", "Save As…"],
    ]);
    const bare = buildAppMenu({ label: "Bare", platform: "other", file: { open: vi.fn() } });
    expect(bare.groups.map((group) => group.id)).toEqual([APP_MENU_GROUP_IDS.file]);
    const onlyView = buildAppMenu({ label: "V", platform: "other", file: {}, view: [stockGroup("zoom", ["Zoom in"])], edit: [], export: [{ id: "empty", items: [] }] });
    expect(onlyView.groups.map(labelsOf)).toEqual([["View"]]);
  });

  it("greys rows the host marks disabled without removing them", () => {
    const file = fileSubmenu(buildAppMenu(fullInput({ file: { ...everyFileCallback(), disabled: { "copy-path": true, trash: true } } })));
    const rows = flatRows(file).filter((entry): entry is MenuAction => !isSubmenu(entry));
    expect(rows.filter((row) => row.disabled).map((row) => row.id)).toEqual(["copy-path", "trash"]);
  });

  it("wires every row to its own callback", () => {
    const input = fullInput();
    const file = fileSubmenu(buildAppMenu(input));
    const rows = flatRows(file).filter((entry): entry is MenuAction => !isSubmenu(entry));
    for (const row of rows) row.run();
    const callbacks = input.file as ReturnType<typeof everyFileCallback>;
    for (const name of ["newDocument", "newWindow", "open", "save", "saveAs", "exportCopy", "rename", "copyPath", "reveal", "trash"] as const) {
      expect(callbacks[name], name).toHaveBeenCalledTimes(1);
    }
    const menu = buildAppMenu(input);
    const settings = menu.groups[1].items[0] as MenuAction;
    settings.run();
    expect(input.onSettings).toHaveBeenCalledTimes(1);
    expect(settings.icon).toBeDefined();
    const shortcuts = menu.groups[3].items[1] as MenuAction;
    shortcuts.run();
    expect(input.onKeyboardShortcuts).toHaveBeenCalledTimes(1);
  });

  it("makes Open recent a submenu of the host's entries — full path on hover — or one disabled 'No recent files' row", () => {
    const input = fullInput();
    const file = fileSubmenu(buildAppMenu(input));
    const recent = flatRows(file).find(isSubmenu)!.submenu;
    expect(recent.id).toBe("open-recent");
    const rows = flatRows(recent) as MenuAction[];
    expect(rows.map((row) => [row.id, row.label, row.title])).toEqual([
      ["recent:/home/bam/SystemSketch/CAD Exporter.tldr", "CAD Exporter", "/home/bam/SystemSketch/CAD Exporter.tldr"],
      ["recent:/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr", "series_a_pose_pipeline_v7", "/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr"],
    ]);
    rows[1].run();
    expect(input.file.openRecent!.onOpen).toHaveBeenCalledWith("/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr");

    const empty = fileSubmenu(buildAppMenu(fullInput({ file: { ...everyFileCallback(), openRecent: { entries: [], onOpen: vi.fn() } } })));
    const none = flatRows(flatRows(empty).find(isSubmenu)!.submenu) as MenuAction[];
    expect(none.map((row) => [row.label, row.disabled])).toEqual([[NO_RECENT_FILES_LABEL, true]]);
  });

  it("passes the host's stock groups through verbatim, checked rows included", () => {
    const input = fullInput();
    const menu = buildAppMenu(input);
    const [edit, view, exportMenu] = (menu.groups[2].items as { submenu: MenuSpec }[]).map((entry) => entry.submenu);
    expect([edit.id, view.id, exportMenu.id]).toEqual(["edit", "view", "export"]);
    expect(edit.groups).toEqual(input.edit);
    expect(view.groups).toEqual(input.view);
    const preferences = (menu.groups[3].items[0] as { submenu: MenuSpec }).submenu;
    expect(preferences.id).toBe("preferences");
    expect((preferences.groups[0].items[0] as MenuAction).checked).toBe(true);
  });

  it("is pure: the same input builds a deep-equal spec, on either platform's spelling", () => {
    const input = fullInput();
    expect(buildAppMenu(input)).toEqual(buildAppMenu(input));
    const mac = fileSubmenu(buildAppMenu(fullInput({ platform: "mac" })));
    expect((flatRows(mac)[0] as MenuAction).shortcut).toBe("⌘N");
  });
});
