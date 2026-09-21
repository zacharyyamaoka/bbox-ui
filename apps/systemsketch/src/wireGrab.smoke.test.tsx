// src/wireGrab.smoke.test.tsx — P-003's acceptance: a cable is grabbable
// ALONG ITS LENGTH, not only where its dots are.
//
// The backlog entry states the gap as a number: "A 2px wire gets a ~12px hit
// corridor instead of tldraw's ±3 screen px." So this file MEASURES the
// corridor rather than asserting that one click happened to work — it walks
// perpendicular to the cable one pixel at a time and reads the engine's own
// answer (`getShapeAtPoint`), which is the same predicate the select tool
// asks. A test that only clicked the centreline would pass on the old ±3
// geometry too.
//
// The second case is the curve. `wireRoutePoints` used to fall back to
// `[start, end]` for `curved` because a cubic has no vertices — so the hit
// geometry was the CHORD while the paint was the bow, and a press on the
// middle of a visibly-drawn curve landed on empty canvas. The case below
// aims at the drawn path's own midpoint, read off the mounted
// `SVGPathElement` with `getPointAtLength`, so it is a press at a place the
// user can actually see a cable.
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

/** Drag one cable between two fresh blocks and hand back its shape id. */
async function wiredPair(sourceAt = { x: 60, y: 140 }, sinkAt = { x: 460, y: 160 }): Promise<TLShapeId> {
  const a = block("estimate()", sourceAt.x, sourceAt.y, PORTS_OUT);
  const b = block("encode()", sinkAt.x, sinkAt.y, PORTS_IN);
  await anchorsMeasured(a, 1);
  await anchorsMeasured(b, 1);
  await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
  const wire = await waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === WIRE_SHAPE_TYPE), { what: "an ss-wire" });
  return wire.id;
}

async function pathOf(wire: TLShapeId): Promise<SVGPathElement> {
  return waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`), { what: "the painted trace" });
}

/** A point ON the painted path, in viewport px — the engine is never asked
 *  where the cable is, the DOM is, because the question is "can the user hit
 *  what he can SEE". */
function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const svg = path.ownerSVGElement!;
  const point = svg.createSVGPoint();
  const local = path.getPointAtLength(length);
  point.x = local.x;
  point.y = local.y;
  const screen = point.matrixTransform(svg.getScreenCTM()!);
  return { x: screen.x, y: screen.y };
}

/** The unit normal of the painted path at `length`, in screen px. */
function normalAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const before = screenPointAt(path, Math.max(0, length - 2));
  const after = screenPointAt(path, Math.min(path.getTotalLength(), length + 2));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  return { x: -dy / magnitude, y: dx / magnitude };
}

/** Distance from `point` to the SEGMENT `a`->`b`, in screen px. */
function distanceToSegment(a: { x: number; y: number }, b: { x: number; y: number }, point: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/**
 * Where the painted path runs FARTHEST from its own chord, and how far.
 *
 * That point is the honest place to press for this case: it is exactly where
 * the retired `points ?? [start, end]` fallback put the hit geometry at its
 * greatest distance from the cable the user can see.
 */
function farthestFromChord(path: SVGPathElement): { at: { x: number; y: number }; gap: number } {
  const total = path.getTotalLength();
  const start = screenPointAt(path, 0);
  const end = screenPointAt(path, total);
  let best = { at: start, gap: 0 };
  for (let step = 1; step < 64; step++) {
    const at = screenPointAt(path, (total * step) / 64);
    const gap = distanceToSegment(start, end, at);
    if (gap > best.gap) best = { at, gap };
  }
  return best;
}

function shapeIdAtScreen(screen: { x: number; y: number }): string | undefined {
  return app!.editor.getShapeAtPoint(app!.editor.screenToPage(screen))?.id;
}

/** A real press at an exact viewport point — blockHitTest.smoke.test.tsx's
 *  helper, and its reasoning: `userEvent.click`'s `position` is measured from
 *  the resolved element's own top-left, so the offset has to be put back. */
async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${screen.x}, ${screen.y})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

describe("P-003 — a cable is grabbable along its length", () => {
  it("a press on the middle of an elbow selects the wire", async () => {
    app = await mountApp();
    const wire = await wiredPair();
    const path = await pathOf(wire);
    const middle = screenPointAt(path, path.getTotalLength() / 2);

    // The press has to land on empty canvas as far as every OTHER shape is
    // concerned, or this proves nothing about the wire.
    app.editor.updateShape({ id: wire, type: WIRE_SHAPE_TYPE, props: {} } as never);
    app.editor.selectNone();
    await clickAtScreen(middle);
    expect(app.editor.getSelectedShapeIds(), "a press on the drawn cable, nowhere near a dot").toEqual([wire]);
  });

  it("the corridor is ~12 screen px wide, not tldraw's stock 6", async () => {
    app = await mountApp();
    const wire = await wiredPair();
    const path = await pathOf(wire);
    const at = path.getTotalLength() / 2;
    const centre = screenPointAt(path, at);
    const normal = normalAt(path, at);
    expect(app.editor.getZoomLevel(), "the corridor is quoted in SCREEN px, so the camera must be at 1").toBe(1);

    // Walk outward until the engine stops answering with the wire.
    const reach = (sign: number) => {
      for (let offset = 0; offset <= 40; offset += 0.25) {
        const probe = { x: centre.x + normal.x * offset * sign, y: centre.y + normal.y * offset * sign };
        if (shapeIdAtScreen(probe) !== wire) return offset;
      }
      return 40;
    };
    const half = Math.min(reach(1), reach(-1));

    // Stock would be 3. The corridor is 12 wide, so its half-width is 6.
    expect(half).toBeGreaterThan(5);
    expect(half).toBeLessThanOrEqual(6.5);
  });

  it("a press on a CURVED cable where it runs FARTHEST from its chord selects it", async () => {
    app = await mountApp();
    // Sink BELOW the source, so the chord runs vertically while both control
    // points leave horizontally — that is the arrangement where the default
    // cubic genuinely bows ACROSS its chord (~25px here) rather than merely
    // overshooting along it. A plain left-to-right span will not do: its
    // control points are collinear with the chord, the bow is ~1px, and a
    // chord-based hit geometry would pass the case without deserving to.
    const wire = await wiredPair({ x: 300, y: 120 }, { x: 300, y: 420 });
    app.editor.updateShape({ id: wire, type: WIRE_SHAPE_TYPE, props: { routing: "curved" } } as never);

    const far = await waitFor(() => {
      const found = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`);
      const d = found?.getAttribute("d") ?? "";
      // The repaint is asynchronous, and an elbow route IS far from its chord
      // — so without this guard the case can measure the OLD path and then
      // press against the NEW geometry. A single cubic is the whole `d`.
      if (!found || !d.includes("C") || /[LAQ]/.test(d)) return null;
      if (found.getTotalLength() === 0) return null;
      const measured = farthestFromChord(found);
      return measured.gap > 12 ? measured : null;
    }, { what: "a painted cubic that leaves its chord by more than the corridor" });

    // The gap IS the bug this case exists for: that many px of daylight
    // between what is drawn and where the retired chord fallback said the
    // cable was.
    expect(far.gap).toBeGreaterThan(12);
    expect(shapeIdAtScreen(far.at), "the engine must find the wire where the wire is drawn").toBe(wire);

    app.editor.selectNone();
    await clickAtScreen(far.at);
    expect(app.editor.getSelectedShapeIds(), "a press on the drawn bow").toEqual([wire]);
  });
});
