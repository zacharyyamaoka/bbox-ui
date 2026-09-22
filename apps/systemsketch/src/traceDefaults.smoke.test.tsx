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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { PORT_VARIANT_STORAGE_KEY, REGION_VARIANT_STORAGE_KEY } from "./chrome/DevMenu/variantSwitch";
import { createWire } from "./shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
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
      return Math.abs(start) <= 1 && Math.abs(end) <= 1 ? true : null;
    }, { what: `ends touch the rings (start ${inkGap(path, false, from).toFixed(2)}px, end ${inkGap(path, true, to).toFixed(2)}px)` });
  });
});
