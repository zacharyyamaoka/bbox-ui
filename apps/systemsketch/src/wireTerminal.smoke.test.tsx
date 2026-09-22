// src/wireTerminal.smoke.test.tsx — P-053's acceptance: a cable's END is
// draggable, and dropping it on another port MOVES THE BINDING.
//
// Same machinery as P-028's bend handles and driven the same way, because
// that is the item ("this is the same machinery for the two ENDS"):
//
//   - the handle's position comes from `editor.getShapeHandles`, the call
//     tldraw's own `ShapeHandleOverlayUtil` makes to decide where to paint a
//     grab circle — so the drag starts where a user would see one;
//   - the drag is a real Playwright pointer drag on the canvas, so it goes
//     through `select.idle` -> `pointing_handle` -> `dragging_handle` exactly
//     as a mouse does;
//   - the result is read off the BINDING RECORDS and off the painted
//     `<path d=…>`, never off the props alone.
//
// THE CASE THE ITEM EXISTS FOR is the third describe: "the drop must be
// judged by the SAME validator a fresh cable is judged by… a re-pointed cable
// that lands somewhere a new cable could not is a bug." It is written as a
// DIFFERENTIAL over the validation level AND as a comparison against a real
// fresh cable drawn at that same level, because either half alone is weak —
// a re-point that is refused everywhere would pass a level differential, and
// a re-point that is allowed everywhere would pass a fresh-cable comparison
// at `guided`.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { EDGE_POLICY_STORAGE_KEY } from "@trunk/editor/edgePolicy";
import type { ValidationLevelId } from "@trunk/scene/validationLevel";

import { resetValidationLevelCache } from "./chrome/ShareMenu/validationLevelHost";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import type { WireBinding } from "./shapes/wire";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";
import { clickRow, openBurger } from "./testing/menus";

let app: MountedApp | null = null;

// The level is a MODULE store (validationLevelHost.ts), so it outlives a React
// unmount — both the stored bytes and the cache have to go between cases or
// the second mount is judged against the first one's choice.
beforeEach(() => {
  window.localStorage.removeItem(EDGE_POLICY_STORAGE_KEY);
  resetValidationLevelCache();
});

afterEach(() => {
  app?.unmount();
  app = null;
  window.localStorage.removeItem(EDGE_POLICY_STORAGE_KEY);
  resetValidationLevelCache();
});

const outPort = (type: string) => ({ left: [], right: [{ id: "out", declaration: `out: ${type}` }], top: [], bottom: [] });
const inPort = (type: string) => ({ left: [{ id: "in", declaration: `in: ${type}` }], right: [], top: [], bottom: [] });

function block(name: string, x: number, y: number, ports: unknown): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports } } as never);
  return id;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(() => {
    const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
    return wrap?.querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`) ?? null;
  }, { what: `${id}/${portId} dot` });
}

/** The dots have to be MEASURED before a cable can leave or land on one —
 *  `portTerminal` answers null for an unmeasured anchor, by design. */
async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length === count ? true : null), {
    what: `${count} measured anchors on ${id}`,
  });
}

function wires() {
  return app!.editor.getCurrentPageShapes().filter((shape) => shape.type === WIRE_SHAPE_TYPE);
}

/** Which port each terminal of this cable is bound to, straight off the
 *  binding records — the document fact, not a repaint. */
function boundTo(wire: TLShapeId): { start?: string; end?: string } {
  const out: { start?: string; end?: string } = {};
  for (const binding of app!.editor.getBindingsFromShape<WireBinding>(wire, WIRE_BINDING_TYPE)) {
    out[binding.props.terminal] = `${binding.toId}/${binding.props.portId}`;
  }
  return out;
}

/** The handles the ENGINE says this cable has, in viewport px. */
function handlesOf(id: TLShapeId): { id: string; type: string; x: number; y: number }[] {
  const shape = app!.editor.getShape(id)!;
  return (app!.editor.getShapeHandles(shape) ?? []).map((handle) => {
    const screen = app!.editor.pageToScreen({ x: handle.x, y: handle.y });
    return { id: handle.id, type: handle.type, x: screen.x, y: screen.y };
  });
}

function terminalHandle(wire: TLShapeId, terminal: "start" | "end") {
  const found = handlesOf(wire).find((handle) => handle.id === `terminal:${terminal}`);
  if (!found) throw new Error(`no terminal:${terminal} handle — got ${handlesOf(wire).map((h) => h.id).join(", ")}`);
  return found;
}

/** Canvas-relative coordinates, which is what Playwright's drag options take. */
function onCanvas(point: { x: number; y: number }): { x: number; y: number } {
  const rect = canvasOf(app!.root).getBoundingClientRect();
  return { x: point.x - rect.left, y: point.y - rect.top };
}

/** Drag a terminal handle onto a point, through the real select tool. */
async function dragTerminalTo(wire: TLShapeId, terminal: "start" | "end", to: { x: number; y: number }) {
  const canvas = canvasOf(app!.root);
  await userEvent.dragAndDrop(canvas, canvas, {
    sourcePosition: onCanvas(terminalHandle(wire, terminal)),
    targetPosition: onCanvas(to),
  });
}

async function pathOf(wire: TLShapeId): Promise<SVGPathElement> {
  return waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`), { what: "the painted trace" });
}

/** How close the painted cable comes to `at`, in viewport px — the INK, so
 *  "the cable moved" means the drawing moved and not that a number changed. */
function inkDistanceTo(path: SVGPathElement, at: { x: number; y: number }): number {
  const svg = path.ownerSVGElement!;
  const matrix = svg.getScreenCTM()!;
  const total = path.getTotalLength();
  let best = Infinity;
  for (let step = 0; step <= 96; step++) {
    const local = path.getPointAtLength((total * step) / 96);
    const point = svg.createSVGPoint();
    point.x = local.x;
    point.y = local.y;
    const screen = point.matrixTransform(matrix);
    best = Math.min(best, Math.hypot(screen.x - at.x, screen.y - at.y));
  }
  return best;
}

const settingsView = () => document.querySelector<HTMLElement>('[data-testid="ss-settings"][data-slot="settings-view"]');

/** Choose a level the way a person does — burger ▸ Settings ▸ Connections ▸
 *  the rung ▸ Escape. The same five presses `src/validationLevel.smoke.test.tsx`
 *  drives; restated rather than shared, because importing another smoke test's
 *  helper pulls its module graph in too. */
async function chooseLevel(level: ValidationLevelId): Promise<void> {
  await clickRow(await openBurger(app!), "Settings");
  const view = await waitFor(() => settingsView(), { what: "the Settings surface" });
  await userEvent.click(
    await waitFor(
      () => Array.from(view.querySelectorAll<HTMLElement>('[data-slot="settings-nav"] button')).find((button) => /Connections/.test(button.textContent ?? "")) ?? null,
      { what: "the Connections category" },
    ),
  );
  await userEvent.click(
    await waitFor(() => settingsView()?.querySelector<HTMLElement>(`[data-slot="edge-policy-preset"][data-preset-id="${level}"]`) ?? null, { what: `the ${level} rung` }),
  );
  await waitFor(
    () => (settingsView()?.querySelector(`[data-slot="edge-policy-preset"][data-preset-id="${level}"]`)?.getAttribute("aria-pressed") === "true" ? true : null),
    { what: `${level} reads as the chosen rung` },
  );
  await userEvent.keyboard("{Escape}");
  await waitFor(() => !settingsView(), { what: "Settings closed" });
}

interface Board {
  source: TLShapeId;
  sink: TLShapeId;
  other: TLShapeId;
  wire: TLShapeId;
}

/**
 * Three blocks and one cable, drawn by the REAL press-drag gesture — so the
 * cable this suite re-points is a cable a person made, not one a constructor
 * minted.
 *
 * `other`'s port takes a DIFFERENT datatype on purpose: it is the same
 * landing for both halves of the judge differential, which is what lets the
 * two cases differ by nothing but the chosen level.
 */
async function board(otherType = "int"): Promise<Board> {
  // The two wired blocks sit on DIFFERENT rows on purpose: a straight
  // left-to-right run collapses the elbow to one segment with nothing
  // pinnable on it, and the first case below would then be measuring the
  // degenerate route (`src/wireRoute.smoke.test.tsx` places its pair the same
  // way, for the same reason).
  const source = block("estimate()", 120, 120, outPort("Pose"));
  const sink = block("encode()", 680, 340, inPort("Pose"));
  const other = block("count()", 680, 640, inPort(otherType));
  await anchorsMeasured(source, 1);
  await anchorsMeasured(sink, 1);
  await anchorsMeasured(other, 1);
  await userEvent.dragAndDrop(await dotOf(source, "out"), await dotOf(sink, "in"));
  const wire = await waitFor(() => wires()[0], { what: "an ss-wire" });
  app!.editor.select(wire.id);
  return { source, sink, other, wire: wire.id };
}

describe("P-053 — a cable's ends are handles", () => {
  it("a selected cable offers a grab handle at each END, on the route's own ends", async () => {
    app = await mountApp();
    const { wire } = await board();

    const handles = handlesOf(wire);
    const terminals = handles.filter((handle) => handle.id.startsWith("terminal:"));
    expect(terminals.map((handle) => handle.id).sort()).toEqual(["terminal:end", "terminal:start"]);
    // `vertex`, not `virtual`: a virtual handle means "the engine owns this
    // point and you are proposing one", which is true of an unpinned corner
    // and false of an endpoint.
    expect(terminals.every((handle) => handle.type === "vertex")).toBe(true);
    // P-028's pin handles are still there beside them — this extends that
    // system rather than replacing it.
    expect(handles.some((handle) => handle.id.startsWith("pin:"))).toBe(true);

    // The handles sit ON the painted cable, at its two ends. Measured off the
    // ink rather than recomputed from the route, so a handle published at a
    // point the cable does not reach fails here.
    const path = await pathOf(wire);
    for (const terminal of terminals) expect(inkDistanceTo(path, terminal), terminal.id).toBeLessThan(4);
  });

  it("a cable with no elbow still has its two ends", async () => {
    app = await mountApp();
    const { wire } = await board();
    app.editor.updateShape({ id: wire, type: WIRE_SHAPE_TYPE, props: { routing: "straight" } } as never);
    await waitFor(() => (handlesOf(wire).length > 0 ? true : null), { what: "handles on a straight cable" });
    // The PINS are gone — `pins` is read by the elbow router alone, so a pin
    // handle here would move a number that changes nothing on screen.
    expect(handlesOf(wire).map((handle) => handle.id).sort()).toEqual(["terminal:end", "terminal:start"]);
  });
});

describe("P-053 — dropping an end on another port moves the binding", () => {
  it("the end lands on the other block's dot, the binding follows, and so does the ink", async () => {
    app = await mountApp();
    const { sink, other, wire } = await board();
    expect(boundTo(wire).end).toBe(`${sink}/in`);

    const landing = centreOf(await dotOf(other, "in"));
    // The premise: the cable does NOT reach the new dot before the drag, so
    // the ink assertion afterwards cannot pass vacuously.
    expect(inkDistanceTo(await pathOf(wire), landing)).toBeGreaterThan(40);

    await dragTerminalTo(wire, "end", landing);

    await waitFor(() => (boundTo(wire).end === `${other}/in` ? true : null), {
      what: `the end binding to move to ${other}/in (it reads ${JSON.stringify(boundTo(wire))})`,
    });
    // The OTHER end did not move, and there is still exactly one cable — a
    // re-point is not a new cable plus an orphan.
    expect(boundTo(wire).start).toBeTruthy();
    expect(wires()).toHaveLength(1);
    // And the drawing followed. `WIRE_TERMINAL_GAP` is 8px, so the ink stops
    // just short of the dot centre by design.
    await waitFor(() => (inkDistanceTo(app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`)!, landing) < 14 ? true : null), {
      what: "the painted cable to reach the new dot",
    });
  });

  it("the whole re-point is ONE undo step — P-014 on the newest gesture", async () => {
    app = await mountApp();
    const { sink, other, wire } = await board();
    await dragTerminalTo(wire, "end", centreOf(await dotOf(other, "in")));
    await waitFor(() => (boundTo(wire).end === `${other}/in` ? true : null), { what: "the re-point to land" });

    // `DraggingHandle` opens one `markHistoryStoppingPoint('dragging handle')`
    // for the gesture, so the unbind, every intermediate move and the rebind
    // collapse to a single entry.
    app.editor.undo();
    await waitFor(() => (boundTo(wire).end === `${sink}/in` ? true : null), {
      what: `one Ctrl+Z to put the cable back (it reads ${JSON.stringify(boundTo(wire))})`,
    });
    expect(wires(), "the cable itself must survive the undo").toHaveLength(1);
  });

  it("a drop on empty canvas snaps back — a cable with one end is not a document fact", async () => {
    app = await mountApp();
    const { sink, wire } = await board();
    await dragTerminalTo(wire, "end", { x: 1100, y: 760 });

    // Both bindings still there, still the same two ports. The failure this
    // guards is a HALF-BOUND wire, which `sceneFromRecords` omits outright —
    // a cable painted on the board that no consumer can read.
    await waitFor(() => (boundTo(wire).end === `${sink}/in` ? true : null), {
      what: `the end to snap back (it reads ${JSON.stringify(boundTo(wire))})`,
    });
    expect(boundTo(wire).start).toBeTruthy();
    expect(wires()).toHaveLength(1);
  });
});

describe("P-053 — the drop is judged by the SAME validator a fresh cable is", () => {
  it("at `guided` the level withholds types, so a Pose end may be re-pointed at an int port", async () => {
    app = await mountApp();
    const { other, wire } = await board("int");
    await dragTerminalTo(wire, "end", centreOf(await dotOf(other, "in")));
    await waitFor(() => (boundTo(wire).end === `${other}/in` ? true : null), {
      what: `guided to allow the mismatch (it reads ${JSON.stringify(boundTo(wire))})`,
    });
  });

  it("at `typed` the identical drag is REFUSED and the end snaps back — and a FRESH cable to that same port is refused too", async () => {
    app = await mountApp();
    const { source, sink, other, wire } = await board("int");
    await chooseLevel("typed");
    app.editor.select(wire);

    await dragTerminalTo(wire, "end", centreOf(await dotOf(other, "in")));
    // Nothing to wait FOR — a refusal is the absence of a change — so the
    // assertion is made after a real frame has been given to the drop.
    await waitFor(() => (app!.editor.getShape(wire) ? true : null), { what: "the cable still on the board" });
    expect(boundTo(wire).end, "a re-point must not land where a new cable could not").toBe(`${sink}/in`);
    expect(wires()).toHaveLength(1);

    // THE IDENTITY CLAIM, measured rather than read off the source: at this
    // same level, a brand-new cable drawn to that same port is refused as
    // well. If this half ever goes green while the half above is red, the
    // re-point is running a second, stricter rule of its own.
    await userEvent.dragAndDrop(await dotOf(source, "out"), await dotOf(other, "in"));
    await waitFor(() => (app!.editor.getShape(wire) ? true : null), { what: "a frame after the create drag" });
    expect(wires(), "a fresh Pose -> int cable is refused at `typed` too").toHaveLength(1);
  });
});
