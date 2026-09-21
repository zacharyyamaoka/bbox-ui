// src/railLabel.smoke.test.tsx — P-037 on the rail, in REAL HEADLESS
// CHROMIUM: the port labels painted on a block's own card are editable where
// they are painted, and what is typed reaches the document.
//
// The affordance was already there before this lane — `LabeledPort`'s
// click-to-edit opens on a double-click — and that is exactly why this file
// exists: measured 2026-09-21, the editor opened, accepted keystrokes, and the
// store never changed, because `BlockFace`'s `onItemsChange` read only the
// ORDER out of what the rail reported. These tests fail on that version.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

async function placeBlock(left: { id: string; declaration: string }[]): Promise<TLShapeId> {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x: 200,
    y: 200,
    props: { name: "Detect", view: "port", w: 240, h: 160, ports: { left, right: [], top: [], bottom: [] } },
  });
  await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "a rail label" });
  return id;
}

function railsOf(id: TLShapeId) {
  return (app!.editor.getShape(id) as BlockShape).props.ports.left;
}

/** The rail label element for the nth port on the left wall. */
async function railLabel(id: TLShapeId, index = 0): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelectorAll<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`)[index], { what: `rail label ${index}` });
}

/** Double-click the label, select all, type, commit. A real user's rename. */
async function renameRail(id: TLShapeId, index: number, typed: string) {
  const label = await railLabel(id, index);
  await userEvent.dblClick(label);
  await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="true"]`), { what: "the rail label editing" });
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.keyboard(typed);
  await userEvent.keyboard("{Enter}");
}

describe("P-037 — a block's port labels edit on the card, and what you type is kept", () => {
  it("a double-click on a rail label opens an editor IN the card, not in a side panel", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    const label = await railLabel(id);
    expect(label.getAttribute("data-editing")).toBe("false");
    await userEvent.dblClick(label);
    const editing = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="true"]`), {
      what: "the rail label in its editing state",
    });
    // The control is INSIDE the block's own shape subtree — the whole point of
    // the item. A panel field would not be.
    expect(editing.closest(`[data-shape-id="${id}"]`)).not.toBeNull();
    expect(editing.querySelector('[data-slot="code-editor"]')).not.toBeNull();
  });

  it("typing a new name reaches props.ports — the keystrokes are NOT discarded", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    await renameRail(id, 0, "gain_y");
    await waitFor(() => railsOf(id)[0].declaration === "gain_y: float", { what: `the store to say gain_y (it says ${railsOf(id)[0].declaration})` });
    // At rest the rail paints the NAME HALF, which is the recorded ruling.
    const label = await railLabel(id);
    await waitFor(() => label.textContent === "gain_y", { what: `the rail to paint gain_y (it paints ${label.textContent})` });
  });

  it("the annotation the editor never showed survives the rename, spacing and all", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "pose:  Pose " }]);
    // The premise of the measurement: the editor really does open on the name
    // half only, so ` Pose ` is off-screen while it is being edited.
    expect((await railLabel(id)).textContent).toBe("pose");
    await renameRail(id, 0, "posture");
    await waitFor(() => railsOf(id)[0].declaration === "posture:  Pose ", { what: `the annotation preserved (got ${railsOf(id)[0].declaration})` });
    // And the DERIVED type is still what the wire gesture and the linter read.
    expect(portTypeOfDeclaration(railsOf(id)[0].declaration)).toBe("Pose");
  });

  it("a port with no annotation takes the typed text whole, and its id is untouched", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "aux", declaration: "aux" }]);
    await renameRail(id, 0, "auxiliary");
    await waitFor(() => railsOf(id)[0].declaration === "auxiliary", { what: `plain rename (got ${railsOf(id)[0].declaration})` });
    // The id is the wire's anchor — a rename must never move it.
    expect(railsOf(id)[0].id).toBe("aux");
  });

  it("only the port that was edited changes; its neighbour on the same rail is left alone", async () => {
    app = await mountApp();
    const id = await placeBlock([
      { id: "in", declaration: "gain_x: float" },
      { id: "aux", declaration: "aux: int" },
    ]);
    await renameRail(id, 1, "second");
    await waitFor(() => railsOf(id)[1].declaration === "second: int", { what: `the second port renamed (got ${JSON.stringify(railsOf(id))})` });
    expect(railsOf(id)[0].declaration).toBe("gain_x: float");
    expect(railsOf(id).map((port) => port.id)).toEqual(["in", "aux"]);
  });

  it("the rename does not merge into the action before it: one undo stays inside the edit and leaves the block standing", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    await renameRail(id, 0, "gain_y");
    await waitFor(() => railsOf(id)[0].declaration === "gain_y: float", { what: "the rename to land" });
    // MEASURED, 2026-09-21: without a history stopping point in
    // `onItemsChange` this single undo deleted the block outright — the
    // rename had merged into the entry that created it.
    app.editor.undo();
    expect(app.editor.getShape(id), "the block must survive an undo of its own port rename").toBeTruthy();
    expect(railsOf(id)[0].declaration).not.toBe("gain_y: float");
    // Undo granularity inside a rename is per keystroke, the same as the
    // block title's — so keep stepping back and the whole declaration,
    // annotation included, comes back with the block still on the board.
    for (let step = 0; step < 24 && railsOf(id)[0].declaration !== "gain_x: float"; step += 1) app.editor.undo();
    expect(railsOf(id)[0].declaration).toBe("gain_x: float");
  });
});
