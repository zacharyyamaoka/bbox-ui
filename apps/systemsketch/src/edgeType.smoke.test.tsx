// src/edgeType.smoke.test.tsx — P-008's acceptance: the edge type is settable
// FROM THE APP.
//
// The backlog's proof of the gap was that `ss-wire.routing` is a real prop
// with four legal values and a default of `elbow`, and that
// `grep -rn "routing" apps/systemsketch/src/chrome/` found two comment lines
// and nothing that writes one — "today it is settable only by hand-editing
// the saved file". So every case below reaches the control the way a person
// does: select a cable on the canvas, press the trigger in the selection
// pill, press an option. Nothing here calls `updateShape` to set a routing.
//
// And a routing that changed only in the record would be the exact failure
// this wave exists to correct, so the first case also reads the PAINTED path
// back and requires its shape to have changed.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const PORTS_OUT = { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] };
const PORTS_IN = { left: [{ id: "in", declaration: "in: Pose" }, { id: "alt", declaration: "alt: Pose" }], right: [], top: [], bottom: [] };

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

async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length === count ? true : null), { what: `${count} anchors on ${id}` });
}

function wires(): TLShapeId[] {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).map((s) => s.id);
}

function routingOf(id: TLShapeId): string {
  return (app!.editor.getShape(id) as { props: { routing: string } }).props.routing;
}

function paintedD(id: TLShapeId): string {
  return app!.root.querySelector<SVGPathElement>(`[data-shape-id="${id}"] [data-slot="trace-line"]`)?.getAttribute("d") ?? "";
}

/** The pill portals its popover outside the app root, so every query here is
 *  against the document. */
function pill<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** Drag `count` cables out of one source block into one sink block. */
async function boardWithWires(count: 1 | 2): Promise<TLShapeId[]> {
  const a = block("estimate()", 60, 140, PORTS_OUT);
  const b = block("encode()", 460, 160, PORTS_IN);
  await anchorsMeasured(a, 1);
  await anchorsMeasured(b, 2);
  await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
  await waitFor(() => (wires().length === 1 ? true : null), { what: "the first cable" });
  if (count === 2) {
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "alt"));
    await waitFor(() => (wires().length === 2 ? true : null), { what: "the second cable" });
  }
  return wires();
}

/** Press a point on the painted cable — which is a real selection gesture
 *  only because P-003 gave the cable a grab corridor. */
async function selectByPressingTheCable(wire: TLShapeId) {
  const path = await waitFor(() => {
    const found = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`);
    return found && found.getTotalLength() > 0 ? found : null;
  }, { what: "the painted cable" });
  const svg = path.ownerSVGElement!;
  const point = svg.createSVGPoint();
  const local = path.getPointAtLength(path.getTotalLength() / 2);
  point.x = local.x;
  point.y = local.y;
  const screen = point.matrixTransform(svg.getScreenCTM()!);
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error("nothing under the cable's midpoint");
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
  await waitFor(() => (app!.editor.getSelectedShapeIds().includes(wire) ? true : null), { what: "the cable selected by pressing it" });
}

async function openRoutingMenu() {
  const trigger = await waitFor(() => pill<HTMLElement>('[data-testid="ss-edge-routing"]'), { what: "the edge-type trigger in the pill" });
  await userEvent.click(trigger);
  await waitFor(() => pill('[data-testid="ss-edge-routing-panel"]'), { what: "the edge-type panel" });
}

async function pickRouting(routing: string) {
  const option = await waitFor(() => pill<HTMLElement>(`[data-testid="ss-edge-routing-${routing}"]`), { what: `the ${routing} option` });
  await userEvent.click(option);
}

describe("P-008 — the edge type is settable from the app", () => {
  it("press the cable, press Straight: the record AND the paint change", async () => {
    app = await mountApp();
    const [wire] = await boardWithWires(1);
    await waitFor(() => (paintedD(wire) ? true : null), { what: "a painted cable" });
    const before = paintedD(wire);
    expect(routingOf(wire), "elbow is the board's datum").toBe("elbow");

    await selectByPressingTheCable(wire);
    await openRoutingMenu();
    await pickRouting("straight");

    await waitFor(() => (routingOf(wire) === "straight" ? true : null), { what: "the record to take the new routing" });
    // The paint has to have MOVED. A control that changed a prop and left the
    // board alone is the failure this wave exists to correct.
    const after = await waitFor(() => {
      const d = paintedD(wire);
      return d && d !== before ? d : null;
    }, { what: "the painted cable to be re-routed" });
    // A straight route is one chord: a single `L`, and none of the elbow
    // route's corner arcs.
    expect(after).toMatch(/^M[^A-Za-z]*L[^A-Za-z]*$/);
    expect(before, "the elbow route it replaced had corners").not.toMatch(/^M[^A-Za-z]*L[^A-Za-z]*$/);
  });

  it("the S-curve option is the default bezier — `curved`", async () => {
    app = await mountApp();
    const [wire] = await boardWithWires(1);
    await selectByPressingTheCable(wire);
    await openRoutingMenu();
    const option = await waitFor(() => pill<HTMLElement>('[data-testid="ss-edge-routing-curved"]'), { what: "the S-curve option" });
    expect(option.getAttribute("aria-label"), "the ask's own word for this routing").toBe("S-curve");
    await userEvent.click(option);
    await waitFor(() => (routingOf(wire) === "curved" ? true : null), { what: "the curved routing" });
    // A single cubic, which is what `defaultCurvedPath` writes.
    await waitFor(() => (/^M[^A-Za-z]*C[^A-Za-z]*$/.test(paintedD(wire)) ? true : null), { what: "a painted cubic" });
  });

  it("a bundle re-routes in one press and undoes in one step", async () => {
    app = await mountApp();
    const both = await boardWithWires(2);
    expect(both).toHaveLength(2);
    // WHY this one selection is made with `select` rather than by pressing:
    // the two cables leave the SAME dot, so their routes overlap near it and a
    // press picks whichever sorts on top — a real ambiguity about which cable
    // you grabbed, and nothing to do with the control under test. Pressing the
    // cable is proved by the two cases above; the user action THIS case is
    // about is the press on the pill.
    app.editor.select(...both);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "both cables selected" });

    await openRoutingMenu();
    await pickRouting("slanted");
    await waitFor(() => (both.every((id) => routingOf(id) === "slanted") ? true : null), { what: "both cables re-routed" });

    app.editor.undo();
    await waitFor(() => (both.every((id) => routingOf(id) === "elbow") ? true : null), { what: "ONE undo to put both back" });
  });

  it("the row is absent when no cable is selected, and scoped to the cables when the selection is mixed", async () => {
    app = await mountApp();
    const [wire] = await boardWithWires(1);
    const blocks = app.editor.getCurrentPageShapes().filter((s) => s.type === BLOCK_SHAPE_TYPE).map((s) => s.id);

    app.editor.select(...blocks);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === blocks.length ? true : null), { what: "the blocks selected" });
    // Give the pill a chance to render the row it must not render.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(pill('[data-testid="ss-edge-routing"]'), "no cable selected, no edge-type row").toBeNull();

    const widthsBefore = blocks.map((id) => JSON.stringify((app!.editor.getShape(id) as unknown as { props: Record<string, unknown> }).props));
    app.editor.select(...blocks, wire);
    await openRoutingMenu();
    await pickRouting("curved");
    await waitFor(() => (routingOf(wire) === "curved" ? true : null), { what: "the cable in a mixed selection re-routed" });
    expect(blocks.map((id) => JSON.stringify((app!.editor.getShape(id) as unknown as { props: Record<string, unknown> }).props)), "the blocks must be untouched").toEqual(widthsBefore);
  });
});
