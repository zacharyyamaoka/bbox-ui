// src/menus.smoke.test.tsx — L4's acceptance: the trunk's chrome bar (file
// burger, undo/redo, title), floating toolbar over a selection, frames and
// problems panels, and status strip are mounted through tldraw's component
// seams and wired to the live editor. Committed with the plan
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L4), off-limits to builders.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

function placeBlock(name: string, x = 200, y = 200) {
  const id = app!.editor.createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports: { left: [{ id: "in", name: "in", type: "" }], right: [], top: [], bottom: [] } } } as never);
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

  it("undo/redo in the chrome bar mirror the editor's history", async () => {
    app = await mountApp();
    const undo = await waitFor(() => app!.root.querySelector<HTMLButtonElement>('[data-testid="ss-chrome-undo"]'), { what: "undo" });
    const redo = app.root.querySelector<HTMLButtonElement>('[data-testid="ss-chrome-redo"]')!;
    expect(undo.disabled).toBe(true);
    const id = placeBlock("u");
    await app.editor.markHistoryStoppingPoint("test");
    await waitFor(() => !undo.disabled, { what: "undo enabled after an edit" });
    await userEvent.click(undo);
    await waitFor(() => app!.editor.getShape(id) === undefined, { what: "undone" });
    await waitFor(() => !redo.disabled, { what: "redo enabled" });
    await userEvent.click(redo);
    await waitFor(() => app!.editor.getShape(id) !== undefined, { what: "redone" });
  });

  it("the file burger lists New, Open .tldr, Save .tldr; Save downloads a document whose records include our shape", async () => {
    app = await mountApp();
    placeBlock("saved");
    const burger = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-chrome-burger"]'), { what: "burger" });
    await userEvent.click(burger);
    const labels = await waitFor(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((el) => el.textContent?.trim() ?? "");
      return items.length ? items : null;
    }, { what: "menu rows" });
    expect(labels.some((l) => /^new/i.test(l))).toBe(true);
    expect(labels.some((l) => /open/i.test(l) && /tldr/i.test(l))).toBe(true);
    expect(labels.some((l) => /save/i.test(l) && /tldr/i.test(l))).toBe(true);
    await userEvent.keyboard("{Escape}");
    // The serializer the burger uses is exposed for tests as a pure function of the editor.
    const { serializeBoard } = await import("./chrome/fileActions");
    const text = await serializeBoard(app.editor);
    const parsed = JSON.parse(text) as { records: { typeName: string; type?: string }[] };
    expect(parsed.records.some((r) => r.typeName === "shape" && r.type === BLOCK_SHAPE_TYPE)).toBe(true);
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
