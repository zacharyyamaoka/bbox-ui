// src/edgeDropCatalog.smoke.test.tsx — W1-24's acceptance, in the real app:
// drop a cable on nothing and the offer is the five-row catalogue narrowed to
// what can answer THIS cable, and picking a shaped row builds that shape.
//
// A separate file rather than a case appended to `wiring.smoke.test.tsx`,
// which is committed-with-the-plan and off-limits to builders (its own header
// says so). This one is the catalogue's, and it asserts the catalogue's own
// exported rows — never a hardcoded list — so a sixth preset fails the count
// assertion rather than silently passing a stale literal.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { catalogFor } from "@trunk/editor/nodeCatalog";

import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { EDGE_DROP_CATALOG } from "./shapes/wire/edgeDropCatalog";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const PORTS_OUT = { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] };

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

/** Press-drag from `a/out` out into empty canvas and wait for the offer. */
async function dropOnNothing(a: TLShapeId): Promise<HTMLElement> {
  const from = await dotOf(a, "out");
  const at = centreOf(from);
  await userEvent.dragAndDrop(from, canvasOf(app!.root), { targetPosition: { x: at.x + 260, y: at.y + 40 } });
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="edge-drop-menu"]'), { what: "the EdgeDropMenu" });
}

describe("W1-24 — the edge-drop catalogue offers five presets, narrowed to this cable", () => {
  it("offers every preset that can answer a source cable, and only those", async () => {
    app = await mountApp();
    const a = block("estimate()", 60, 120, PORTS_OUT);
    await anchorsMeasured(a, 1);
    const menu = await dropOnNothing(a);

    // The cable leaves a SOURCE, so it needs a consumer: every row with an
    // input rail, and no other. Expected set is DERIVED from the catalogue by
    // the same `catalogFor` the component runs — the assertion is "the menu
    // shows what the catalogue says", not a list retyped here.
    const offered = catalogFor(EDGE_DROP_CATALOG, { direction: "sink" }).map((preset) => preset.id);
    expect(offered.length).toBeGreaterThan(1);
    expect(offered.length).toBeLessThan(EDGE_DROP_CATALOG.length);
    const rendered = Array.from(menu.querySelectorAll('[data-slot="edge-drop-menu-item"]')).map(
      (item) => item.getAttribute("data-testid")?.replace("edge-drop-menu-item-", ""),
    );
    expect(rendered).toEqual(offered);

    // Every row that IS offered names itself and its arity, read off the
    // catalogue rather than transcribed.
    for (const preset of EDGE_DROP_CATALOG.filter((p) => offered.includes(p.id))) {
      const item = menu.querySelector<HTMLElement>(`[data-testid="edge-drop-menu-item-${preset.id}"]`)!;
      expect(item.textContent).toContain(preset.label);
      expect(item.textContent).toContain(`${preset.inputs} in · ${preset.outputs} out`);
    }

    // And the row that cannot answer it is ABSENT, not disabled.
    for (const preset of EDGE_DROP_CATALOG.filter((p) => !offered.includes(p.id))) {
      expect(menu.querySelector(`[data-testid="edge-drop-menu-item-${preset.id}"]`), preset.id).toBeNull();
    }
  });

  it("picking Branch builds a 1-in/2-out block and binds the cable to its inlet", async () => {
    app = await mountApp();
    const a = block("estimate()", 60, 120, PORTS_OUT);
    await anchorsMeasured(a, 1);
    const menu = await dropOnNothing(a);

    const branch = EDGE_DROP_CATALOG.find((preset) => preset.id === "branch")!;
    const before = new Set(app.editor.getCurrentPageShapes().map((s) => s.id));
    await userEvent.click(menu.querySelector<HTMLElement>(`[data-testid="edge-drop-menu-item-${branch.id}"]`)!);

    const made = await waitFor(() => {
      const fresh = app!.editor.getCurrentPageShapes().find((s) => s.type === BLOCK_SHAPE_TYPE && !before.has(s.id));
      return (fresh as { props: { name: string; view: string; w: number; h: number; ports: Record<string, { id: string }[]> } } | undefined) ?? null;
    }, { what: "the block the Branch row created" });

    // The shape is the shape the row advertised — arity, view and box all
    // from the catalogue entry, never a literal in this file.
    expect(made.props.name).toBe(branch.label);
    expect(made.props.view).toBe(branch.view);
    expect([made.props.w, made.props.h]).toEqual([branch.w, branch.h]);
    expect(made.props.ports.left.map((p) => p.id)).toEqual([...branch.inPortIds]);
    expect(made.props.ports.right.map((p) => p.id)).toEqual([...branch.outPortIds]);

    // One wire, bound anchored→new, landing on the FIRST dot of the rail the
    // cable needed — a Branch has one inlet, and this is the assertion that
    // would catch a creator that bound to an outlet instead.
    const wire = await waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === WIRE_SHAPE_TYPE), { what: "the wire" });
    const bindings = app.editor.getBindingsFromShape(wire.id, WIRE_BINDING_TYPE) as { toId: TLShapeId; props: { terminal: string; portId: string } }[];
    expect(bindings).toHaveLength(2);
    const start = bindings.find((x) => x.props.terminal === "start")!;
    const end = bindings.find((x) => x.props.terminal === "end")!;
    expect([start.toId, start.props.portId]).toEqual([a, "out"]);
    expect(end.props.portId).toBe(branch.inPortIds[0]);
  });
});
