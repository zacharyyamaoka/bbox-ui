// src/menus.smoke.test.tsx — L4's acceptance: the trunk's chrome bar (file
// burger, title), floating toolbar over a selection, frames and
// problems panels, and status strip are mounted through tldraw's component
// seams and wired to the live editor. Committed with the plan
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L4), off-limits to builders.
//
// AMENDED 2026-09-19 by the planning lane of docs/CHROME-FILES-SETTINGS-PLAN.md
// (the acceptance's author, before any builder). Zach: "Undo redo should be
// hidden … We don't need to show that" and "Please further build out our
// burger menu. right now its looking too thin!". Two L4 cases asserted the
// opposite — an undo/redo pill, and a three-row New/Open .tldr/Save .tldr
// burger — and are REPLACED below, not deleted: undo/redo now live in Edit ▸
// (and Ctrl+Z), and the burger is the old app's File-first structure. Every
// other case here is L4's, unchanged.
import { createShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { clickRow, closeMenus, openBurger, openSubmenu, rowsOf, separatorsOf } from "./testing/menus";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

function placeBlock(name: string, x = 200, y = 200) {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports: { left: [{ id: "in", declaration: "in" }], right: [], top: [], bottom: [] } } } as never);
  return id;
}

describe("L4 — editor menus through tldraw's component seams", () => {
  it("replaces tldraw's own main menu / style panel / navigation panel with the kit's chrome bar and status strip", async () => {
    app = await mountApp();
    await waitFor(() => app!.root.querySelector('[data-testid="ss-chrome"]'), { what: "the ChromeBar" });
    await waitFor(() => app!.root.querySelector('[data-slot="status-strip"]'), { what: "the StatusStrip" });
    expect(app.root.querySelector(".tlui-style-panel")).toBeNull();
    expect(app.root.querySelector(".tlui-navigation-panel")).toBeNull();
    expect(app.root.querySelector(".tlui-main-menu")).toBeNull();
    // Stock toasts/dialogs remain (they carry file-open errors and confirmations).
    expect(app.root.querySelector(".tl-canvas")).not.toBeNull();
  });

  it("the undo/redo pill is gone; Edit ▸ Undo and Redo drive the editor's history, and Ctrl+Z still undoes", async () => {
    app = await mountApp();
    await waitFor(() => app!.root.querySelector('[data-testid="ss-chrome"]'), { what: "the ChromeBar" });
    expect(app.root.querySelector('[data-testid="ss-chrome-undo"]')).toBeNull();
    expect(app.root.querySelector('[data-testid="ss-chrome-redo"]')).toBeNull();
    expect(document.querySelector('[aria-label="Document history"]')).toBeNull();

    const id = placeBlock("u");
    await app.editor.markHistoryStoppingPoint("test");
    let edit = await openSubmenu(await openBurger(app), "Edit");
    const [undo, redo] = rowsOf(edit);
    expect([undo.label, undo.shortcut]).toEqual(["Undo", "Ctrl + Z"]);
    expect([redo.label, redo.shortcut]).toEqual(["Redo", "Ctrl + ⇧ + Z"]);
    const labels = rowsOf(edit).map((row) => row.label);
    // The stock Edit rows tldraw's own main menu carried, in tldraw's order.
    const expected = ["Cut", "Copy", "Paste", "Duplicate", "Delete", "Select all"];
    const positions = expected.map((label) => labels.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    await clickRow(edit, "Undo");
    await waitFor(() => app!.editor.getShape(id) === undefined, { what: "Edit ▸ Undo undid the block" });

    edit = await openSubmenu(await openBurger(app), "Edit");
    await clickRow(edit, "Redo");
    await waitFor(() => app!.editor.getShape(id) !== undefined, { what: "Edit ▸ Redo redid it" });
    await closeMenus();

    // tldraw's own keybinding is untouched by the pill's removal.
    app.editor.focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    await waitFor(() => app!.editor.getShape(id) === undefined, { what: "Ctrl+Z undid it" });
  });

  it("the burger is File first, then Settings, Edit, View, Export, Preferences, Keyboard shortcuts, Compare, the doors out (bbox-ui.com, Storybook), and the old-app switch — grouped like the old app", async () => {
    app = await mountApp();
    const root = await openBurger(app);
    // A row's NAME: its own text nodes, minus the two columns the trunk renders
    // beside the label as separate elements (`BurgerMenuEntry`,
    // apps/storybook-basics/src/editor/chromeBar.tsx:284 and :298) — the
    // shortcut (`dropdown-menu-shortcut`) and a `MenuAction.badge`
    // (`menu-action-badge`). Removed by NODE, never by subtracting text: see
    // ./testing/menus.ts:27-48 for the "DeleteDel" → "eteDel" bug that rule
    // exists for. Walker shape copied from ./sites.smoke.test.tsx:95-104,
    // which reads the same rows the same way.
    const nameOf = (row: HTMLElement): string => {
      const columns = Array.from(row.querySelectorAll('[data-slot="dropdown-menu-shortcut"], [data-slot="menu-action-badge"]'));
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let text = "";
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (columns.some((column) => column.contains(node))) continue;
        text += node.nodeValue ?? "";
      }
      return text.trim();
    };
    // WHY the two Compare rows sit here and this list grew: ruling 10 ("we want
    // to support the Compare view") put Compare on the burger, and `useCompareView`
    // hands its group to `buildAppMenu`'s `extra` (chrome/TitleBar/chromeBar.tsx:82,
    // :128). This assertion is the app's whole menu, so ADDING a feature to the
    // menu is supposed to change it — a stale list here means the test was
    // asserting the absence of a feature, which is what it was doing before
    // 2026-09-21, and again from 2026-09-22 until lane G-STALE (2026-10-06).
    // Updated rather than loosened: it still pins the exact order.
    //
    // WHY "Open bbox-ui.com" / "Open Storybook" joined, and why by NAME: they
    // are the doors out Zach asked for on 2026-09-21 ("give the option to open
    // the bbox-ui.com site and the storybook site", chrome/sites.ts:4-9), in
    // their own group before the old-app switch (chromeBar.tsx:107-128). Each
    // carries a LIVE channel badge (chrome/siteStatus.ts:133-153) that says
    // what is answering right now — measured on this tree as "(remote)" and
    // "(not running)", and on 2026-09-30 as "(preview · main · 705847c ·
    // +uncommitted) · different from this board" when a peer's Storybook held
    // :5421. Pinning the badge would make the burger order depend on what
    // else runs on the box and on probe timing. The name never carries it
    // (chrome/sites.ts:114-123), and sites.smoke.test.tsx:314 pins the badge
    // text itself against a stubbed `/api/health`.
    expect(rowsOf(root).map((row) => nameOf(row.element))).toEqual([
      "File",
      "Settings",
      "Edit",
      "View",
      "Export",
      "Preferences",
      "Keyboard shortcuts",
      "Compare changes…",
      "Set compare baseline to this board",
      "Open bbox-ui.com",
      "Open Storybook",
      "Switch to old SystemSketch",
    ]);
    // File | Settings | Edit View Export | Preferences Keyboard shortcuts | Compare ×2 | bbox-ui.com Storybook | old app.
    expect(separatorsOf(root)).toBe(6);

    const file = await openSubmenu(root, "File");
    expect(rowsOf(file).map((row) => [row.label, row.shortcut])).toEqual([
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
    // New … Open recent | Save … Rename | Copy Absolute Path … Move to Trash…
    expect(separatorsOf(file)).toBe(2);
    await closeMenus();

    // The serializer the file commands use is still exposed as a pure function of the editor.
    placeBlock("saved");
    const { serializeBoard } = await import("./chrome/FileMenu");
    const text = await serializeBoard(app.editor);
    const parsed = JSON.parse(text) as { records: { typeName: string; type?: string }[] };
    expect(parsed.records.some((r) => r.typeName === "shape" && r.type === BLOCK_SHAPE_TYPE)).toBe(true);
  });

  it("View ▸ Zoom to 100% resets the camera; Preferences ▸ always-snap is a checkbox row that toggles the editor's own preference; Export and Keyboard shortcuts are tldraw's", async () => {
    app = await mountApp();
    app.editor.setCamera({ x: 0, y: 0, z: 0.5 });
    const view = await openSubmenu(await openBurger(app), "View");
    const viewRows = rowsOf(view).map((row) => [row.label, row.shortcut]);
    expect(viewRows).toContainEqual(["Zoom in", "Ctrl + ="]);
    expect(viewRows).toContainEqual(["Zoom to 100%", "⇧ + 0"]);
    await clickRow(view, "Zoom to 100%");
    await waitFor(() => Math.abs(app!.editor.getZoomLevel() - 1) < 1e-6, { what: "zoom back to 1" });

    const before = app.editor.user.getIsSnapMode();
    const preferences = await openSubmenu(await openBurger(app), "Preferences");
    const snap = rowsOf(preferences).find((row) => /snap/i.test(row.label));
    expect(snap).toBeDefined();
    expect(snap!.element.getAttribute("role")).toBe("menuitemcheckbox");
    expect(snap!.element.getAttribute("aria-checked")).toBe(String(before));
    await userEvent.click(snap!.element);
    await waitFor(() => app!.editor.user.getIsSnapMode() === !before, { what: "snap mode toggled" });
    await closeMenus();

    const exportMenu = await openSubmenu(await openBurger(app), "Export");
    const exportLabels = rowsOf(exportMenu).map((row) => row.label);
    expect(exportLabels.some((label) => /svg/i.test(label))).toBe(true);
    expect(exportLabels.some((label) => /png/i.test(label))).toBe(true);
    await closeMenus();

    await clickRow(await openBurger(app), "Keyboard shortcuts");
    await waitFor(() => document.querySelector(".tlui-shortcuts-dialog__body"), { what: "tldraw's keyboard shortcuts dialog" });
  });

  it("selecting a block shows the floating toolbar above it with view + delete actions; delete removes the block", async () => {
    app = await mountApp();
    const id = placeBlock("sel", 300, 300);
    app.editor.select(id);
    const bar = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), { what: "the floating toolbar visible" });
    const shapeRect = app.root.querySelector(`[data-shape-id="${id}"]`)!.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    expect(bar.getAttribute("data-side")).toBe("above");
    expect(barRect.bottom).toBeLessThanOrEqual(shapeRect.top + 2);
    const view = bar.querySelector<HTMLElement>('[data-testid="ss-selection-view"]');
    expect(view).not.toBeNull();
    const del = bar.querySelector<HTMLElement>('[data-testid="ss-selection-delete"]')!;
    await userEvent.click(del);
    await waitFor(() => app!.editor.getShape(id) === undefined, { what: "deleted" });
    await waitFor(() => app!.root.querySelector('[data-slot="floating-toolbar"][data-visible="true"]') === null, { what: "toolbar hidden with no selection" });
  });

  it("the problems panel derives from lintScene: a dangling-free board reads zero, a wire into a dead port reads one", async () => {
    app = await mountApp();
    const problems = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-problems"]'), { what: "problems item" });
    await userEvent.click(problems);
    const panel = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-problems-panel"]'), { what: "panel" });
    expect(panel.textContent).toMatch(/0 problems|no problems/i);
    // Create a wire whose target port does not exist on its block (the store allows it; the lint must catch it).
    const a = placeBlock("a", 100, 100);
    const b = placeBlock("b", 500, 120);
    const { createWire } = await import("./shapes/wire/createWire");
    createWire(app.editor, { from: { nodeId: a, portId: "in" }, to: { nodeId: b, portId: "ghost" } });
    await waitFor(() => /1 problem/i.test(app!.root.querySelector('[data-testid="ss-problems-panel"]')?.textContent ?? ""), { what: "one problem" });
  });

  it("the frames panel lists regions/expanded blocks and zooms to one on click", async () => {
    app = await mountApp();
    const id = placeBlock("proc", 900, 700);
    app.editor.updateShape({ id, type: BLOCK_SHAPE_TYPE, props: { view: "expanded", w: 300, h: 200 } } as never);
    const frames = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-frames"]'), { what: "frames item" });
    await userEvent.click(frames);
    // Rows are the kit's own `data-slot="frames-panel-item"` (framesPanel.tsx:369,393) — never a test id derived from display text.
    const row = await waitFor(() => Array.from(app!.root.querySelectorAll<HTMLElement>('[data-slot="frames-panel"] [data-slot="frames-panel-item"]')).find((el) => /proc/.test(el.textContent ?? "")), { what: "the proc row" });
    const before = app.editor.getCamera();
    await userEvent.click(row);
    await waitFor(() => {
      const cam = app!.editor.getCamera();
      return cam.x !== before.x || cam.y !== before.y || cam.z !== before.z ? true : null;
    }, { what: "camera moved to the frame" });
  });
});
