// src/traceDefaults.smoke.test.tsx — Zach's four rendering rules of
// 2026-09-22, measured in the REAL mounted app (not a Storybook bench):
//
//   1. "by default can you please update the data traces to draw without an
//      arrow? because its DAG, we already know the order!"
//   2. "Please also make the trace end exactly at the port … right now there
//      is this spacing which is not desirable!"
//   3. "Please also lets do ports v2 as the default ones … and for regions
//      make v9 the default one" — for a viewer with nothing stored.
//   4. "Please enforce a minimum height on the blocks … that can be
//      calculated from the minimum port spacing" — a stored `h` too short
//      for three right-wall ports renders tall enough.
//
// The ring a cable must touch is read off the dot's COMPUTED box-shadow (the
// pixels painted), never off `wireTerminalGap`, the function the app places
// the end with — a check that asked the implementation would agree with it.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { PORT_VARIANT_STORAGE_KEY, REGION_VARIANT_STORAGE_KEY } from "./chrome/DevMenu/variantSwitch";
import { createWire } from "./shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

/**
 * Zach's "touch", in px of daylight between the ink and the ring.
 *
 * WHY 0.5 and not 1 (2026-09-22 audit, HIGH): the app's OWN old pull-back —
 * a fixed `WIRE_TERMINAL_GAP = 8` — leaves exactly 8 − 6 (v2 ring) − 1 (the
 * round cap) = 1.00px, so a 1px bound passed the very behaviour this file
 * exists to reject. Measured noise on the new ends is ≤0.13px (subpixel dot
 * centres), so 0.5 sits well clear of both.
 */
const TOUCH_TOLERANCE_PX = 0.5;
beforeEach(() => {
  // Rule 3 is about a viewer with NOTHING stored.
  window.localStorage.removeItem(PORT_VARIANT_STORAGE_KEY);
  window.localStorage.removeItem(REGION_VARIANT_STORAGE_KEY);
});
afterEach(() => {
  app?.unmount();
  app = null;
});

const port = (id: string) => ({ id, declaration: id });
const PORTS_OUT = { left: [], right: [port("fast"), port("frame"), port("gain")], top: [], bottom: [] };
const PORTS_IN = { left: [port("frame")], right: [], top: [], bottom: [] };

function block(name: string, x: number, y: number, ports: unknown, h?: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports, ...(h === undefined ? {} : { h }) } } as never);
  return id;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(() => {
    const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
    return wrap?.querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`) ?? null;
  }, { what: `${id}/${portId} dot` });
}

/** The painted outer ring radius: the dot's box plus its outermost box-shadow spread. */
function ringOf(dot: HTMLElement): { cx: number; cy: number; r: number } {
  const rect = dot.getBoundingClientRect();
  let spread = 0;
  for (const match of getComputedStyle(dot).boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)) {
    spread = Math.max(spread, Number(match[4]));
  }
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: rect.width / 2 + spread };
}

function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const local = path.getPointAtLength(length);
  return new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM()!);
}

/** How far the visible ink stops short of (+) or runs into (−) the ring. */
function inkGap(path: SVGPathElement, atEnd: boolean, dot: HTMLElement): number {
  const point = screenPointAt(path, atEnd ? path.getTotalLength() : 0);
  const style = getComputedStyle(path);
  const cap = style.strokeLinecap === "round" ? Number.parseFloat(style.strokeWidth) / 2 : 0;
  const ring = ringOf(dot);
  return Math.hypot(point.x - ring.cx, point.y - ring.cy) - cap - ring.r;
}

describe("trace defaults — the app", () => {
  it("opens on Ports v2 and Regions v9 when nothing is stored", async () => {
    app = await mountApp();
    await waitFor(() => document.documentElement.getAttribute("data-bbox-port-variant") === "v2" || null, { what: "ports v2 on <html>" });
    expect(document.documentElement.getAttribute("data-bbox-region-variant")).toBe("v9");
    const a = block("src", 60, 120, PORTS_OUT);
    expect((await dotOf(a, "fast")).getAttribute("data-bbox-port-variant")).toBe("v2");
  });

  it("a block stored too short for three right-wall ports renders tall enough to hold them", async () => {
    app = await mountApp();
    const a = block("src", 60, 120, PORTS_OUT, 60);
    const last = await dotOf(a, "gain");
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${a}"] [data-block-id="${a}"] > [data-slot="block"]`), { what: "the block face" });
    await waitFor(() => (face.getBoundingClientRect().bottom >= last.getBoundingClientRect().bottom ? true : null), {
      what: `face bottom ${face.getBoundingClientRect().bottom} ≥ last dot bottom ${last.getBoundingClientRect().bottom}`,
    });
    expect(face.getBoundingClientRect().height).toBeGreaterThan(60);
    // The measurement pass writes the rendered box back, so the stored `h`
    // (tldraw's geometry — hit-testing, selection) agrees with what is drawn.
    await waitFor(() => ((app!.editor.getShape(a) as { props: { h: number } }).props.h > 60 ? true : null), { what: "props.h written back" });
    expect(Math.abs((app.editor.getShape(a) as { props: { h: number } }).props.h - face.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  });

  it("a wire between two blocks carries no arrowhead and both ends touch their dots' rings", async () => {
    app = await mountApp();
    const a = block("src", 60, 120, PORTS_OUT);
    const b = block("estimate()", 420, 140, PORTS_IN);
    const from = await dotOf(a, "frame");
    const to = await dotOf(b, "frame");
    await waitFor(() => ((app!.editor.getShape(b) as { props: { anchors: unknown[] } }).props.anchors.length === 1 ? true : null), { what: "b's anchor measured" });
    await waitFor(() => ((app!.editor.getShape(a) as { props: { anchors: unknown[] } }).props.anchors.length === 3 ? true : null), { what: "a's anchors measured" });
    const wire = createWire(app.editor, { from: { nodeId: a, portId: "frame" }, to: { nodeId: b, portId: "frame" } });
    expect(wire).not.toBeNull();

    const path = await waitFor(() => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`), { what: "the trace path" });
    expect(app.root.querySelectorAll(`[data-shape-id="${wire}"] marker`)).toHaveLength(0);
    expect(path.getAttribute("marker-end")).toBeNull();

    await waitFor(() => {
      const start = inkGap(path, false, from);
      const end = inkGap(path, true, to);
      return Math.abs(start) <= TOUCH_TOLERANCE_PX && Math.abs(end) <= TOUCH_TOLERANCE_PX ? true : null;
    }, { what: `ends touch the rings (start ${inkGap(path, false, from).toFixed(2)}px, end ${inkGap(path, true, to).toFixed(2)}px)` });
  });

  it("a LIVE port-style switch moves the painted ends AND the engine's hit geometry onto the new ring, for v3, v1 and back to v2", async () => {
    app = await mountApp();
    const a = block("src", 60, 120, PORTS_OUT);
    const b = block("estimate()", 420, 140, PORTS_IN);
    await waitFor(() => ((app!.editor.getShape(b) as { props: { anchors: unknown[] } }).props.anchors.length === 1 ? true : null), { what: "b's anchor measured" });
    await waitFor(() => ((app!.editor.getShape(a) as { props: { anchors: unknown[] } }).props.anchors.length === 3 ? true : null), { what: "a's anchors measured" });
    const wire = createWire(app.editor, { from: { nodeId: a, portId: "frame" }, to: { nodeId: b, portId: "frame" } })!;

    for (const variant of ["v3", "v1", "v2"] as const) {
      // Through the app's own pill — the real live switch, not an attribute
      // poke — so the stored key and the <html> stamp both move.
      await userEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-variant-port"]'), { what: "the port pill" }));
      await userEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-testid="ss-variant-port-${variant}"]`), { what: `the ${variant} row` }));
      if (document.querySelector('[data-testid^="ss-variant-port-v"]')) await userEvent.keyboard("{Escape}");
      // v1 is the ABSENT attribute (`setPortVariant` clears it for the tables' own default).
      await waitFor(() => ((document.documentElement.getAttribute("data-bbox-port-variant") ?? "v1") === variant ? true : null), { what: `<html> on ${variant}` });

      // Paint: both ends on the NEW ring.
      await waitFor(() => {
        const path = app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`);
        const from = app!.root.querySelector<HTMLElement>(`[data-shape-id="${a}"] [data-block-id="${a}"] [data-port-id="frame"] [data-slot="port-dot"]`);
        const to = app!.root.querySelector<HTMLElement>(`[data-shape-id="${b}"] [data-block-id="${b}"] [data-port-id="frame"] [data-slot="port-dot"]`);
        if (!path || !from || !to || from.getAttribute("data-bbox-port-variant") !== variant) return null;
        return Math.abs(inkGap(path, false, from)) <= TOUCH_TOLERANCE_PX && Math.abs(inkGap(path, true, to)) <= TOUCH_TOLERANCE_PX ? true : null;
      }, { what: `${variant}: painted ends on the new ring` });

      // Engine: the cached geometry the corridor hit-tests with ends where the
      // paint ends. A switch the engine cannot see left these on the old ring.
      const path = app.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`)!;
      const paintStart = path.getPointAtLength(0);
      const paintEnd = path.getPointAtLength(path.getTotalLength());
      const vertices = app.editor.getShapeGeometry(wire).vertices;
      const geoStart = vertices[0];
      const geoEnd = vertices[vertices.length - 1];
      expect(Math.hypot(geoStart.x - paintStart.x, geoStart.y - paintStart.y), `${variant}: hit geometry start vs paint`).toBeLessThanOrEqual(0.5);
      expect(Math.hypot(geoEnd.x - paintEnd.x, geoEnd.y - paintEnd.y), `${variant}: hit geometry end vs paint`).toBeLessThanOrEqual(0.5);

      // And a press on the drawn cable selects it.
      app.editor.selectNone();
      const middle = new DOMPoint(path.getPointAtLength(path.getTotalLength() / 2).x, path.getPointAtLength(path.getTotalLength() / 2).y).matrixTransform(path.getScreenCTM()!);
      const under = document.elementFromPoint(middle.x, middle.y)!;
      const rect = under.getBoundingClientRect();
      await userEvent.click(under, { position: { x: Math.round(middle.x - rect.left), y: Math.round(middle.y - rect.top) } });
      expect(app.editor.getSelectedShapeIds(), `${variant}: a press on the drawn cable`).toEqual([wire]);
    }
  });
});
