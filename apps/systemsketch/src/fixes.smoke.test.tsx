// src/fixes.smoke.test.tsx — the app-side acceptance for Zach's
// 2026-09-19 feedback (`docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md`,
// lane `fix-edges`). Written and committed BEFORE the implementation it
// grades, so the diff that follows cannot quietly weaken it.
//
//   (a) "by default elbow arrows should always be used. never straight
//       arrows" — a wire the app creates is `elbow`, and its painted line
//       runs on the axes.
//   (b) "edges should always leave from the center of the port… The port
//       only should have 1 connection point in the center" — two cables
//       between the same two dots share ONE start point and ONE end point,
//       both on their dot's centre line. The duplicate FAN that used to
//       spread them by 14px is asserted ABSENT, not merely un-asserted.
//   (c) "I want the port to be right on the edge. and it shouldn't be cut
//       off by the frame" (`115050` vs the desired `115249`) — a region's
//       corner block sits flush with the frame's top-left, its left-wall
//       dot's centre lands ON the frame's left wall, and NOTHING clips that
//       card: `editor.getShapeClipPath` is the engine's own answer to "is
//       this shape masked", and for the corner card it must be `undefined`.
//
// Every claim is MEASURED — `getBoundingClientRect`, the mounted
// `SVGPathElement`'s `getPointAtLength`, and tldraw's own clip API — never
// DOM presence.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE, BRANCH_TOOL_ID, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const PORTS_OUT = { left: [], right: [{ id: "out", name: "out", type: "Pose" }], top: [], bottom: [] };
const PORTS_IN = { left: [{ id: "in", name: "in", type: "Pose" }], right: [], top: [], bottom: [] };

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

function centreRect(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** A point on a mounted path, in SCREEN space — the space the dots' own
 *  `getBoundingClientRect` reports in, so no container arithmetic. */
function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const svg = path.ownerSVGElement!;
  const point = svg.createSVGPoint();
  const local = path.getPointAtLength(length);
  point.x = local.x;
  point.y = local.y;
  const screen = point.matrixTransform(svg.getScreenCTM()!);
  return { x: screen.x, y: screen.y };
}

function lineOf(wireId: TLShapeId): SVGPathElement | null {
  return app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wireId}"] [data-slot="trace-line"]`);
}

/** See `EdgeDefaults.stories.tsx` for why this is a FRACTION: `elbowPath`
 *  rounds its corners, so a perfectly orthogonal route still samples a few
 *  diagonal steps at each bend, while a chord is diagonal at every step. */
function axisAlignedFraction(path: SVGPathElement, step = 2): number {
  const total = path.getTotalLength();
  if (total < step * 2) return 1;
  let aligned = 0;
  let counted = 0;
  let previous = screenPointAt(path, 0);
  for (let d = step; d <= total; d += step) {
    const here = screenPointAt(path, d);
    const dx = Math.abs(here.x - previous.x);
    const dy = Math.abs(here.y - previous.y);
    if (dx > 0.01 || dy > 0.01) {
      counted += 1;
      if (dx < 0.2 || dy < 0.2) aligned += 1;
    }
    previous = here;
  }
  return counted === 0 ? 1 : aligned / counted;
}

describe("fix-edges (a) — elbow is the datum, in the app", () => {
  it("a wire made by dragging between two dots is elbow-routed and its painted line runs on the axes", async () => {
    app = await mountApp();
    const a = block("estimate()", 60, 120, PORTS_OUT);
    const b = block("encode()", 520, 320, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 1);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    const wire = await waitFor(() => wires()[0], { what: "an ss-wire" });
    expect((wire as { props: { routing: string } }).props.routing).toBe("elbow");

    const path = await waitFor(() => lineOf(wire.id), { what: "the painted line" });
    expect(axisAlignedFraction(path), "the cable runs on the axes — it is an elbow, not a chord").toBeGreaterThan(0.85);
    const start = screenPointAt(path, 0);
    const end = screenPointAt(path, path.getTotalLength());
    expect(path.getTotalLength(), "an elbow is longer than its chord — it turned corners").toBeGreaterThan(
      Math.hypot(end.x - start.x, end.y - start.y) + 20,
    );
  });
});

describe("fix-edges (b) — one attach point per port, at the dot's centre", () => {
  it("two cables between the same two dots share ONE start and ONE end, both on the dots' centre lines", async () => {
    app = await mountApp();
    const a = block("a()", 60, 120, PORTS_OUT);
    const b = block("b()", 520, 320, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 1);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => (wires().length === 1 ? true : null), { what: "the first wire" });
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => (wires().length === 2 ? true : null), { what: "the second wire" });

    const paths = await waitFor(() => {
      const found = wires().map((w) => lineOf(w.id));
      return found.every(Boolean) ? (found as SVGPathElement[]) : null;
    }, { what: "both painted lines" });

    const starts = paths.map((p) => screenPointAt(p, 0));
    const ends = paths.map((p) => screenPointAt(p, p.getTotalLength()));
    expect(Math.abs(starts[0].y - starts[1].y), "both cables leave from ONE point (the fan is gone)").toBeLessThanOrEqual(0.5);
    expect(Math.abs(ends[0].y - ends[1].y), "both cables arrive at ONE point").toBeLessThanOrEqual(0.5);

    // …and that one point is the DOT'S CENTRE across the flow. (Along the
    // flow a cable still stops `WIRE_TERMINAL_GAP` short, which is what
    // leaves room for the arrowhead and the dot's own disc.)
    const out = centreRect(await dotOf(a, "out"));
    const into = centreRect(await dotOf(b, "in"));
    for (const start of starts) expect(Math.abs(start.y - out.y)).toBeLessThanOrEqual(1);
    for (const end of ends) expect(Math.abs(end.y - into.y)).toBeLessThanOrEqual(1);
  });
});

describe("fix-edges (c) — a region's corner block is flush with the frame and never clipped", () => {
  it("the corner block's left-wall dot centres ON the frame's left wall, and nothing masks the card", async () => {
    app = await mountApp();

    // Placed with the tool, not `createShape`: the corner block only exists
    // because `armRegionPreset`'s own create handlers mint it, and its
    // position is what this fix changes.
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "the system dock face" });
    const chevron = face.parentElement?.querySelector<HTMLElement>("[aria-haspopup]") ?? face;
    await userEvent.click(chevron);
    const row = await waitFor(
      () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => /branch/i.test(el.textContent ?? "")),
      { what: "the Branch row" },
    );
    await userEvent.click(row);
    await waitFor(() => (app!.editor.getCurrentToolId() === BRANCH_TOOL_ID ? true : null), { what: "the branch tool" });

    const canvas = canvasOf(app.root);
    const canvasRect = canvas.getBoundingClientRect();
    await userEvent.click(canvas, { position: { x: Math.round(canvasRect.width * 0.45), y: Math.round(canvasRect.height * 0.45) } });

    const region = await waitFor(
      () => app!.editor.getCurrentPageShapes().find((s) => s.type === REGION_SHAPE_TYPE) as { id: TLShapeId; props: { cornerBlockId: string } } | undefined,
      { what: "an ss-region" },
    );
    const cornerId = await waitFor(() => (region.props.cornerBlockId ? (region.props.cornerBlockId as TLShapeId) : null), { what: "the corner block id" });
    await userEvent.keyboard("{Escape}");

    // 1. Nothing MASKS the corner card. `getShapeClipPath` is tldraw's own
    //    answer ("the clip path or undefined", Editor.ts) and it folds in
    //    every clipping ancestor, so this is the engine agreeing rather
    //    than us re-deriving the frame's geometry.
    await waitFor(() => (app!.editor.getShapeClipPath(cornerId) === undefined ? true : null), {
      what: `the corner block to be unclipped (got ${String(app!.editor.getShapeClipPath(cornerId))})`,
    });
    expect(app.editor.getShapeClipPath(cornerId)).toBeUndefined();

    // 2. The card is FLUSH with the frame's top-left — no visible inset.
    const frame = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region-frame"]`), { what: "the region frame" });
    const card = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="block"]`), { what: "the corner card" });
    const frameRect = frame.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    expect(Math.abs(cardRect.left - frameRect.left), "the corner card is flush with the frame's left wall").toBeLessThanOrEqual(2);
    expect(Math.abs(cardRect.top - frameRect.top), "the corner card is flush with the frame's top wall").toBeLessThanOrEqual(2);

    // 3. The left-wall dot's CENTRE sits on the frame's left wall — Zach's
    //    "I want the port to be right on the edge", measured.
    const dot = await dotOf(cornerId, "input_1");
    const dotRect = dot.getBoundingClientRect();
    const dotCentreX = dotRect.left + dotRect.width / 2;
    expect(
      Math.abs(dotCentreX - frameRect.left),
      `the dot's centre is on the frame's left wall (${dotCentreX.toFixed(2)} vs ${frameRect.left.toFixed(2)})`,
    ).toBeLessThanOrEqual(1);

    // 4. Its outer half really is painted, not merely un-masked: the dot
    //    hangs LEFT of the frame by (about) its own radius.
    expect(dotRect.left, "the dot's outer half hangs outside the frame").toBeLessThan(frameRect.left - 1);
  });
});
