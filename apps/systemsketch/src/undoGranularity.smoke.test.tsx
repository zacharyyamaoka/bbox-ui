// src/undoGranularity.smoke.test.tsx — P-014, "one editing gesture is one undo
// step", measured on REAL gestures in REAL headless Chromium.
//
// THE MEASUREMENT, and why it is shaped this way. `editor.history` is
// `protected`, so a test cannot read `getNumUndos()` — and it should not want
// to. The item is a sentence about what Ctrl+Z does, so the probe presses
// Ctrl+Z (via `editor.undo()`, the same call the shortcut binds) and looks at
// the board. `undoStepsBackTo` counts how many presses it takes to get the
// value home; the item is satisfied at exactly ONE.
//
// EVERY CASE ALSO CHECKS THE SHAPE IS STILL THERE, because there are TWO ways
// to break this item and they fail in opposite directions:
//
//   too many entries — a mark per keystroke. One Ctrl+Z leaves the board
//                      half-changed, which is the item's own wording.
//   no entry at all  — no mark, so the gesture merges into whatever store
//                      transaction preceded it. One Ctrl+Z then undoes the
//                      gesture AND the thing before it. Measured on the rail
//                      2026-09-21: "one undo after renaming a port on a
//                      freshly placed block deleted the block"
//                      (src/railLabel.smoke.test.tsx's closing case).
//
// The fixtures are created with a bare `editor.createShape`, which opens no
// mark of its own — so a gesture that fails to mark merges into the creation
// and the single undo deletes the shape. That is the sharp end of the second
// failure, and it is why `expect(shape).toBeTruthy()` is not decoration.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

/**
 * Let tldraw's click counter lapse between two TESTS, not just between two
 * gestures.
 *
 * `src/textEditing.smoke.test.tsx` records the mechanism — tldraw counts
 * clicks in a time window (`ClickManager`, `options.doubleClickDurationMs`),
 * so a double-click fired microseconds after the previous one reads as the
 * THIRD and FOURTH clicks of one gesture rather than as a new double-click.
 * That file needed the pause inside a case; this one needs it between cases,
 * because almost every case here opens an editing session with a
 * double-click and the whole file runs in one browser tab. Measured: without
 * it, two of the nine cases time out at `waitFor(… the session opened)` on
 * roughly one run in three, with no other change to the app.
 */
beforeEach(() => new Promise((resolve) => setTimeout(resolve, 600)));

afterEach(() => {
  app?.unmount();
  app = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

/**
 * How many Ctrl+Z it takes to get `read()` back to `want`.
 *
 * Returns the count rather than asserting, so a failure message can carry the
 * real number — "expected 1, got 7" is the report this item asks for, and a
 * bare `toBe(true)` would not be one.
 */
async function undoStepsBackTo(read: () => string, want: string, what: string): Promise<number> {
  for (let step = 1; step <= 40; step += 1) {
    app!.editor.undo();
    await nextFrame();
    if (read() === want) return step;
  }
  throw new Error(`${what}: 40 undos never restored ${JSON.stringify(want)} — it reads ${JSON.stringify(read())}`);
}

function blockOf(id: TLShapeId): BlockShape {
  return app!.editor.getShape<BlockShape>(id)!;
}

function placeBlock(props: Partial<BlockShape["props"]> = {}): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x: 240,
    y: 200,
    props: { name: "estimate", description: "", view: "simple", w: 320, h: 120, ports: NO_PORTS, ...props },
  } as never);
  return id;
}

async function titleOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(
    () => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-header"] [data-slot="ss-block-title"][data-editing="false"]`),
    { what: `the resting title of ${id}` },
  );
}

/**
 * Open the right rail on the Inspector the way a person does — two real
 * presses. The same pair `src/inspector.smoke.test.tsx` drives; restated here
 * rather than shared because a smoke test that imports another smoke test's
 * helper pulls its module graph in too.
 */
async function openInspector(): Promise<HTMLElement> {
  await userEvent.click(await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-frames"]'), { what: "the Frames launcher" }));
  await userEvent.click(await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), { what: "the Inspector switch" }));
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="inspector"]'), { what: "the inspector panel" });
}

describe("P-014 — one editing gesture is one undo step", () => {
  it("typing a block title", async () => {
    app = await mountApp();
    const id = placeBlock({ name: "estimate" });
    await userEvent.dblClick(await titleOf(id));
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the title session opened" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("detect");
    await waitFor(() => blockOf(id).props.name === "detect", { what: "the keystrokes reached props.name" });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "the session closed" });

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.name ?? "<gone>", "estimate", "block title");
    expect(app.editor.getShape(id), "the block must survive an undo of its own rename").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one rename gesture").toBe(1);
  });

  it("typing a block description on the card", async () => {
    app = await mountApp();
    const id = placeBlock({ name: "estimate", description: "before" });
    const resting = await waitFor(
      () => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-description"][data-editing="false"]`),
      { what: "the resting description" },
    );
    await userEvent.dblClick(resting);
    await waitFor(() => document.querySelector(`[data-ss-node="${id}"] [data-slot="block-description"][data-editing="true"]`), {
      what: "the description editor",
    });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("after");
    await waitFor(() => blockOf(id).props.description === "after", { what: "the keystrokes reached props.description" });

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.description ?? "<gone>", "before", "block description");
    expect(app.editor.getShape(id), "the block must survive an undo of its own description edit").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one description gesture").toBe(1);
  });

  it("renaming a port label on a block's rail", async () => {
    app = await mountApp();
    const id = placeBlock({ view: "port", w: 240, h: 160, ports: { ...NO_PORTS, left: [{ id: "in", declaration: "gain_x: float" }] } });
    const label = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "a rail label" });
    await userEvent.dblClick(label);
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="true"]`), { what: "the rail label editing" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("gain_y");
    await waitFor(() => blockOf(id).props.ports.left[0]?.declaration === "gain_y: float", { what: "the rename landed" });
    await userEvent.keyboard("{Enter}");

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.ports.left[0]?.declaration ?? "<gone>", "gain_x: float", "rail label");
    expect(app.editor.getShape(id), "the block must survive an undo of its own port rename").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one rail rename gesture").toBe(1);
  });

  it("picking a glyph on the card", async () => {
    app = await mountApp();
    const id = placeBlock({ name: "estimate", glyph: "" });
    const trigger = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-slot="glyph-picker-trigger"]`), {
      what: "the glyph trigger",
    });
    await userEvent.click(trigger);
    const panel = await waitFor(() => document.querySelector<HTMLElement>('[data-slot="glyph-picker-panel"]'), { what: "the picker panel" });
    // Filter first: the grid is windowed, so narrowing is what puts a cell in
    // the DOM at all (src/glyph.smoke.test.tsx's `pickLucide`, same recipe).
    await userEvent.fill(await waitFor(() => panel.querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]'), { what: "the filter" }), "rocket");
    await userEvent.click(await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="glyph-picker-cell-lucide-rocket"]'), { what: "the rocket cell" }));
    await waitFor(() => (blockOf(id).props.glyph === "lucide:rocket" ? true : null), { what: "the pick reached props.glyph" });

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.glyph ?? "<gone>", "", "glyph pick");
    expect(app.editor.getShape(id), "the block must survive an undo of its own glyph pick").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one glyph pick").toBe(1);
  });

  it("picking a glyph through the INSPECTOR — the same picker, the other door", async () => {
    app = await mountApp();
    const id = placeBlock({ name: "estimate", glyph: "" });
    app.editor.select(id);
    const panel = await openInspector();
    await userEvent.click(await waitFor(() => panel.querySelector<HTMLElement>('[data-slot="glyph-picker-trigger"]'), { what: "the inspector glyph row" }));
    const picker = await waitFor(() => document.querySelector<HTMLElement>('[data-slot="glyph-picker-panel"]'), { what: "the picker panel" });
    await userEvent.fill(await waitFor(() => picker.querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]'), { what: "the filter" }), "rocket");
    await userEvent.click(await waitFor(() => picker.querySelector<HTMLElement>('[data-testid="glyph-picker-cell-lucide-rocket"]'), { what: "the rocket cell" }));
    await waitFor(() => (blockOf(id).props.glyph === "lucide:rocket" ? true : null), { what: "the pick reached props.glyph" });

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.glyph ?? "<gone>", "", "inspector glyph pick");
    expect(app.editor.getShape(id), "the block must survive an undo of its own glyph pick").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one glyph pick").toBe(1);
  });

  it("typing a description in the INSPECTOR", async () => {
    app = await mountApp();
    const id = placeBlock({ name: "estimate", description: "before" });
    app.editor.select(id);
    const panel = await openInspector();
    const field = await waitFor(() => panel.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]'), { what: "the description field" });
    await userEvent.click(field);
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("after");
    await waitFor(() => blockOf(id).props.description === "after", { what: "the keystrokes reached props.description" });

    const steps = await undoStepsBackTo(() => blockOf(id)?.props.description ?? "<gone>", "before", "inspector description");
    expect(app.editor.getShape(id), "the block must survive an undo of its own description edit").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one description gesture").toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * The controls. These are gestures whose seam ALREADY marks once, so a
   * red here means the probe is wrong rather than the app — which is the
   * only thing that makes a red above trustworthy.
   * ------------------------------------------------------------------ */

  it("typing into a code cell — the `beginEdit` idiom, expected green", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: CODE_SHAPE_TYPE, x: 140, y: 120, props: { code: "x = 0", language: "python" } } as never);
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="code-editor"]`), { what: "the code face" });
    await userEvent.dblClick(face);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "editing the code shape" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("y = 1");
    await waitFor(() => (app!.editor.getShape(id) as { props: { code: string } }).props.code === "y = 1", { what: "the keystrokes reached props.code" });
    await userEvent.keyboard("{Escape}");

    const steps = await undoStepsBackTo(() => (app!.editor.getShape(id) as { props: { code: string } } | undefined)?.props.code ?? "<gone>", "x = 0", "code cell");
    expect(app.editor.getShape(id)).toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one typing gesture in a code cell").toBe(1);
  });

  it("renaming an ss-port declaration — the `beginEdit` idiom, expected green", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 220, y: 180, props: { declaration: "old_name", direction: "in" } } as never);
    const label = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "the port label" });
    await userEvent.dblClick(label);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the rename session opened" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("new_name");
    await waitFor(() => (app!.editor.getShape(id) as { props: { declaration: string } }).props.declaration === "new_name", { what: "the rename landed" });
    await userEvent.keyboard("{Enter}");

    const steps = await undoStepsBackTo(
      () => (app!.editor.getShape(id) as { props: { declaration: string } } | undefined)?.props.declaration ?? "<gone>",
      "old_name",
      "port declaration",
    );
    expect(app.editor.getShape(id)).toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one port rename gesture").toBe(1);
  });

  it("drawing a cable — the `editor.run` + mark idiom, expected green", async () => {
    app = await mountApp();
    const source = placeBlock({ name: "a", view: "port", ports: { ...NO_PORTS, right: [{ id: "out", declaration: "out: Pose" }] } });
    app.editor.updateShape({ id: source, type: BLOCK_SHAPE_TYPE, x: 120, y: 160 } as never);
    const sink = createShapeId();
    app.editor.createShape({
      id: sink,
      type: BLOCK_SHAPE_TYPE,
      x: 620,
      y: 420,
      props: { name: "b", description: "", view: "port", w: 240, h: 160, ports: { ...NO_PORTS, left: [{ id: "in", declaration: "in: Pose" }] } },
    } as never);
    const dot = async (node: TLShapeId, port: string) =>
      waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${node}"] [data-block-id="${node}"] [data-port-id="${port}"] [data-slot="port-dot"]`), {
        what: `${node}/${port} dot`,
      });
    await userEvent.dragAndDrop(await dot(source, "out"), await dot(sink, "in"));
    await waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === WIRE_SHAPE_TYPE), { what: "an ss-wire" });

    const steps = await undoStepsBackTo(
      () => (app!.editor.getCurrentPageShapes().some((s) => s.type === WIRE_SHAPE_TYPE) ? "wired" : "bare"),
      "bare",
      "connect gesture",
    );
    expect(app.editor.getShape(source), "the source block must survive an undo of the cable").toBeTruthy();
    expect(app.editor.getShape(sink), "the sink block must survive an undo of the cable").toBeTruthy();
    expect(steps, "Ctrl+Z presses to undo one connect gesture").toBe(1);
  });
});
