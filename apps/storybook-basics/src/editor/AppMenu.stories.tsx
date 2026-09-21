import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { buildAppMenu, type AppMenuInput } from "../components/appMenu";
import { ChromeBar, type ChromeBarProps } from "../components/chromeBar";

/**
 * The burger, built out — File first with the old app's rows and shortcuts,
 * then Settings, Edit ▸ View ▸ Export ▸, Preferences ▸ and Keyboard shortcuts,
 * each group behind a separator (Figma's structure, screenshot
 * `Pasted image 20260919135146.png`; the old app's rows, `…135314.png`).
 *
 * ACCEPTANCE committed by the planning lane of
 * docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
 * `chrome-rename-burger`. Zach: "Please further build out our burger menu.
 * right now its looking too thin!" and "Important is the file tab at the
 * start with then new, new window, open, open recent, etc I use those a lot".
 */
const PREFIX = "app-menu";
const onNew = fn();
const onOpenRecent = fn();
const onSnap = fn();

const INPUT: AppMenuInput = {
  label: "SystemSketch",
  platform: "other",
  file: {
    newDocument: onNew,
    newWindow: fn(),
    open: fn(),
    openRecent: {
      entries: [
        { path: "/home/bam/SystemSketch/CAD Exporter.tldr", title: "CAD Exporter" },
        { path: "/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr", title: "series_a_pose_pipeline_v7" },
      ],
      onOpen: onOpenRecent,
    },
    save: fn(),
    saveAs: fn(),
    rename: fn(),
    copyPath: fn(),
    reveal: fn(),
    trash: fn(),
  },
  onSettings: fn(),
  edit: [
    { id: "undo", items: [{ id: "undo", label: "Undo", shortcut: "Ctrl + Z", run: fn() }, { id: "redo", label: "Redo", shortcut: "Ctrl + ⇧ + Z", run: fn() }] },
    { id: "clipboard", items: [{ id: "cut", label: "Cut", run: fn() }, { id: "copy", label: "Copy", run: fn() }, { id: "paste", label: "Paste", run: fn() }] },
  ],
  view: [{ id: "zoom", items: [{ id: "zoom-in", label: "Zoom in", run: fn() }, { id: "zoom-out", label: "Zoom out", run: fn() }] }],
  export: [{ id: "formats", items: [{ id: "svg", label: "Export as SVG", run: fn() }, { id: "png", label: "Export as PNG", run: fn() }] }],
  preferences: [{ id: "toggles", items: [{ id: "snap", label: "Always snap", checked: true, run: onSnap }, { id: "grid", label: "Show grid", checked: false, run: fn() }] }],
  onKeyboardShortcuts: fn(),
  extra: [{ id: "legacy", items: [{ id: "switch-to-old-systemsketch", label: "Switch to old SystemSketch", run: fn() }] }],
};

function barProps(): ChromeBarProps {
  return {
    menu: buildAppMenu(INPUT),
    history: { canGoBack: false, canGoForward: false, onBack: fn(), onForward: fn() },
    identity: { title: "Untitled board", statusTone: "ok", statusLabel: "All changes saved" },
    rename: { active: false, onBegin: fn(), onCommit: fn(), onCancel: fn() },
    crumbs: [],
    depth: 0,
    onReturnToRoot: fn(),
    onJumpToLevel: fn(),
    fileActions: [],
    testIdPrefix: PREFIX,
  };
}

function Bar() {
  return (
    <div className="p-6">
      <ChromeBar {...barProps()} />
    </div>
  );
}

const meta = {
  title: "Basics/AppMenu",
  tags: ["area:basics", "lane:chrome-files-settings"],
  component: ChromeBar,
  // The stories render `Bar` (which builds its own props); these args exist
  // only so `StoryObj<typeof meta>` does not demand them per story. The menu
  // is built lazily inside `Bar`, so a throwing `buildAppMenu` fails the
  // story's render — not this module's evaluation.
  args: {
    menu: { id: "app", label: "SystemSketch", groups: [] },
    history: { canGoBack: false, canGoForward: false, onBack: fn(), onForward: fn() },
    identity: { title: "Untitled board", statusTone: "ok", statusLabel: "All changes saved" },
    rename: { active: false, onBegin: fn(), onCommit: fn(), onCancel: fn() },
    crumbs: [],
    depth: 0,
    onReturnToRoot: fn(),
    onJumpToLevel: fn(),
    fileActions: [],
    testIdPrefix: PREFIX,
  },
} satisfies Meta<typeof ChromeBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const POPUPS = '[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]';

function rowsIn(popup: Element) {
  return Array.from(popup.querySelectorAll<HTMLElement>(ROWS))
    .filter((row) => row.closest(POPUPS) === popup)
    .map((element) => {
      const shortcutElement = element.querySelector('[data-slot="dropdown-menu-shortcut"]');
      const shortcut = shortcutElement?.textContent?.trim() ?? "";
      const label = (element.textContent ?? "").replace(shortcutElement?.textContent ?? "", "").trim();
      return { element, label, shortcut };
    });
}

const separatorsIn = (popup: Element) => Array.from(popup.querySelectorAll('[role="separator"]')).filter((separator) => separator.closest(POPUPS) === popup).length;

async function openRoot(canvasElement: HTMLElement) {
  await userEvent.click(await within(canvasElement).findByTestId(`${PREFIX}-burger`));
  let root: HTMLElement | null = null;
  await waitFor(() => {
    root = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
    expect(root && rowsIn(root).length).toBeTruthy();
  });
  return root!;
}

async function openSub(parent: HTMLElement, label: string) {
  const before = new Set(document.querySelectorAll('[data-slot="dropdown-menu-sub-content"]'));
  const trigger = rowsIn(parent).find((row) => row.label === label);
  await expect(trigger, `a "${label}" row`).toBeDefined();
  await userEvent.click(trigger!.element);
  let sub: HTMLElement | null = null;
  await waitFor(() => {
    sub = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-sub-content"]')).find((candidate) => !before.has(candidate) && rowsIn(candidate).length > 0) ?? null;
    expect(sub).toBeTruthy();
  });
  return sub!;
}

/** The top level: File first, grouped File | Settings | Edit View Export |
 *  Preferences Keyboard shortcuts | the host's extra row. */
export const TopLevel: Story = {
  render: () => <Bar />,
  play: async ({ canvasElement }) => {
    const root = await openRoot(canvasElement);
    await expect(rowsIn(root).map((row) => row.label)).toEqual([
      "File",
      "Settings",
      "Edit",
      "View",
      "Export",
      "Preferences",
      "Keyboard shortcuts",
      "Switch to old SystemSketch",
    ]);
    await expect(separatorsIn(root)).toBe(4);
    await userEvent.keyboard("{Escape}");
  },
};

/** File ▸ — the old app's rows, in its order, with its shortcuts. */
export const FileSubmenu: Story = {
  render: () => <Bar />,
  play: async ({ canvasElement }) => {
    const file = await openSub(await openRoot(canvasElement), "File");
    await expect(rowsIn(file).map((row) => [row.label, row.shortcut])).toEqual([
      ["New", "Ctrl + N"],
      ["New window", "Ctrl + ⇧ + N"],
      ["Open…", "Ctrl + O"],
      ["Open recent", ""],
      ["Save", "Ctrl + S"],
      ["Save As…", "Ctrl + ⇧ + S"],
      ["Rename", "F2"],
      ["Copy Absolute Path", ""],
      ["Show in Files", ""],
      ["Move to Trash…", ""],
    ]);
    await expect(separatorsIn(file)).toBe(2);
    await expect(rowsIn(file).find((row) => row.label === "Move to Trash…")!.element).toHaveAttribute("data-variant", "destructive");

    const recent = await openSub(file, "Open recent");
    const recents = rowsIn(recent);
    await expect(recents.map((row) => row.label)).toEqual(["CAD Exporter", "series_a_pose_pipeline_v7"]);
    await expect(recents[0].element).toHaveAttribute("title", "/home/bam/SystemSketch/CAD Exporter.tldr");
    await userEvent.click(recents[1].element);
    await expect(onOpenRecent).toHaveBeenCalledWith("/home/bam/SystemSketch/series_a_pose_pipeline_v7.tldr");
  },
};

/** A row runs its callback; a checked row is a real checkbox item. */
export const RowsRunAndTogglesAreCheckboxes: Story = {
  render: () => <Bar />,
  play: async ({ canvasElement }) => {
    const file = await openSub(await openRoot(canvasElement), "File");
    await userEvent.click(rowsIn(file).find((row) => row.label === "New")!.element);
    await expect(onNew).toHaveBeenCalled();

    const preferences = await openSub(await openRoot(canvasElement), "Preferences");
    const [snap, grid] = rowsIn(preferences);
    await expect(snap.element).toHaveAttribute("role", "menuitemcheckbox");
    await expect(snap.element).toHaveAttribute("aria-checked", "true");
    await expect(grid.element).toHaveAttribute("aria-checked", "false");
    await userEvent.click(snap.element);
    await expect(onSnap).toHaveBeenCalled();
  },
};
