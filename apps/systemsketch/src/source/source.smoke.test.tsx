// src/source/source.smoke.test.tsx — lane scv:scv-origin-on-app-shape's
// DRIVEN acceptance, in the app's own smoke style (real headless Chromium,
// the real <App/>, real input). Written and committed BEFORE the
// implementation; not weakened afterwards.
//
// What it grades, in the brief's own words:
//   - right-click a two-shape selection with the backend switch on `none`
//     → NO `bbox-source` group (absent, never disabled);
//   - flip the switch to `pyblocks` → "Convert to code" is there;
//   - run it → exactly one code shape stands where the selection was;
//   - a bound code shape with no backend wears the Orphaned badge;
//   - an unbound one wears the Pseudo badge.
//
// The switch driven here is the app's REAL `Backend: none | pyblocks`
// control (`src/backend/BackendSettings.tsx`, mounted in tldraw's own
// top-right `components.SharePanel` seat). The lane brief described a
// SECOND, bottom-right "pyblocks (stub)" drop-down — written before stream
// 3 landed. Stream 3 landed, so the stub would be a second switch claiming
// to say the same thing, and a board with two disagreeing backend settings
// is worse than one in an unexpected corner. See ./backendSwitch.tsx.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BACKEND_SETTING_STORAGE_KEY } from "@trunk/backend/backendSetting";

import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE } from "../shapes/types";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "../testing/harness";
import { SOURCE_MENU_GROUP_ID } from "./sourceContextMenu";

let app: MountedApp | null = null;

beforeEach(() => {
  // The backend setting is per-viewer localStorage and OUTLIVES a test (the
  // board does not — `persistenceKey: null`). Every case states the setting
  // it needs; none inherits one.
  try {
    window.localStorage.removeItem(BACKEND_SETTING_STORAGE_KEY);
  } catch {
    /* a browser that refuses storage still runs these tests */
  }
});

afterEach(() => {
  app?.unmount();
  app = null;
});

const GROUP = `[data-testid="context-menu-group.${SOURCE_MENU_GROUP_ID}"]`;
const CONVERT = '[data-testid="context-menu.convert-to-code"]';
const EXPAND = '[data-testid="context-menu.expand-to-blocks"]';

function placeBlock(name: string, x: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y: 260, props: { name, view: "simple" } } as never);
  return id;
}

function placeCode(props: Record<string, unknown>): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: CODE_SHAPE_TYPE, x: 120, y: 500, props } as never);
  return id;
}

/** tldraw's context menu is radix, portaled into the editor container and
 *  mounted only while open — so every assertion queries the document. */
async function openContextMenuOver(shapeId: TLShapeId): Promise<HTMLElement> {
  const el = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${shapeId}"]`), { what: "the shape element" });
  const at = centreOf(el);
  // A native `contextmenu` event rather than `userEvent`: vitest's browser
  // `userEvent` has no right-click verb, and radix's ContextMenu.Trigger
  // listens for exactly this event through React's synthetic system, which
  // a bubbling native event reaches. Same call the trunk's own
  // SourceActions.stories.tsx makes with `fireEvent.contextMenu`.
  canvasOf(app!.root).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  return await waitFor(() => document.querySelector<HTMLElement>('[data-testid="context-menu"]'), { what: "tldraw's context menu" });
}

async function closeContextMenu(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => document.querySelector('[data-testid="context-menu"]') === null || "closed", { what: "the context menu closed" });
}

/** Drive the app's own Backend control — never a URL flag, never a direct
 *  localStorage poke: the switch is the thing under test. */
async function setBackend(kind: "none" | "pyblocks"): Promise<void> {
  const trigger = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-backend-trigger"]'), { what: "the Backend control" });
  await userEvent.click(trigger);
  const select = await waitFor(() => document.querySelector<HTMLSelectElement>('[data-testid="ss-backend-kind"]'), { what: "the Backend select" });
  await userEvent.selectOptions(select, kind);
  await waitFor(() => select.value === kind, { what: `the Backend select reads ${kind}` });
  await userEvent.keyboard("{Escape}");
}

describe("the source group is GATED on the backend", () => {
  it("backend none → right-clicking a two-shape selection shows tldraw's own menu and NO bbox-source group", async () => {
    app = await mountApp();
    const a = placeBlock("A", 420);
    const b = placeBlock("B", 640);
    app.editor.setSelectedShapes([a, b]);

    const menu = await openContextMenuOver(a);
    // The menu really opened — a negative assertion against a menu that
    // never rendered would pass for the wrong reason.
    expect(menu.querySelectorAll(".tlui-menu__group").length).toBeGreaterThan(0);
    expect(document.querySelector(GROUP), "the source group must be ABSENT, not disabled").toBeNull();
    expect(document.querySelector(CONVERT)).toBeNull();
    await closeContextMenu();
  });

  it("backend pyblocks → the same right-click carries Convert to code, and running it leaves ONE code shape where the selection was", async () => {
    app = await mountApp();
    await setBackend("pyblocks");
    const a = placeBlock("A", 420);
    const b = placeBlock("B", 640);
    app.editor.setSelectedShapes([a, b]);

    await openContextMenuOver(a);
    const group = await waitFor(() => document.querySelector<HTMLElement>(GROUP), { what: "the bbox-source group" });
    const convert = group.querySelector<HTMLElement>(CONVERT);
    expect(convert, "Convert to code").not.toBeNull();
    expect(convert!.textContent).toContain("Convert to code");
    // Two blocks, neither a cell — expand does not apply and is therefore
    // not rendered at all.
    expect(document.querySelector(EXPAND)).toBeNull();

    const before = app.editor.getCurrentPageShapeIds().size;
    await userEvent.click(convert!);

    const cellId = await waitFor(
      () => app!.editor.getCurrentPageShapes().find((shape) => shape.type === CODE_SHAPE_TYPE)?.id,
      { what: "one ss-code shape after the convert" },
    );
    expect(app.editor.getCurrentPageShapes().filter((shape) => shape.type === CODE_SHAPE_TYPE)).toHaveLength(1);
    // The two blocks did not vanish — they are INSIDE the cell, which is
    // what makes "Expand to blocks" able to put them back.
    expect(String(app.editor.getShape(a)!.parentId)).toBe(String(cellId));
    expect(String(app.editor.getShape(b)!.parentId)).toBe(String(cellId));
    expect(app.editor.getCurrentPageShapeIds().size).toBe(before + 1);
    // The cell carries the trunk's generated header, naming its members —
    // the WHOLE header, byte for byte, with one deliberate hole in it.
    //
    // The hole is the MEMBER ORDER, and it is a finding rather than a
    // concession: `collapseToCode` names `selectionRoots(...)` in SCENE
    // order, and the app's scene is `sceneFromRecords(store.allRecords())`,
    // whose order is the store's record order and not the order the blocks
    // were created or selected in. Measured here: A placed first, B second,
    // selected [A, B] — header read `2 blocks: B, A`. Nothing between the
    // selection and the header preserves authoring order, so pinning one
    // spelling would pin a coin flip. Fixing it means sorting in
    // `src/document/sceneFromStore.ts`, which belongs to another lane.
    const code = (app.editor.getShape(cellId) as unknown as { props: { code: string } }).props.code;
    expect(code).toMatch(
      /^# code cell — 2 blocks: (A, B|B, A)\n# annotation only until a backend is connected; expand restores the blocks\n$/,
    );
  });

  it("backend pyblocks → a selected code cell is offered Expand to blocks, and expanding restores the members", async () => {
    app = await mountApp();
    await setBackend("pyblocks");
    const a = placeBlock("A", 420);
    const b = placeBlock("B", 640);
    app.editor.setSelectedShapes([a, b]);

    await openContextMenuOver(a);
    const convert = await waitFor(() => document.querySelector<HTMLElement>(CONVERT), { what: "Convert to code" });
    await userEvent.click(convert);
    const cellId = await waitFor(
      () => app!.editor.getCurrentPageShapes().find((shape) => shape.type === CODE_SHAPE_TYPE)?.id,
      { what: "the code cell" },
    );

    app.editor.setSelectedShapes([cellId]);
    await openContextMenuOver(cellId);
    const expand = await waitFor(() => document.querySelector<HTMLElement>(EXPAND), { what: "Expand to blocks" });
    expect(expand.textContent).toContain("Expand to blocks");
    await userEvent.click(expand);

    await waitFor(() => app!.editor.getShape(cellId) === undefined, { what: "the cell is gone" });
    expect(String(app.editor.getShape(a)!.parentId)).toMatch(/^page:/);
    expect(String(app.editor.getShape(b)!.parentId)).toMatch(/^page:/);
  });
});

describe("the origin badge on the app's own code shape", () => {
  it("an unbound cell wears Pseudo", async () => {
    app = await mountApp();
    const id = placeCode({ code: "gain = clamp(x, 0, 1)", language: "python" });
    const badge = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="origin-badge"]`),
      { what: "the origin badge" },
    );
    expect(badge.dataset.state).toBe("pseudo");
    expect(badge.textContent).toContain("Pseudo");
  });

  it("a BOUND cell with no backend wears Orphaned — a binding nobody can check is never reported as synced", async () => {
    app = await mountApp();
    const id = placeCode({
      code: "def run(self):\n    return 1\n",
      language: "python",
      origin: { uri: "stereo.py", anchor: "Pipeline.run", contentHash: "sha256:" + "a".repeat(64) },
    });
    const badge = await waitFor(
      () => {
        const found = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="origin-badge"]`);
        return found?.dataset.state === "orphaned" ? found : null;
      },
      { what: "the Orphaned badge on a bound cell with no backend" },
    );
    expect(badge.textContent).toContain("Orphaned");
  });
});
