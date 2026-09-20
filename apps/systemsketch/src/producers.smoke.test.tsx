// src/producers.smoke.test.tsx — lane `producers-count`'s acceptance in the
// real app: the producer-count badge on a block's port is fed from the
// document, and follows it live.
//
// Zach, 2026-09-19: "The port only should have 1 connection point in the
// center. Instead you should show the producer circle that has the number
// for the number of arrows intersecting at that port." The cables share one
// centre attach point (lane `fix-edges`); this file proves the COUNT is
// there, is the document's count, sits on the right dot, and updates the
// moment a cable is drawn or deleted — driven with real press-drags, never a
// store write standing in for the gesture.
//
// ACCEPTANCE — committed before the implementation, not to be weakened by it.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { producerCounts } from "@trunk/scene/producers";

import { sceneFromRecords } from "./document/sceneFromStore";
import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

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

/** The dot as rendered RIGHT NOW, or null — a synchronous probe for `waitFor`. */
function dotNow(id: TLShapeId, portId: string): HTMLElement | null {
  const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
  return wrap?.querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`) ?? null;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(() => dotNow(id, portId), { what: `${id}/${portId} dot` });
}

async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length === count ? true : null), { what: `${count} anchors on ${id}` });
}

function wires() {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE);
}

/** Every badge on the board, as `shapeId/portId → text`. */
function badgeMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const badge of app!.root.querySelectorAll<HTMLElement>('[data-slot="port-producers"]')) {
    const port = badge.closest("[data-port-id]")?.getAttribute("data-port-id");
    const owner = badge.closest("[data-block-id]")?.getAttribute("data-block-id");
    out[`${owner}/${port}`] = badge.textContent?.trim() ?? "";
  }
  return out;
}

async function expectBadges(expected: Record<string, number>, what: string) {
  const want = Object.fromEntries(Object.entries(expected).map(([key, count]) => [key, String(count)]));
  await waitFor(() => (JSON.stringify(sortKeys(badgeMap())) === JSON.stringify(sortKeys(want)) ? true : null), {
    what: `${what}: badges ${JSON.stringify(want)}, saw ${JSON.stringify(badgeMap())}`,
  });
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The badge rides ITS dot: a painted circle whose centre is within dot
 *  radius + ring overhang (≤ 4px for every variant) + its own radius. */
async function expectBadgeOnDot(dot: HTMLElement, count: number) {
  const badge = await waitFor(() => dot.querySelector<HTMLElement>('[data-slot="port-producers"]'), { what: "the badge inside the dot" });
  expect(badge.textContent?.trim()).toBe(String(count));
  const rect = badge.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(6);
  expect(Math.abs(rect.width - rect.height)).toBeLessThanOrEqual(0.5);
  const style = getComputedStyle(badge);
  expect(style.display).not.toBe("none");
  expect(style.visibility).toBe("visible");
  const dotRect = dot.getBoundingClientRect();
  const d = Math.hypot(centreOf(badge).x - centreOf(dot).x, centreOf(badge).y - centreOf(dot).y);
  expect(d, "the badge rides its dot").toBeLessThanOrEqual(dotRect.width / 2 + 4 + rect.width / 2 + 0.5);
  expect(d, "beside the dot, not on top of the attach point").toBeGreaterThan(rect.width / 4);
}

describe("producers-count — the count circle on a port, fed from the document", () => {
  it("drawing a second wire into a port shows a 2; a third shows a 3; deleting walks it back and one cable shows none", async () => {
    app = await mountApp();
    const a = block("a", 60, 80, PORTS_OUT);
    const b = block("b", 60, 240, PORTS_OUT);
    const c = block("c", 60, 400, PORTS_OUT);
    const sink = block("merge", 460, 220, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 1);
    await anchorsMeasured(c, 1);
    await anchorsMeasured(sink, 2);
    // Re-read every time rather than holding one element: a rail re-render
    // is free to replace the node, and a stale handle would measure nothing.
    const sinkIn = () => dotOf(sink, "in");

    // One cable: wired, no number.
    await userEvent.dragAndDrop(await dotOf(a, "out"), await sinkIn());
    await waitFor(() => wires().length === 1, { what: "first wire" });
    await waitFor(() => (dotNow(sink, "in")?.getAttribute("data-state") === "wired" ? true : null), { what: "merge/in wired" });
    await expectBadges({}, "one cable");

    // A SECOND wire drawn into the same port: the count appears, reading 2.
    await userEvent.dragAndDrop(await dotOf(b, "out"), await sinkIn());
    await waitFor(() => wires().length === 2, { what: "second wire" });
    await expectBadges({ [`${sink}/in`]: 2 }, "fan-in 2");
    await expectBadgeOnDot(await sinkIn(), 2);

    // A third — fan-in 3, Zach's `115156` case with one more cable.
    await userEvent.dragAndDrop(await dotOf(c, "out"), await sinkIn());
    await waitFor(() => wires().length === 3, { what: "third wire" });
    await expectBadges({ [`${sink}/in`]: 3 }, "fan-in 3");
    await expectBadgeOnDot(await sinkIn(), 3);

    // The painted number IS the derived scene's number.
    expect(producerCounts(sceneFromRecords(app.editor.store.allRecords())).get(`${sink}/in`)).toBe(3);

    // Delete one cable: 3 → 2. Delete another: one cable left, no number.
    app.editor.deleteShapes([wires()[0].id]);
    await expectBadges({ [`${sink}/in`]: 2 }, "after one delete");
    app.editor.deleteShapes([wires()[0].id]);
    await expectBadges({}, "after two deletes");
    expect((await sinkIn()).getAttribute("data-state")).toBe("wired");
  });

  it("fan-out counts too: one output feeding two inputs reads 2 at the output, and none at either single-cable input", async () => {
    app = await mountApp();
    const a = block("estimate()", 60, 120, PORTS_OUT);
    const sink = block("encode()", 460, 140, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(sink, 2);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(sink, "in"));
    await waitFor(() => wires().length === 1, { what: "first wire" });
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(sink, "cfg"));
    await waitFor(() => wires().length === 2, { what: "second wire" });

    await expectBadges({ [`${a}/out`]: 2 }, "fan-out 2");
    await expectBadgeOnDot(await dotOf(a, "out"), 2);
    for (const port of ["in", "cfg"]) expect(dotNow(sink, port)?.getAttribute("data-state"), `encode/${port} is wired`).toBe("wired");
  });
});
