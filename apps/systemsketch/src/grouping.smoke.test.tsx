// src/grouping.smoke.test.tsx — P-048's acceptance, in real headless Chromium
// against the mounted app: a person selects blocks, presses ONE cell on the
// selection pill, and the board folds; presses the cell again and the board
// comes back.
//
// WHY THE ROUND TRIP IS THE TEST AND NOT THE FOLD: `docs/peps/0003` accepts a
// collapse that MUTATES the document, and the price it names for that is
// `dissolveRegion` being "a correctness obligation, not a convenience". The
// pure half of that obligation is asserted in `document/grouping.test.ts`; this
// file asserts the half that only exists once the store, the shape utils and
// the binding rules are in the room — in particular that the promoted cable
// SURVIVES, which it cannot if it is ever pointed at the region itself
// (`RegionShapeUtil.canBind()` → false).
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { edgeSignatures } from "@trunk/scene/collapse";

import { sceneFromRecords } from "./document/sceneFromStore";
import { createWire } from "./shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface PortSpec {
  id: string;
  declaration: string;
}
type Rails = Record<"left" | "right" | "top" | "bottom", PortSpec[]>;

const NO_PORTS: Rails = { left: [], right: [], top: [], bottom: [] };

function placeBlock(name: string, x: number, y: number, ports: Partial<Rails> = {}): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, view: "port", ports: { ...NO_PORTS, ...ports } },
  } as never);
  return id;
}

/** A → B → C, wired through B's rails: the smallest board where folding B
 *  has to promote a cable in AND a cable out. */
function chain(): { a: TLShapeId; b: TLShapeId; c: TLShapeId } {
  const a = placeBlock("A", 200, 200, { right: [{ id: "out", declaration: "out: Pose" }] });
  const b = placeBlock("B", 500, 200, { left: [{ id: "in", declaration: "in: Pose" }], right: [{ id: "out", declaration: "out" }] });
  const c = placeBlock("C", 800, 200, { left: [{ id: "in", declaration: "in" }] });
  createWire(app!.editor, { from: { nodeId: a, portId: "out" }, to: { nodeId: b, portId: "in" } });
  createWire(app!.editor, { from: { nodeId: b, portId: "out" }, to: { nodeId: c, portId: "in" } });
  return { a, b, c };
}

async function pressPill(testId: string): Promise<void> {
  const bar = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
    what: "the floating toolbar visible",
  });
  const cell = await waitFor(() => bar.querySelector<HTMLElement>(`[data-testid="${testId}"]`), { what: testId });
  await userEvent.click(cell);
}

const regions = () => app!.editor.getCurrentPageShapes().filter((shape) => shape.type === REGION_SHAPE_TYPE);
const scene = () => sceneFromRecords(app!.editor.store.allRecords());

describe("P-048 — group / ungroup, from the selection pill", () => {
  it("Group folds the selection into a region and PROMOTES both crossing cables onto its corner block", async () => {
    app = await mountApp();
    const { a, b, c } = chain();
    const wasAt = app.editor.getShapePageBounds(b)!;
    expect(scene().edges).toHaveLength(2);

    app.editor.select(b);
    await pressPill("ss-selection-group");

    const region = await waitFor(() => regions()[0], { what: "a region on the board" });
    // The member moved INTO the frame and stayed exactly where the person
    // left it on the page — the band grows the frame upward, never the board.
    expect(String(app.editor.getShape(b)!.parentId)).toBe(String(region.id));
    const nowAt = app.editor.getShapePageBounds(b)!;
    expect({ x: Math.round(nowAt.x), y: Math.round(nowAt.y) }).toEqual({ x: Math.round(wasAt.x), y: Math.round(wasAt.y) });

    const cornerId = (region.props as { cornerBlockId: string }).cornerBlockId;
    expect(cornerId, "the region names a corner block").not.toBe("");
    const corner = app.editor.getShape(cornerId as TLShapeId)!;
    expect(corner.type).toBe(BLOCK_SHAPE_TYPE);
    expect(String(corner.parentId)).toBe(String(region.id));

    // THE CLAIM THIS TEST EXISTS FOR: both cables are still on the board, and
    // the two that crossed the boundary now land on the CARD. A cable pointed
    // at the region itself would simply not have been created.
    const after = scene();
    const outer = after.edges.filter((edge) => edge.source === a || edge.target === c);
    expect(outer).toHaveLength(2);
    expect(outer.find((edge) => edge.source === a)!.target).toBe(cornerId);
    expect(outer.find((edge) => edge.target === c)!.source).toBe(cornerId);
    // …and nothing outside names the member any more: isolation, structurally.
    expect(after.edges.filter((edge) => edge.source === b || edge.target === b).every((edge) => edge.source === cornerId || edge.target === cornerId)).toBe(true);
  });

  it("Ungroup puts the board back: same wiring, same page positions, nothing left over", async () => {
    app = await mountApp();
    const { b } = chain();
    const before = edgeSignatures(scene());
    const wasAt = app.editor.getShapePageBounds(b)!;

    app.editor.select(b);
    await pressPill("ss-selection-group");
    await waitFor(() => regions()[0], { what: "a region on the board" });

    // `groupSelection` leaves the new frame selected, so the same pill is
    // already showing the inverse cell — no re-selection, no menu hunt.
    await pressPill("ss-selection-ungroup");

    await waitFor(() => (regions().length === 0 ? true : null), { what: "the region to be gone" });
    const back = scene();
    expect(edgeSignatures(back)).toEqual(before);
    expect(back.nodes.map((node) => node.id).sort()).toEqual(scene().nodes.map((node) => node.id).sort());
    expect(back.nodes.find((node) => node.id === b)!.parentId).toBeUndefined();
    const nowAt = app.editor.getShapePageBounds(b)!;
    expect({ x: Math.round(nowAt.x), y: Math.round(nowAt.y) }).toEqual({ x: Math.round(wasAt.x), y: Math.round(wasAt.y) });
  });

  it("the pill offers exactly one of the two cells: Group over blocks, Ungroup over a region", async () => {
    app = await mountApp();
    const { b, c } = chain();

    app.editor.select(b, c);
    const bar = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
      what: "the floating toolbar visible",
    });
    await waitFor(() => bar.querySelector('[data-testid="ss-selection-group"]'), { what: "the Group cell" });
    expect(bar.querySelector('[data-testid="ss-selection-ungroup"]'), "no Ungroup over blocks").toBeNull();

    await pressPill("ss-selection-group");
    await waitFor(() => regions()[0], { what: "a region on the board" });
    await waitFor(() => bar.querySelector('[data-testid="ss-selection-ungroup"]'), { what: "the Ungroup cell over the new region" });
    expect(bar.querySelector('[data-testid="ss-selection-group"]'), "no Group over a lone region").toBeNull();
  });
});
