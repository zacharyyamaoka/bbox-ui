// src/tunnel.smoke.test.tsx — P-023's acceptance: a cable TUNNELS, from the app.
//
// The backlog's proof of the gap was `grep -rn 'tunnel' apps/systemsketch/src`
// → 0 hits, against a trunk that already carried `components/tunnel.ts`, its
// test and `TraceTunnel.stories.tsx`. So the question this file has to answer
// is not "does the math work" — the trunk's own unit test owns that — but "can
// a person reach it, and does the BOARD change when they do".
//
// Every case below reaches the feature the way a person does: select a cable,
// press the tunnel cell in the selection pill, press an option. Nothing here
// calls `updateShape` to set `tunnel` or `layer`, and every assertion is
// measured off the painted path (`getTotalLength`) or off the real hit test
// (`editor.getShapeAtPoint`), never off the prop that was just written —
// a prop that changed with no paint behind it is the failure this wave exists
// to correct.
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
  return waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length === count ? true : null), { what: `${count} anchors on ${id}` });
}

function wires(): TLShapeId[] {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).map((s) => s.id);
}

function wireProps(id: TLShapeId): { tunnel: boolean; layer: string } {
  return (app!.editor.getShape(id) as { props: { tunnel: boolean; layer: string } }).props;
}

function paintedPath(id: TLShapeId): SVGPathElement | null {
  return app!.root.querySelector<SVGPathElement>(`[data-shape-id="${id}"] [data-slot="trace-line"]`);
}

/** The DRAWN length of a cable. This is the measurement the whole feature
 *  turns on: a tunnelled cable paints two short stubs instead of one long run,
 *  so `getTotalLength()` COLLAPSES. A DOM-presence assertion could not tell
 *  the two apart — the `<path>` is there either way. */
function paintedLength(id: TLShapeId): number {
  return paintedPath(id)?.getTotalLength() ?? 0;
}

function viaCount(id: TLShapeId): number {
  return app!.root.querySelectorAll(`[data-shape-id="${id}"] [data-slot="trace-vias"] circle`).length;
}

/** Page point at the cable's own midpoint — the stretch a tunnel hides. */
function middleOfRoute(id: TLShapeId): { x: number; y: number } {
  const geometry = app!.editor.getShapeGeometry(app!.editor.getShape(id)!);
  const vertices = geometry.vertices;
  const mid = vertices[Math.floor(vertices.length / 2)];
  return app!.editor.getShapePageTransform(id)!.applyToPoint(mid);
}

async function boardWithWires(count: 1 | 2): Promise<TLShapeId[]> {
  const a = block("estimate()", 60, 140, PORTS_OUT);
  const b = block("encode()", 560, 160, PORTS_IN);
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

/** The pill portals its popover outside the app root. */
function pill<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

async function openTunnelMenu() {
  const trigger = await waitFor(() => pill<HTMLElement>('[data-testid="ss-wire-tunnel"]'), { what: "the tunnel trigger in the pill" });
  await userEvent.click(trigger);
  return waitFor(() => pill<HTMLElement>('[data-testid="ss-wire-tunnel-panel"]'), { what: "the tunnel panel" });
}

async function press(testId: string) {
  const target = await waitFor(() => pill<HTMLElement>(`[data-testid="${testId}"]`), { what: testId });
  await userEvent.click(target);
}

/** Deselect and un-hover, so nothing is "about" the cable and a tunnel that is
 *  configured actually goes IDLE. `contextFocused` is the whole reason a test
 *  cannot just set the prop and look: a selected cable previews its own run. */
async function lookAway() {
  app!.editor.selectNone();
  app!.editor.setHoveredShape(null);
  await waitFor(() => (app!.editor.getSelectedShapeIds().length === 0 && app!.editor.getHoveredShapeId() === null ? true : null), { what: "nothing selected or hovered" });
}

describe("P-023 — tunnelling is reachable from the app", () => {
  it("press the cable, press Tunnel: the painted run COLLAPSES to two stubs and grows two vias", async () => {
    app = await mountApp();
    const [wire] = await boardWithWires(1);
    const full = await waitFor(() => {
      const length = paintedLength(wire);
      return length > 200 ? length : null;
    }, { what: "a long painted cable" });
    expect(viaCount(wire), "an untunnelled cable has no vias").toBe(0);

    app.editor.select(wire);
    await openTunnelMenu();
    await press("ss-wire-tunnel-toggle");
    await waitFor(() => (wireProps(wire).tunnel ? true : null), { what: "the record to take the tunnel" });

    // Still SELECTED, so the trunk's own contract says `preview`: the whole
    // run is drawn AND the mouths are marked. That is the single most
    // confusable thing about this feature, so it is pinned here rather than
    // left to be rediscovered.
    await waitFor(() => (viaCount(wire) === 2 ? true : null), { what: "two vias while previewing" });
    expect(paintedLength(wire), "preview draws the complete run").toBeCloseTo(full, 0);

    await lookAway();
    const hidden = await waitFor(() => {
      const length = paintedLength(wire);
      return length > 0 && length < full / 2 ? length : null;
    }, { what: "the long run to leave the surface" });
    // Two 34px stubs (TUNNEL_STUB_LENGTH), which is what is left of a ~500px
    // route. Measured, not asserted from the prop.
    expect(hidden).toBeLessThan(120);
    expect(viaCount(wire), "the mouths stay marked while hidden").toBe(2);
  });

  it("a hidden run is not grabbable where it is not painted — and its endpoint block reveals it", async () => {
    app = await mountApp();
    const [wire] = await boardWithWires(1);
    await waitFor(() => (paintedLength(wire) > 200 ? true : null), { what: "a long painted cable" });
    const middle = middleOfRoute(wire);
    expect(app.editor.getShapeAtPoint(middle, { hitInside: false })?.id, "an ordinary cable IS grabbable at its middle").toBe(wire);

    app.editor.select(wire);
    await openTunnelMenu();
    await press("ss-wire-tunnel-toggle");
    await waitFor(() => (wireProps(wire).tunnel ? true : null), { what: "the tunnel" });
    await lookAway();
    await waitFor(() => (paintedLength(wire) < 120 ? true : null), { what: "the hidden run" });

    // THE POINT OF THE FEATURE. A cable whose middle still answered hit tests
    // would keep stealing presses across the board, and — worse — hovering
    // empty board would make it reappear, because the hover it produced is
    // exactly what `contextFocused` reads.
    expect(app.editor.getShapeAtPoint(middle, { hitInside: false })?.id, "the hidden run is not there to be grabbed").not.toBe(wire);

    // And the way back in is the NODE, not the vanished cable: hovering the
    // block a cable lands on reveals it.
    const [sourceBlock] = app.editor.getCurrentPageShapes().filter((s) => s.type === BLOCK_SHAPE_TYPE).map((s) => s.id);
    app.editor.setHoveredShape(sourceBlock);
    await waitFor(() => (paintedLength(wire) > 200 ? true : null), { what: "hovering the block to reveal its cable" });
  });

  it("focusing a layer tunnels every cable that is NOT on it — including one never configured as a tunnel", async () => {
    app = await mountApp();
    const [first, second] = await boardWithWires(2);
    await waitFor(() => (paintedLength(first) > 200 && paintedLength(second) > 200 ? true : null), { what: "two long cables" });

    // File the first cable onto a layer by typing its name — no cable has a
    // layer yet, so this is the "+ New layer" path `canonicalSceneLayer`'s
    // fallback exists for.
    app.editor.select(first);
    await openTunnelMenu();
    const field = await waitFor(() => pill<HTMLInputElement>('[data-testid="ss-wire-layer-input"]'), { what: "the layer field" });
    await userEvent.fill(field, "Diagnostics");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => (wireProps(first).layer === "Diagnostics" ? true : null), { what: "the cable filed onto Diagnostics" });
    expect(wireProps(first).tunnel, "filing a cable onto a layer does not tunnel it").toBe(false);
    expect(wireProps(second).tunnel, "and the other cable is untouched").toBe(false);

    // The layer is now in the derived list — no registry was written.
    await press("ss-wire-layer-focus-Diagnostics");
    await lookAway();

    // `tunnelDisplayState` checks `focusedLayer` BEFORE `enabled`, which is
    // what makes focus able to tunnel a cable nobody configured. The second
    // cable has `tunnel: false` and still leaves the surface.
    await waitFor(() => (paintedLength(second) < 120 ? true : null), { what: "the off-layer cable to tunnel" });
    expect(wireProps(second).tunnel, "and it did so with NO document write").toBe(false);
    expect(paintedLength(first), "the focused layer's own cable stays whole").toBeGreaterThan(200);
    expect(viaCount(first), "a revealed cable has no mouths").toBe(0);
  });

  it("a bundle tunnels in one press and undoes in one step, and the row is absent with no cable selected", async () => {
    app = await mountApp();
    const both = await boardWithWires(2);
    app.editor.select(...both);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "both cables selected" });

    await openTunnelMenu();
    await press("ss-wire-tunnel-toggle");
    await waitFor(() => (both.every((id) => wireProps(id).tunnel) ? true : null), { what: "both cables tunnelled" });

    app.editor.undo();
    await waitFor(() => (both.every((id) => !wireProps(id).tunnel) ? true : null), { what: "ONE undo to put both back" });

    const blocks = app.editor.getCurrentPageShapes().filter((s) => s.type === BLOCK_SHAPE_TYPE).map((s) => s.id);
    app.editor.select(...blocks);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === blocks.length ? true : null), { what: "the blocks selected" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(pill('[data-testid="ss-wire-tunnel"]'), "no cable selected, no tunnel row").toBeNull();
  });
});
