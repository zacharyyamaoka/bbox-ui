// src/definitionBoundary.smoke.test.tsx — the closure-under-composition
// boundary, measured: WIRING A COPY MUST NEVER REACH INSIDE THE ORIGINAL.
//
// Zach, 2026-09-21, looking at a board built from pyblocks' own
// `a07_default_mutable_argument_state` golden — `remember()` expanded at the
// top showing its body, a second `remember()` sitting collapsed below it
// inside `run()`:
//
//   "BUG when I wire a copy of the function, it affects the expanded
//    function above… HUGE BUG the external wiring should never affect the
//    expanded view"
//
// The fixture below is that board in this app's own vocabulary: an EXPANDED
// `ss-block` standing for the definition, its body drawn as member blocks
// (`history.append()`, the `history#2` state pill) with four internal cables,
// a DUPLICATE of the whole thing standing for the occurrence, and a free
// `first_label` block to wire from. The port ids, names and edges are
// pyblocks' own, read off
// `python3 -m pyblocks analyze --view function:remember@4:0` on that golden.
//
// WHY the interior cables are built with `createWire` while the ACTION under
// test is a real press-drag: that is how they get onto the real board.
// `Open Python file…` lands a whole scene through `document/applySceneDiff.ts`,
// which calls `createWire` directly — the gesture's judge never sees those
// cables. And it cannot: measured here 2026-09-21, the press-drag refuses a
// cable from an expanded block's own boundary port to a member inside it with
// `no-shared-scope` at the shipped `guided` level, although that is exactly
// `scene/boundary.ts`'s `port-inner` case. Building the fixture through the
// gesture would therefore have tested a board nobody can have.
//
// WHY the assertion is a FINGERPRINT of the definition's whole interior and
// not "the edge count did not change": all three things Zach reported — a
// `mut` pill that vanished, one that moved with its cable looping back on
// itself, and a new vertical cable appearing — leave the edge COUNT free to
// stay the same. The fingerprint carries every interior wire's id, its two
// bindings, its painted props AND its drawn route in screen px, plus each
// node's own record and child list. Anything that reaches inside moves one.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { applyScene } from "./document/applySceneDiff";
import { sceneFromRecords } from "./document/sceneFromStore";
import { createWire } from "./shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

type Rail = { id: string; declaration: string }[];
type Ports = { left: Rail; right: Rail; top: never[]; bottom: never[] };

const ports = (left: [string, string][], right: [string, string][]): Ports => ({
  left: left.map(([id, declaration]) => ({ id, declaration })),
  right: right.map(([id, declaration]) => ({ id, declaration })),
  top: [],
  bottom: [],
});

function makeBlock(name: string, x: number, y: number, props: Record<string, unknown>): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ...props } } as never);
  return id;
}

async function dotOf(blockId: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(
    () => app!.root.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-port-id="${portId}"] [data-slot="port-dot"]`),
    { what: `${blockId}/${portId} dot` },
  );
}

async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length >= count ? true : null), {
    what: `${count} anchors on ${id}`,
  });
}

function wires() {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE);
}

/** The person's own gesture: a press-drag from one dot to the other. */
async function drag(from: { block: TLShapeId; port: string }, to: { block: TLShapeId; port: string }) {
  const before = wires().length;
  await userEvent.dragAndDrop(await dotOf(from.block, from.port), await dotOf(to.block, to.port));
  await waitFor(() => wires().length === before + 1, { what: `a cable ${from.port} -> ${to.port}` });
}

/* ------------------------------------------------------------------ */
/* The fixture: pyblocks' a07 `remember()`, expanded                    */
/* ------------------------------------------------------------------ */

interface Definition {
  frame: TLShapeId;
  append: TLShapeId;
  state: TLShapeId;
  /** The four interior cables, in build order. */
  cables: TLShapeId[];
}

async function buildDefinition(x: number, y: number): Promise<Definition> {
  const editor = app!.editor;
  const frame = makeBlock("remember()", x, y, {
    view: "expanded",
    w: 640,
    h: 400,
    ports: ports(
      [
        ["boundary-input-label", "label: str"],
        ["boundary-input-history", "history: list[str] = []"],
      ],
      [["boundary-output-history", "history: list[str]"]],
    ),
  });
  const append = makeBlock("history.append()", 180, 110, {
    ports: ports(
      [
        ["in-object", "object: str"],
        ["in-self", "self"],
      ],
      [["out-after", "after: list[str]"]],
    ),
  });
  const state = makeBlock("history#2", 420, 230, {
    ports: ports([["in", "in: list[str]"]], [["out", "history: list[str]"]]),
  });
  editor.reparentShapes([append, state], frame);
  await anchorsMeasured(frame, 3);
  await anchorsMeasured(append, 3);
  await anchorsMeasured(state, 2);

  const cable = (from: [TLShapeId, string], to: [TLShapeId, string], color?: string) =>
    createWire(editor, {
      from: { nodeId: from[0], portId: from[1] },
      to: { nodeId: to[0], portId: to[1] },
      ...(color ? { color } : {}),
    })!;

  const cables = [
    cable([frame, "boundary-input-label"], [append, "in-object"]),
    // The two cables the `mut` pills ride, coloured so a repaint is visible
    // in the fingerprint the same way it is on Zach's board.
    cable([frame, "boundary-input-history"], [append, "in-self"], "#d97706"),
    cable([append, "out-after"], [state, "in"], "#d97706"),
    cable([state, "out"], [frame, "boundary-output-history"]),
  ];
  await waitFor(() => (wires().length === 4 ? true : null), { what: "the definition's four interior cables" });
  return { frame, append, state, cables };
}

/* ------------------------------------------------------------------ */
/* The fingerprint                                                      */
/* ------------------------------------------------------------------ */

function pathPoints(wireId: string): string {
  const path = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wireId}"] [data-slot="trace-line"]`);
  if (!path) return "NO PATH";
  const svg = path.ownerSVGElement!;
  const ctm = svg.getScreenCTM()!;
  const total = path.getTotalLength();
  const samples: string[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const local = path.getPointAtLength((total * i) / 10);
    const point = svg.createSVGPoint();
    point.x = local.x;
    point.y = local.y;
    const screen = point.matrixTransform(ctm);
    samples.push(`${Math.round(screen.x)},${Math.round(screen.y)}`);
  }
  return `${Math.round(total)}|${samples.join(" ")}`;
}

/** Every cable with an end on one of `ids` — the interior plus the boundary,
 *  which is exactly the set Zach says must not move, and it is derived rather
 *  than listed so a cable that APPEARS inside the definition shows up too. */
function interiorWireIds(ids: readonly TLShapeId[]): string[] {
  const mine = new Set<string>(ids);
  return wires()
    .filter((wire) =>
      (app!.editor.getBindingsFromShape(wire.id, WIRE_BINDING_TYPE) as { toId: string }[]).some((binding) => mine.has(binding.toId)),
    )
    .map((wire) => String(wire.id))
    .sort();
}

function fingerprint(def: Definition): string {
  const editor = app!.editor;
  // Re-pinned first: a screen-space route is only comparable between two
  // readings taken from one viewport, and a drag near the edge can pan.
  editor.setCamera({ x: 0, y: 0, z: 1 });
  const ids: TLShapeId[] = [def.frame, def.append, def.state];
  const nodes = ids.map((id) => {
    const shape = editor.getShape(id) as { x: number; y: number; parentId: string; props: Record<string, unknown> } | undefined;
    if (!shape) return JSON.stringify({ id, gone: true });
    return JSON.stringify({
      id,
      x: shape.x,
      y: shape.y,
      parentId: String(shape.parentId),
      props: shape.props,
      children: editor.getSortedChildIdsForParent(id).map(String),
    });
  });
  const cables = interiorWireIds(ids).map((wireId) => {
    const wire = editor.getShape(wireId as TLShapeId) as unknown as { props: Record<string, unknown> };
    const bindings = (
      editor.getBindingsFromShape(wireId as TLShapeId, WIRE_BINDING_TYPE) as { toId: string; props: { terminal: string; portId: string } }[]
    )
      .map((binding) => `${binding.props.terminal}:${binding.toId}/${binding.props.portId}`)
      .sort();
    return JSON.stringify({ wireId, props: wire.props, bindings, route: pathPoints(wireId) });
  });
  return [...nodes, ...cables].join("\n");
}

/**
 * The occurrence: the whole definition duplicated — frame, members AND its
 * four cables, in one `duplicateShapes` so tldraw remaps the bindings onto
 * the copies. Copying the frame alone would leave the copy unwired and the
 * test would prove nothing about a cable's identity.
 */
function copyOf(def: Definition): Definition {
  const editor = app!.editor;
  const before = new Set(editor.getCurrentPageShapes().map((s) => String(s.id)));
  editor.duplicateShapes([def.frame, ...def.cables], { x: 0, y: 520 });
  const fresh = editor.getCurrentPageShapes().filter((s) => !before.has(String(s.id)));
  const frame = fresh.find((s) => s.type === BLOCK_SHAPE_TYPE && String(s.parentId).startsWith("page:"))!.id;
  const kids = editor.getSortedChildIdsForParent(frame);
  const named = (name: string) => kids.find((id) => (editor.getShape(id) as { props: { name?: string } }).props.name === name)!;
  return {
    frame,
    append: named("history.append()"),
    state: named("history#2"),
    cables: fresh.filter((s) => s.type === WIRE_SHAPE_TYPE).map((s) => s.id),
  };
}

/* ------------------------------------------------------------------ */

describe("the boundary holds: an occurrence's external wiring never reaches inside the definition", () => {
  it("wiring a COPY's boundary port leaves the expanded original byte-identical", async () => {
    app = await mountApp();
    const def = await buildDefinition(60, 60);
    const copy = copyOf(def);
    const source = makeBlock("first_label", 780, 620, { ports: ports([], [["out", "first_label: str"]]) });
    await anchorsMeasured(copy.frame, 3);
    await anchorsMeasured(source, 1);
    await waitFor(() => (wires().length === 8 ? true : null), { what: "the copy brought its four cables" });
    expect(copy.cables).toHaveLength(4);

    const before = fingerprint(def);

    // HIS ACTION, and the only one: `first_label` -> the COPY's `label`.
    await drag({ block: source, port: "out" }, { block: copy.frame, port: "boundary-input-label" });

    // The action really landed, on the COPY — otherwise the assertion below
    // would be "nothing happened, so nothing changed".
    const added = wires().find((wire) => !def.cables.includes(wire.id) && !copy.cables.includes(wire.id))!;
    const ends = (app.editor.getBindingsFromShape(added.id, WIRE_BINDING_TYPE) as { toId: string; props: { terminal: string; portId: string } }[])
      .map((binding) => `${binding.props.terminal}:${binding.toId}/${binding.props.portId}`)
      .sort();
    expect(ends).toEqual([`end:${copy.frame}/boundary-input-label`, `start:${source}/out`]);

    expect(fingerprint(def), "external wiring reached inside the definition").toBe(before);
  });

  it("sweeps the siblings: a move, a port rename, a port added, a member deleted and a collapse on the COPY all leave the original alone", async () => {
    app = await mountApp();
    const def = await buildDefinition(60, 60);
    const copy = copyOf(def);
    await anchorsMeasured(copy.frame, 3);
    await waitFor(() => (wires().length === 8 ? true : null), { what: "the copy brought its four cables" });
    const editor = app.editor;
    const before = fingerprint(def);
    const stillClean = (what: string) => waitFor(() => (fingerprint(def) === before ? true : null), { what });

    // 1. a node MOVE inside the copy
    editor.updateShape({ id: copy.append, type: BLOCK_SHAPE_TYPE, x: 240, y: 180 } as never);
    await stillClean("a move inside the copy left the original alone");

    // 2. a port RENAME on the copy's boundary
    const railNow = () => (editor.getShape(copy.frame) as unknown as { props: { ports: Ports } }).props.ports;
    const renamed = railNow();
    editor.updateShape({
      id: copy.frame,
      type: BLOCK_SHAPE_TYPE,
      props: { ports: { ...renamed, left: [{ ...renamed.left[0], declaration: "tag: str" }, renamed.left[1]] } },
    } as never);
    await stillClean("a port rename on the copy left the original alone");

    // 3. a port ADDED to the copy
    const grown = railNow();
    editor.updateShape({
      id: copy.frame,
      type: BLOCK_SHAPE_TYPE,
      props: { ports: { ...grown, right: [...grown.right, { id: "boundary-output-count", declaration: "count: int" }] } },
    } as never);
    await stillClean("a port added to the copy left the original alone");

    // 4. a MEMBER of the copy DELETED — its cables cascade with it
    editor.deleteShapes([copy.state]);
    await stillClean("deleting a member of the copy left the original alone");

    // 5. the copy COLLAPSED
    editor.updateShape({ id: copy.frame, type: BLOCK_SHAPE_TYPE, props: { view: "port" } } as never);
    await stillClean("collapsing the copy left the original alone");

    expect(fingerprint(def)).toBe(before);
  });

  it("the gate can fail: the same fingerprint catches a real change to the definition's own interior", async () => {
    // The mutation test for the two cases above. Without it they would pass
    // whatever happened, because a fingerprint that cannot move is not a gate.
    app = await mountApp();
    const def = await buildDefinition(60, 60);
    const before = fingerprint(def);
    app.editor.updateShape({ id: def.append, type: BLOCK_SHAPE_TYPE, x: 240, y: 190 } as never);
    await waitFor(() => (fingerprint(def) !== before ? true : null), { what: "the fingerprint noticed a real interior change" });
    expect(fingerprint(def)).not.toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* The OTHER way into the expanded view, measured while looking for the */
/* first: the board-apply seam. `Open Python file…` does not patch —    */
/* `document/applySceneDiff.ts` brings the WHOLE store to the scene it  */
/* is handed, so anything already on the board that the incoming scene  */
/* does not name is deleted. Re-opening the same file is therefore the  */
/* one action that CAN rewrite an expanded definition's interior, and   */
/* this pins exactly how far it reaches.                                */
/* ------------------------------------------------------------------ */

describe("re-applying a board reaches the expanded view — how far", () => {
  it("is idempotent for the definition's own interior, and silently drops the cable the person drew", async () => {
    app = await mountApp();
    const def = await buildDefinition(60, 60);
    const source = makeBlock("first_label", 900, 120, { ports: ports([], [["out", "first_label: str"]]) });
    await anchorsMeasured(source, 1);
    // Both top-level, so the gesture's cross-scope gate lets this one through.
    await drag({ block: source, port: "out" }, { block: def.frame, port: "boundary-input-label" });
    const drawn = wires().find((wire) => !def.cables.includes(wire.id))!;
    expect(drawn).toBeTruthy();

    // What pyblocks would hand back on a re-open of the unchanged file: the
    // board without the person's own cable on it.
    const board = sceneFromRecords(app.editor.store.allRecords());
    board.edges = board.edges.filter((edge) => edge.id !== drawn.id);
    const before = fingerprint(def);

    applyScene(app.editor, board);
    await waitFor(() => (app!.editor.getShape(drawn.id) === undefined ? true : null), { what: "the re-apply settled" });

    // The interior survives a re-open UNCHANGED — ids, bindings, paint and
    // route. That is the property a definition's body depends on, and it is
    // asserted here so a future change to `applySceneDiff` cannot quietly
    // start rebuilding bodies.
    expect(fingerprint(def)).toBe(before.replace(new RegExp(`\\{"wireId":"${drawn.id}".*\\n?`, "g"), "").trimEnd());
  });
});
