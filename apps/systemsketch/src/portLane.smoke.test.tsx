// src/portLane.smoke.test.tsx — P-056 in REAL HEADLESS CHROMIUM: a person can
// ADD a port to a block and REMOVE one, with the multi-line port lane, on the
// real app.
//
// The premise, measured before this lane started and quoted in the backlog
// row: `grep -rn 'addPort\|removePort\|deletePort\|renamePort'` over both
// trees returned nothing. The only port mutations the board offered were
// reorder-within-a-rail and rename-in-place (P-037). A block was born with
// whatever ports its preset gave it and kept exactly those forever.
//
// RULING 11 is what decides the gesture: Zach rejected hovering the end of a
// port lane to add a port as "superseded by" the multi-line editor, so typing
// a new LINE is the add. Ruling 8 is what decides the content: a port stores
// ONE string and its type is whatever follows the `:`, so the lane's lines are
// whole declarations — which is also the only surface on the board that can
// re-type one, because the rail deliberately paints the name half alone.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

async function placeBlock(left: { id: string; declaration: string }[], x = 200): Promise<TLShapeId> {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y: 200,
    props: { name: "Detect", view: "port", w: 240, h: 200, ports: { left, right: [], top: [], bottom: [] } },
  });
  await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-dot"]`), { what: "a rail dot" });
  return id;
}

/** A block with one output dot on its right wall — the other end of a cable. */
async function placeSource(): Promise<TLShapeId> {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x: 20,
    y: 200,
    props: { name: "Source", view: "port", w: 200, h: 200, ports: { left: [], right: [{ id: "out", declaration: "out: float" }], top: [], bottom: [] } },
  });
  await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-port-id="out"] [data-slot="port-dot"]`), { what: "the source dot" });
  return id;
}

function railsOf(id: TLShapeId) {
  return (app!.editor.getShape(id) as BlockShape).props.ports.left;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(
    () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"] [data-port-id="${portId}"] [data-slot="port-dot"]`),
    { what: `${portId}'s dot` },
  );
}

/** THE GESTURE. A plain click on a port's dot — the one press `wireGesture.ts`
 *  documents as "a click on a dot is nothing", which is exactly why it was
 *  free to become this. */
async function openLane(id: TLShapeId, portId: string): Promise<HTMLElement> {
  await userEvent.click(await dotOf(id, portId));
  return waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-edge-lane"] .cm-content`), { what: "the port lane" });
}

function laneLines(id: TLShapeId): (string | null)[] {
  return Array.from(app!.root.querySelectorAll<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-edge-lane"] .cm-line`)).map((line) => line.textContent);
}

/** Put the caret at the very end of the lane's document and type a new line.
 *  `Mod-End` and not a click on the last `.cm-line`: a synthetic click carries
 *  no usable coordinates, so CodeMirror's `posAtCoords` parks the caret at the
 *  top of the document regardless of which element was clicked — the exact
 *  trap `BlockPortLane.stories.tsx` already records. */
async function appendLine(lane: HTMLElement, text: string) {
  await userEvent.click(lane);
  await userEvent.keyboard("{Control>}{End}{/Control}{Enter}");
  await userEvent.keyboard(text);
}

function wires() {
  return app!.editor.getCurrentPageShapes().filter((shape) => shape.type === WIRE_SHAPE_TYPE);
}

describe("P-056 — a person can add a port", () => {
  it("clicking a port's DOT opens the rail's lane, showing WHOLE declarations — not the name halves the rail paints", async () => {
    app = await mountApp();
    const id = await placeBlock([
      { id: "in", declaration: "gain_x: float" },
      { id: "pose", declaration: "pose:  Pose " },
    ]);
    await openLane(id, "in");
    // The rail itself still paints the name half — that ruling did not move.
    const labels = Array.from(app.root.querySelectorAll<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`)).map((l) => l.textContent);
    expect(labels).toEqual(["gain_x", "pose"]);
    // The lane shows the real thing, one line per dot, in rail order.
    expect(laneLines(id)).toEqual(["gain_x: float", "pose:  Pose "]);
  });

  it("typing a new line ADDS a port: the record grows, and a real dot appears on the rail", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    const lane = await openLane(id, "in");
    await appendLine(lane, "speed: float");

    await waitFor(() => railsOf(id).length === 2, { what: `a second port (got ${JSON.stringify(railsOf(id))})` });
    expect(railsOf(id)[1].declaration).toBe("speed: float");
    // MEASURED, and the honest answer rather than the pretty one: the id is
    // `port`, not `speed`. The port is minted the instant Enter makes the
    // line — while that line is still EMPTY, so it declares no name to mint
    // from — and an id is never re-derived afterwards, because it is what a
    // cable's binding names and following a rename would move every wire on
    // the block. A line that arrives whole (a paste, an import, a backend
    // projection) does get its name; that path is covered in
    // `@trunk/scene/portList.test.ts`. What matters on the board is the
    // DECLARATION, which is exactly what was typed.
    expect(railsOf(id)[1].id).toBe("port");
    // ONE port added, not one per keystroke: the store has to round-trip
    // through the lane between characters or every letter mints again.
    expect(railsOf(id).map((port) => port.id)).toEqual(["in", "port"]);
    // And it is a REAL dot, sighted by the same measurement pass every other
    // dot goes through — not just a record.
    await dotOf(id, "port");
    // Ruling 8's payoff: the type came in with the line, from after the `:`.
    expect(portTypeOfDeclaration(railsOf(id)[1].declaration)).toBe("float");
  });

  it("a second port typed with the SAME name gets its own id — a cable can never be ambiguous", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    const lane = await openLane(id, "in");
    await appendLine(lane, "gain_x: int");
    await waitFor(() => railsOf(id).length === 2, { what: "a second port" });
    // Two ports now DECLARE the same name; their ids are still distinct, which
    // is the property a cable depends on.
    expect(railsOf(id).map((port) => port.declaration)).toEqual(["gain_x: float", "gain_x: int"]);
    expect(new Set(railsOf(id).map((port) => port.id)).size).toBe(2);
  });

  it("re-typing an existing line RE-DECLARES that port and keeps its id — the rail can never offer this", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    const lane = await openLane(id, "in");
    await userEvent.click(lane);
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("gain_x: int");
    await waitFor(() => railsOf(id)[0].declaration === "gain_x: int", { what: `the retype to land (got ${railsOf(id)[0].declaration})` });
    expect(railsOf(id)[0].id).toBe("in");
    expect(railsOf(id)).toHaveLength(1);
  });
});

describe("P-056 — a person can remove a port, and the cable goes with it", () => {
  it("deleting a line removes that port and leaves the others alone", async () => {
    app = await mountApp();
    const id = await placeBlock([
      { id: "in", declaration: "gain_x: float" },
      { id: "aux", declaration: "aux" },
    ]);
    const lane = await openLane(id, "in");
    // Select the LAST line and take it away, newline and all.
    await userEvent.click(lane);
    await userEvent.keyboard("{Control>}{End}{/Control}");
    await userEvent.keyboard("{Shift>}{Home}{/Shift}{Backspace}{Backspace}");
    await waitFor(() => railsOf(id).length === 1, { what: `one port left (got ${JSON.stringify(railsOf(id))})` });
    expect(railsOf(id)[0]).toEqual({ id: "in", declaration: "gain_x: float" });
    expect(app.root.querySelector(`[data-shape-id="${id}"] [data-port-id="aux"]`)).toBeNull();
  });

  it("THE INTERESTING CASE: removing a wired port deletes the cable, and ONE undo brings both back", async () => {
    app = await mountApp();
    const source = await placeSource();
    const sink = await placeBlock(
      [
        { id: "in", declaration: "in: float" },
        { id: "aux", declaration: "aux: float" },
      ],
      420,
    );
    await userEvent.dragAndDrop(await dotOf(source, "out"), await dotOf(sink, "aux"));
    const wire = await waitFor(() => wires()[0], { what: "a cable" });
    expect(app.editor.getBindingsToShape(sink, WIRE_BINDING_TYPE)).toHaveLength(1);

    // Now delete the wired port's line.
    const lane = await openLane(sink, "in");
    await userEvent.click(lane);
    await userEvent.keyboard("{Control>}{End}{/Control}");
    await userEvent.keyboard("{Shift>}{Home}{/Shift}{Backspace}{Backspace}");
    await waitFor(() => railsOf(sink).length === 1, { what: `the wired port gone (got ${JSON.stringify(railsOf(sink))})` });

    // The cable is GONE, not dangling: a wire whose end names a port the block
    // no longer owns is a record that paints nothing and that a re-minted id
    // could silently re-attach. See `deleteCablesAtPorts` for the full WHY.
    await waitFor(() => wires().length === 0, { what: "the cable deleted with its port" });
    expect(app.editor.getShape(wire.id)).toBeUndefined();

    // ONE transaction, so one Ctrl+Z restores the port AND its cable together.
    app.editor.undo();
    await waitFor(() => railsOf(sink).length === 2, { what: `the port back (got ${JSON.stringify(railsOf(sink))})` });
    expect(railsOf(sink).map((port) => port.id)).toEqual(["in", "aux"]);
    expect(wires()).toHaveLength(1);
  });
});

describe("P-056 — the lane does not take a gesture the board had already spent", () => {
  it("P-037's double-click rename on a rail LABEL still opens that port's own single-line editor", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    const label = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "a rail label" });
    await userEvent.dblClick(label);
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="true"]`), { what: "the rail label editing" });
    // And it really is the single-line editor, not the rail-wide lane.
    expect(app.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-edge-lane"]`)).toBeNull();
  });

  it("a press-DRAG from a dot still makes a cable — the click trigger never eats the wire gesture", async () => {
    app = await mountApp();
    const source = await placeSource();
    const sink = await placeBlock([{ id: "in", declaration: "in: float" }], 420);
    await userEvent.dragAndDrop(await dotOf(source, "out"), await dotOf(sink, "in"));
    await waitFor(() => wires().length === 1, { what: "the cable" });
    expect(app.root.querySelector('[data-slot="port-edge-lane"]')).toBeNull();
  });

  it("clicking the SAME dot again closes the lane — the only exit a pointer alone can reach", async () => {
    app = await mountApp();
    const id = await placeBlock([{ id: "in", declaration: "gain_x: float" }]);
    await openLane(id, "in");
    await userEvent.click(await dotOf(id, "in"));
    await waitFor(() => app!.root.querySelector('[data-slot="port-edge-lane"]') === null, { what: "the lane closed" });
    expect(railsOf(id)[0].declaration).toBe("gain_x: float");
  });
});
