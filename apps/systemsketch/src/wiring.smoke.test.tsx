// src/wiring.smoke.test.tsx — L3's acceptance: press-drag from one block's
// dot to another's creates an ss-wire with two ss-wire-bindings; the trunk's
// Trace paints it between the REAL dots; duplicates fan; the derived scene
// sees the edge and never sees containment as an edge; moving a block moves
// the wire live; deleting a block drops its wire (stock binding cascade).
// Committed with the plan (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L3),
// off-limits to builders.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { sceneFromRecords } from "./document/sceneFromStore";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const PORTS_OUT = { left: [], right: [{ id: "out", name: "out", type: "Pose" }], top: [], bottom: [] };
const PORTS_IN = { left: [{ id: "in", name: "in", type: "Pose" }, { id: "cfg", name: "cfg", type: "" }], right: [], top: [], bottom: [] };

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

function wires() {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE);
}

function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const svg = path.ownerSVGElement!;
  const point = svg.createSVGPoint();
  const local = path.getPointAtLength(length);
  point.x = local.x;
  point.y = local.y;
  const screen = point.matrixTransform(svg.getScreenCTM()!);
  return { x: screen.x, y: screen.y };
}

describe("L3 — wires are data lines between real dots", () => {
  it("press-drag from a dot to a dot creates one wire with two bindings, painted by Trace between the dots", async () => {
    app = await mountApp();
    const a = block("estimate()", 60, 120, PORTS_OUT);
    const b = block("encode()", 420, 140, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);
    const from = await dotOf(a, "out");
    const to = await dotOf(b, "in");

    await userEvent.dragAndDrop(from, to);

    const wire = await waitFor(() => wires()[0], { what: "an ss-wire" });
    const bindings = app.editor.getBindingsFromShape(wire.id, WIRE_BINDING_TYPE) as { toId: TLShapeId; props: { terminal: string; portId: string } }[];
    expect(bindings).toHaveLength(2);
    const start = bindings.find((x) => x.props.terminal === "start")!;
    const end = bindings.find((x) => x.props.terminal === "end")!;
    expect([start.toId, start.props.portId]).toEqual([a, "out"]);
    expect([end.toId, end.props.portId]).toEqual([b, "in"]);

    // The paint is the trunk's Trace, and its endpoints are measured against the real dots
    // (the trace pulls each terminal back by its own gap along the wall normal — assert within 14px).
    const path = await waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire.id}"] [data-slot="trace-line"]`), { what: "the trace path" });
    expect(path.getTotalLength()).toBeGreaterThan(100);
    const p0 = screenPointAt(path, 0);
    const p1 = screenPointAt(path, path.getTotalLength());
    const fromAt = centreOf(from);
    const toAt = centreOf(to);
    expect(Math.hypot(p0.x - fromAt.x, p0.y - fromAt.y)).toBeLessThanOrEqual(14);
    expect(Math.hypot(p1.x - toAt.x, p1.y - toAt.y)).toBeLessThanOrEqual(14);
    // Elbow is the datum.
    expect((wire as { props: { routing: string; variant: string } }).props.routing).toBe("elbow");
    expect((wire as { props: { routing: string; variant: string } }).props.variant).toBe("data");
  });

  it("the derived scene sees the edge; a member INSIDE an expanded block is containment, never an edge", async () => {
    app = await mountApp();
    const a = block("a", 60, 120, PORTS_OUT);
    const b = block("b", 420, 140, PORTS_IN);
    const parent = block("proc", 60, 400, { left: [], right: [], top: [], bottom: [] });
    app.editor.updateShape({ id: parent, type: BLOCK_SHAPE_TYPE, props: { view: "expanded", w: 300, h: 220 } } as never);
    const kid = block("kid", 20, 60, PORTS_IN);
    app.editor.reparentShapes([kid], parent);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => wires().length === 1, { what: "one wire" });

    const scene = sceneFromRecords(app.editor.store.allRecords());
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]).toMatchObject({ source: a, sourceHandle: "out", target: b, targetHandle: "in" });
    const kidNode = scene.nodes.find((n) => n.id === kid)!;
    expect(kidNode.parentId).toBe(parent);
    expect(scene.edges.some((e) => e.source === parent || e.target === parent || e.source === kid || e.target === kid)).toBe(false);
    expect(scene.nodes.find((n) => n.id === a)?.data.ports?.right).toEqual(["out"]);
  });

  it("two wires between the same two dots fan apart (they are visibly two)", async () => {
    app = await mountApp();
    const a = block("a", 60, 120, PORTS_OUT);
    const b = block("b", 420, 140, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => wires().length === 1, { what: "first wire" });
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => wires().length === 2, { what: "second wire" });
    const paths = await waitFor(() => {
      const found = wires().map((w) => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${w.id}"] [data-slot="trace-line"]`));
      return found.every(Boolean) ? (found as SVGPathElement[]) : null;
    }, { what: "both paths" });
    const mid = (p: SVGPathElement) => screenPointAt(p, p.getTotalLength() / 2);
    const d = Math.hypot(mid(paths[0]).x - mid(paths[1]).x, mid(paths[0]).y - mid(paths[1]).y);
    expect(d).toBeGreaterThanOrEqual(8);
  });

  it("moving a bound block moves the wire live; deleting the block removes the wire", async () => {
    app = await mountApp();
    const a = block("a", 60, 120, PORTS_OUT);
    const b = block("b", 420, 140, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    const wire = await waitFor(() => wires()[0], { what: "wire" });
    const path = await waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire.id}"] [data-slot="trace-line"]`), { what: "path" });
    const endBefore = screenPointAt(path, path.getTotalLength());
    app.editor.updateShape({ id: b, type: BLOCK_SHAPE_TYPE, x: 520, y: 260 } as never);
    await waitFor(() => {
      const live = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire.id}"] [data-slot="trace-line"]`)!;
      const endAfter = screenPointAt(live, live.getTotalLength());
      return Math.hypot(endAfter.x - endBefore.x, endAfter.y - endBefore.y) > 60 ? true : null;
    }, { what: "the wire followed the block" });
    app.editor.deleteShapes([b]);
    await waitFor(() => wires().length === 0, { what: "the wire is gone with its target" });
  });

  it("a wire dropped on empty canvas does not create a dangling record and offers the edge-drop menu", async () => {
    app = await mountApp();
    const a = block("a", 60, 120, PORTS_OUT);
    await anchorsMeasured(a, 1);
    const from = await dotOf(a, "out");
    const at = centreOf(from);
    await userEvent.dragAndDrop(from, canvasOf(app.root), { targetPosition: { x: at.x + 260, y: at.y + 40 } });
    const menu = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="edge-drop-menu"]'), { what: "the EdgeDropMenu" });
    expect(menu).not.toBeNull();
    expect(wires()).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => app!.root.querySelector('[data-slot="edge-drop-menu"]') === null, { what: "menu dismissed" });
  });
});
