// src/wireRoute.smoke.test.tsx — P-028's acceptance: an elbow cable's route
// can be AUTHORED by dragging it, and handed back to the router by
// double-clicking what you authored.
//
// Every assertion below is measured off the REAL artifacts rather than the
// record alone, because the record is the easy half:
//
//   - the handle's position comes from `editor.getShapeHandles`, the same
//     call tldraw's own `ShapeHandleOverlayUtil` makes to decide where the
//     grab circle is drawn — so the drag lands where a user would see one;
//   - the drag is a real Playwright pointer drag on the canvas at those
//     coordinates (`sourcePosition`/`targetPosition`), not an
//     `editor.dispatch`, so it goes through `select.idle` ->
//     `pointing_handle` -> `dragging_handle` exactly as a mouse does;
//   - the result is read back off the MOUNTED `<path d=…>`, so "the cable
//     moved" means the ink moved, not that a number changed.
//
// The third case is the one that justifies the whole `ElbowPin` design and is
// the reason this file does not stop at "a pin was written": a pin is a
// FRACTION in the frame spanned by the two endpoints, so moving a block must
// carry the authored corner with it. Storing the dragged point absolutely —
// Excalidraw's `fixedSegments` — passes cases 1 and 2 and fails case 3, which
// is precisely what Zach rejected: "When I drag the box, the arrow elbow
// stays in the same place. This is not desirable."
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import type { WireShape } from "./shapes/wire";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const PORTS_OUT = { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] };
const PORTS_IN = { left: [{ id: "in", declaration: "in: Pose" }], right: [], top: [], bottom: [] };

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

interface Wired {
  wire: TLShapeId;
  source: TLShapeId;
  sink: TLShapeId;
}

/**
 * Two blocks, one cable between their dots, and the cable selected — which is
 * what makes tldraw offer handles at all (`ShapeHandleOverlayUtil.isActive`
 * requires the shape to be the ONLY selected one).
 *
 * The blocks sit one above the other rather than side by side so the auto
 * elbow route has a real interior VERTICAL rail to grab: a straight
 * left-to-right run would collapse to a single segment with nothing pinnable
 * on it, and the test would be measuring the degenerate case.
 */
async function wiredPair(): Promise<Wired> {
  const source = block("estimate()", 120, 120, PORTS_OUT);
  const sink = block("encode()", 560, 420, PORTS_IN);
  await anchorsMeasured(source, 1);
  await anchorsMeasured(sink, 1);
  await userEvent.dragAndDrop(await dotOf(source, "out"), await dotOf(sink, "in"));
  const wire = await waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === WIRE_SHAPE_TYPE), { what: "an ss-wire" });
  app!.editor.select(wire.id);
  return { wire: wire.id, source, sink };
}

function wireOf(id: TLShapeId): WireShape {
  return app!.editor.getShape<WireShape>(id)!;
}

/** The pin handles the ENGINE says this cable has, in viewport px. */
function handlesOf(id: TLShapeId): { id: string; type: string; x: number; y: number }[] {
  const shape = app!.editor.getShape(id)!;
  return (app!.editor.getShapeHandles(shape) ?? []).map((handle) => {
    const screen = app!.editor.pageToScreen({ x: handle.x, y: handle.y });
    return { id: handle.id, type: handle.type, x: screen.x, y: screen.y };
  });
}

/**
 * The PIN handles only.
 *
 * AMENDED BY P-053, and it is the one change that item made to this file.
 * When P-028 was written, pins were the only handles an `ss-wire` had, so
 * `handlesOf(wire)[0]` was always one and "every handle is a `pin:`" was a
 * true sentence about the shape. P-053 adds two TERMINAL handles to the same
 * `getHandles` — that is the item, "the same machinery for the two ENDS" —
 * so the list now carries both kinds and `[0]` is `terminal:start`. Every
 * case below still measures exactly what it measured before; it just names
 * the handle it meant instead of taking whichever came first. The assertion
 * that WAS lost — "nothing here is anything but a pin" — is not dropped, it
 * is restated in the first case as the full list, so this file still fails if
 * a third handle kind appears unannounced.
 */
function pinHandlesOf(id: TLShapeId) {
  return handlesOf(id).filter((handle) => handle.id.startsWith("pin:"));
}

/** Canvas-relative coordinates, which is what Playwright's drag options take. */
function onCanvas(point: { x: number; y: number }): { x: number; y: number } {
  const rect = canvasOf(app!.root).getBoundingClientRect();
  return { x: point.x - rect.left, y: point.y - rect.top };
}

async function pathOf(wire: TLShapeId): Promise<SVGPathElement> {
  return waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`), { what: "the painted trace" });
}

/** Every sampled point of the painted cable, in viewport px. */
function inkOf(path: SVGPathElement): { x: number; y: number }[] {
  const svg = path.ownerSVGElement!;
  const matrix = svg.getScreenCTM()!;
  const total = path.getTotalLength();
  const samples: { x: number; y: number }[] = [];
  for (let step = 0; step <= 96; step++) {
    const local = path.getPointAtLength((total * step) / 96);
    const point = svg.createSVGPoint();
    point.x = local.x;
    point.y = local.y;
    const screen = point.matrixTransform(matrix);
    samples.push({ x: screen.x, y: screen.y });
  }
  return samples;
}

/** How close the painted cable comes to `at`, in viewport px. */
function inkDistanceTo(path: SVGPathElement, at: { x: number; y: number }): number {
  return Math.min(...inkOf(path).map((point) => Math.hypot(point.x - at.x, point.y - at.y)));
}

describe("P-028 — authored elbow routes", () => {
  it("a new cable is automatic: no pins, and one grab handle per interior segment", async () => {
    app = await mountApp();
    const { wire } = await wiredPair();

    expect(wireOf(wire).props.pins).toEqual([]);

    const pins = pinHandlesOf(wire);
    expect(pins.length).toBeGreaterThan(0);
    // `virtual` is stock tldraw's "the engine owns this point"; nothing is
    // authored yet, so no PIN is a `vertex`.
    expect(pins.every((handle) => handle.type === "virtual")).toBe(true);
    // And nothing else is on this cable but the two ends P-053 added — the
    // restatement of P-028's original "every handle is a pin", in the world
    // where a cable also has terminals.
    expect(
      handlesOf(wire).filter((handle) => !handle.id.startsWith("pin:")).map((handle) => handle.id).sort(),
    ).toEqual(["terminal:end", "terminal:start"]);
  });

  it("dragging a segment handle moves the painted cable and writes one pin", async () => {
    app = await mountApp();
    const { wire } = await wiredPair();
    const canvas = canvasOf(app.root);

    const handle = pinHandlesOf(wire)[0];
    const dropped = { x: handle.x + 90, y: handle.y };

    // The cable does NOT run through the drop point before the drag — stated
    // as a measurement so the assertion after the drag cannot pass vacuously.
    expect(inkDistanceTo(await pathOf(wire), dropped)).toBeGreaterThan(40);

    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: onCanvas(handle),
      targetPosition: onCanvas(dropped),
    });

    const pins = await waitFor(() => {
      const current = wireOf(wire).props.pins;
      return current.length > 0 ? current : null;
    }, { what: "a pin written by the drag" });
    expect(pins).toHaveLength(1);
    expect(pins[0].index).toBe(Number(handle.id.slice("pin:".length)));

    // The INK, not the record: the cable now runs through where it was
    // dragged to.
    await waitFor(() => (inkDistanceTo(app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`)!, dropped) < 12 ? true : null), {
      what: "the painted cable to reach the drop point",
    });

    // The authored corner is now a `vertex` handle, which is the only place
    // "this route is authored" is visible on the canvas.
    expect(handlesOf(wire).some((each) => each.id === handle.id && each.type === "vertex")).toBe(true);
  });

  it("the authored corner travels with the block it was authored against", async () => {
    app = await mountApp();
    const { wire, sink } = await wiredPair();
    const canvas = canvasOf(app.root);

    const handle = pinHandlesOf(wire)[0];
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: onCanvas(handle),
      targetPosition: onCanvas({ x: handle.x + 150, y: handle.y }),
    });
    const authored = await waitFor(() => {
      const current = wireOf(wire).props.pins;
      return current.length > 0 ? current : null;
    }, { what: "a pin written by the drag" });

    // Synchronous on purpose: `waitFor`'s probe is a plain function, and an
    // async probe would hand it a Promise — always truthy, so the poll would
    // "succeed" on its first tick having measured nothing.
    await pathOf(wire);
    const cornerFraction = () => {
      const path = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`)!;
      const ink = inkOf(path);
      const end = ink[ink.length - 1];
      const corner = handlesOf(wire).find((each) => each.id === handle.id)!;
      return { fraction: (corner.x - ink[0].x) / (end.x - ink[0].x), x: corner.x, endX: end.x };
    };

    const before = cornerFraction();
    // Authored well off centre — that is what makes this case sharp. A pin
    // stored as "so many px from the midpoint" and a pin stored as a FRACTION
    // of the span agree exactly at 0.5 and nowhere else, so a centred corner
    // cannot tell the two designs apart.
    expect(Math.abs(before.fraction - 0.5)).toBeGreaterThan(0.1);

    const box = app.editor.getShapePageBounds(sink)!;
    app.editor.updateShape({ id: sink, type: BLOCK_SHAPE_TYPE, x: box.x + 220, y: box.y });

    // The probe waits on the INK's far end, not on the handle: a handle is
    // derived from the live record and moves in the same tick as the update,
    // while the `<path d=…>` is React's and lands a frame later. Reading the
    // fraction in between measures a NEW corner against an OLD span — which
    // is how this assertion first went red against a correct implementation.
    const after = await waitFor(() => {
      const moved = handlesOf(wire).find((each) => each.id === handle.id);
      if (!moved) return null;
      const now = cornerFraction();
      return Math.abs(now.endX - before.endX) > 8 && Math.abs(now.x - before.x) > 8 ? now : null;
    }, { what: "the authored corner and the cable's far end to follow the block" });

    // The PIN RECORD is untouched — that is what "authored" means — and the
    // corner has KEPT ITS PROPORTIONAL PLACE in the widened gap. That second
    // claim is the one that fails for every absolute storage form, including
    // "px from the midpoint", which would have moved the corner by half the
    // block's displacement instead of by its own share of it.
    expect(wireOf(wire).props.pins).toEqual(authored);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.fraction).toBeCloseTo(before.fraction, 2);
  });

  it("the hit corridor follows the authored route, so the cable is still grabbable where it now runs", async () => {
    app = await mountApp();
    const { wire } = await wiredPair();
    const canvas = canvasOf(app.root);

    const handle = pinHandlesOf(wire)[0];
    const dropped = { x: handle.x + 90, y: handle.y };
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: onCanvas(handle),
      targetPosition: onCanvas(dropped),
    });
    await waitFor(() => (wireOf(wire).props.pins.length > 0 ? true : null), { what: "a pin written by the drag" });

    // PAINT AND HIT MUST AGREE — the invariant `wireGeometry.ts` keeps for
    // the four routings, now extended to the authored one. The question is
    // asked of the ENGINE (`getShapeAtPoint`, the same predicate the select
    // tool uses) at a point read off the MOUNTED ink, so a `getGeometry` that
    // routed without the pins would answer "canvas" here while the user can
    // plainly see a cable.
    const ink = inkOf(await pathOf(wire));
    const onTheBend = ink.reduce((best, point) => (Math.hypot(point.x - dropped.x, point.y - dropped.y) < Math.hypot(best.x - dropped.x, best.y - dropped.y) ? point : best), ink[0]);
    expect(Math.hypot(onTheBend.x - dropped.x, onTheBend.y - dropped.y)).toBeLessThan(12);
    expect(app.editor.getShapeAtPoint(app.editor.screenToPage(onTheBend))?.id).toBe(wire);
  });

  it("double-clicking an authored corner hands the route back to the router", async () => {
    app = await mountApp();
    const { wire } = await wiredPair();
    const canvas = canvasOf(app.root);

    const handle = pinHandlesOf(wire)[0];
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: onCanvas(handle),
      targetPosition: onCanvas({ x: handle.x + 90, y: handle.y }),
    });
    await waitFor(() => (wireOf(wire).props.pins.length > 0 ? true : null), { what: "a pin written by the drag" });

    const authored = handlesOf(wire).find((each) => each.id === handle.id)!;
    await userEvent.dblClick(canvas, { position: onCanvas(authored) });

    await waitFor(() => (wireOf(wire).props.pins.length === 0 ? true : null), { what: "the pin to be dropped" });
    // Every PIN is back to `virtual` — the route is the router's again. The
    // two terminals are `vertex` and always were (P-053): an endpoint is not
    // a point the engine is proposing, it is one that exists.
    expect(pinHandlesOf(wire).every((each) => each.type === "virtual")).toBe(true);
  });
});
