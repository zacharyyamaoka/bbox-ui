// src/region.smoke.test.tsx — L5's acceptance: Loop and Branch are tools in
// the ONE system family; a created loop region is frame-like with a REAL
// ss-block child in its top-left corner carrying the typed header contract
// (Iterable in / iter out); dragging a block into the region re-parents it
// (stock containment); the region is never a wire target; a branch carries
// arms; the derived scene reports the region as a node of type "region"
// with children, and never as an edge. Committed with the plan
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L5), off-limits to builders.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";

import { sceneFromRecords } from "./document/sceneFromStore";
import { BLOCK_SHAPE_TYPE, BRANCH_TOOL_ID, LOOP_TOOL_ID, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface RegionLike {
  id: TLShapeId;
  x: number;
  y: number;
  props: { w: number; h: number; kind: string; name: string; cornerBlockId: string; arms: { id: string; title: string; open: boolean; h: number }[] };
}
interface BlockLike {
  id: TLShapeId;
  parentId: string;
  x: number;
  y: number;
  props: { name: string; ports: Record<string, { id: string; declaration: string }[]> };
}

async function pickSystemRow(pattern: RegExp) {
  const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "system face" });
  const chevron = face.parentElement?.querySelector<HTMLElement>("[aria-haspopup]") ?? face;
  await userEvent.click(chevron);
  const row = await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => pattern.test(el.textContent ?? "")), { what: `a ${pattern} row` });
  await userEvent.click(row);
}

describe("L5 — regions: control flow is containment, the header is a real block", () => {
  it("Loop and Branch are rows of the ONE system family and select their tools", async () => {
    app = await mountApp();
    await pickSystemRow(/loop/i);
    await waitFor(() => app!.editor.getCurrentToolId() === LOOP_TOOL_ID, { what: "loop tool" });
    await userEvent.keyboard("{Escape}");
    await pickSystemRow(/branch/i);
    await waitFor(() => app!.editor.getCurrentToolId() === BRANCH_TOOL_ID, { what: "branch tool" });
    expect(app.root.querySelectorAll('[data-testid="ss-dock-family-system"]')).toHaveLength(1);
  });

  it("placing a loop creates a frame-like region whose corner block is a CHILD ss-block with Iterable in / iter out, sitting at the top-left", async () => {
    app = await mountApp();
    await pickSystemRow(/loop/i);
    await waitFor(() => app!.editor.getCurrentToolId() === LOOP_TOOL_ID, { what: "loop tool" });
    const canvas = canvasOf(app.root);
    const rect = canvas.getBoundingClientRect();
    await userEvent.click(canvas, { position: { x: Math.round(rect.width * 0.5), y: Math.round(rect.height * 0.5) } });

    const region = await waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === REGION_SHAPE_TYPE) as RegionLike | undefined, { what: "an ss-region" });
    expect(region.props.kind).toBe("for");
    expect(app.editor.getShapeUtil(region as never).isFrameLike(region as never)).toBe(true);

    const corner = await waitFor(() => (region.props.cornerBlockId ? (app!.editor.getShape(region.props.cornerBlockId as TLShapeId) as BlockLike | undefined) : undefined), { what: "the corner block" });
    expect(corner.parentId).toBe(region.id);
    // The declared type is PARSED out of the one stored line (ruling 8) — the
    // corner card's inlet is `Iterable: Iterable`, name then annotation.
    expect(corner.props.ports.left.map((p) => p.declaration)).toEqual(["Iterable: Iterable"]);
    expect(corner.props.ports.left.map((p) => portTypeOfDeclaration(p.declaration))).toEqual(["Iterable"]);
    expect(corner.props.ports.right.map((p) => p.id)).toEqual(["iter"]);
    // Top-left: the corner block's page position is within 24px of the region's own top-left.
    const regionEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region"]`), { what: "the Region face (trunk component)" });
    const cornerEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${corner.id}"] [data-slot="block"]`), { what: "the corner Block face" });
    const r = regionEl.getBoundingClientRect();
    const c = cornerEl.getBoundingClientRect();
    expect(Math.abs(c.left - r.left)).toBeLessThanOrEqual(24);
    expect(Math.abs(c.top - r.top)).toBeLessThanOrEqual(24);
  });

  it("dragging a block into a region re-parents it (stock frame containment); the derived scene shows nesting, never an edge", async () => {
    app = await mountApp();
    const regionId = createShapeId();
    app.editor.createShape({ id: regionId, type: REGION_SHAPE_TYPE, x: 300, y: 120, props: { kind: "while", name: "While Loop", w: 420, h: 300 } } as never);
    const blockId = createShapeId();
    app.editor.createShape({ id: blockId, type: BLOCK_SHAPE_TYPE, x: 60, y: 160, props: { name: "refine()", view: "port", ports: { left: [], right: [], top: [], bottom: [] } } } as never);
    const header = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${blockId}"] [data-slot="block-header"]`), { what: "header" });
    const regionEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${regionId}"]`), { what: "region" });
    const target = centreOf(regionEl);
    await userEvent.dragAndDrop(header, canvasOf(app.root), { sourcePosition: { x: 4, y: 4 }, targetPosition: { x: target.x, y: target.y + 40 } });
    await waitFor(() => (app!.editor.getShape(blockId) as BlockLike).parentId === regionId, { what: "re-parented into the region" });

    const scene = sceneFromRecords(app.editor.store.allRecords());
    const regionNode = scene.nodes.find((n) => n.id === regionId)!;
    expect(regionNode.type).toBe("region");
    expect(regionNode.definitionId).toBeUndefined();
    expect(scene.nodes.find((n) => n.id === blockId)?.parentId).toBe(regionId);
    expect(scene.edges).toHaveLength(0);
  });

  it("a region is never a wire target — a drag from a dot onto the region creates no wire", async () => {
    app = await mountApp();
    const regionId = createShapeId();
    app.editor.createShape({ id: regionId, type: REGION_SHAPE_TYPE, x: 400, y: 100, props: { kind: "plain", name: "", w: 300, h: 240 } } as never);
    const a = createShapeId();
    app.editor.createShape({ id: a, type: BLOCK_SHAPE_TYPE, x: 60, y: 160, props: { name: "a", view: "port", ports: { left: [], right: [{ id: "out", declaration: "out" }], top: [], bottom: [] } } } as never);
    const dot = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${a}"] [data-port-id="out"] [data-slot="port-dot"]`), { what: "dot" });
    const regionEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${regionId}"]`), { what: "region" });
    await userEvent.dragAndDrop(dot, regionEl);
    await new Promise((r) => setTimeout(r, 200));
    await userEvent.keyboard("{Escape}");
    expect(app.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE)).toHaveLength(0);
  });

  it("a branch region renders its arms as titled rows inside the frame, in order", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({
      id,
      type: REGION_SHAPE_TYPE,
      x: 200,
      y: 100,
      props: { kind: "branch", name: "Branch", w: 420, h: 400, arms: [{ id: "if", title: "if", open: true, h: 180 }, { id: "else", title: "else", open: true, h: 180 }] },
    } as never);
    const arms = await waitFor(() => {
      const rows = Array.from(app!.root.querySelectorAll<HTMLElement>(`[data-shape-id="${id}"] [data-slot="region-arm"]`));
      return rows.length === 2 ? rows : null;
    }, { what: "two arm rows" });
    expect(arms.map((el) => el.getAttribute("data-arm-id"))).toEqual(["if", "else"]);
    expect(arms[0].getBoundingClientRect().top).toBeLessThan(arms[1].getBoundingClientRect().top);
    expect(arms[0].textContent).toContain("if");
    expect(arms[1].textContent).toContain("else");
  });
});
