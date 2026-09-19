// src/app.smoke.test.tsx — L0's acceptance: the app opens on stock tldraw,
// the dock has ONE system slot, pressing it arms the Block tool, a click on
// the canvas places an ss-block that renders the trunk's Block, and the
// measured anchors land where the rendered dots are. Committed with the
// plan (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L0), off-limits to builders.
//
// Real input: `userEvent` is Playwright-backed under
// @vitest/browser-playwright, so tldraw sees the same pointerdown/mousedown
// pairs a person produces (hosts/hostGestures.ts:1-18 on why pointer-only
// synthetic events are a vacuous gesture against a canvas engine).
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import type { TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE, BLOCK_TOOL_ID } from "./shapes/types";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface BlockShapeLike {
  id: TLShapeId;
  type: string;
  x: number;
  y: number;
  props: { w: number; h: number; ports: Record<string, { id: string; name: string; type: string }[]>; anchors: { portId: string; x: number; y: number; side: string | null }[] };
}

describe("L0 — the app is stock tldraw with one system slot", () => {
  it("mounts stock tldraw chrome and the trunk's ToolDock as the toolbar, with exactly one system family", async () => {
    app = await mountApp();
    const dock = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="tool-dock"]'), { what: "the ToolDock" });
    // Exactly ONE system-family face (Zach: "lets just have the 1 icon").
    expect(dock.querySelectorAll('[data-testid="ss-dock-family-system"]')).toHaveLength(1);
    expect(dock.querySelector('[data-testid="ss-dock-family-bbox"]')).toBeNull();
    // The select tool is the resting tool, and it is a real cell.
    expect(dock.querySelector('[data-testid="ss-dock-tool-select"]')).not.toBeNull();
    expect(app.editor.getCurrentToolId()).toBe("select");
    // Stock chrome the app never replaced is still there — the engine is intact.
    expect(app.root.querySelector(".tl-canvas")).not.toBeNull();
  });

  it("pressing the system face arms the Block tool; a canvas click places an ss-block that renders the trunk Block", async () => {
    app = await mountApp();
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "the system face" });
    await userEvent.click(face);
    await waitFor(() => app!.editor.getCurrentToolId() === BLOCK_TOOL_ID, { what: `current tool === ${BLOCK_TOOL_ID}` });

    const canvas = canvasOf(app.root);
    const rect = canvas.getBoundingClientRect();
    const at = { x: Math.round(rect.width * 0.45), y: Math.round(rect.height * 0.45) };
    await userEvent.click(canvas, { position: at });

    const shape = await waitFor(
      () => app!.editor.getCurrentPageShapes().find((s) => s.type === BLOCK_SHAPE_TYPE) as BlockShapeLike | undefined,
      { what: "an ss-block on the page" },
    );
    // The face is the trunk's own Block (data-slot stamped by components/block.tsx:245).
    const el = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${shape.id}"] [data-slot="block"]`), { what: "the rendered Block face" });
    expect(el.getBoundingClientRect().width).toBeGreaterThan(40);
    // Measured w/h are written back into props (tldrawHost.tsx:247-258's rule), never left at the tool's 1x1 placeholder.
    await waitFor(() => {
      const live = app!.editor.getShape(shape.id) as BlockShapeLike;
      return live.props.w > 40 && live.props.h > 20;
    }, { what: "measured w/h in props" });
    // The tool returns to select after a click-create (BaseBoxShapeTool's stock behaviour).
    await waitFor(() => app!.editor.getCurrentToolId() === "select", { what: "back to select" });
  });

  it("ports given as props render as dots and their measured anchors land on the dots (shape-local, survives zoom)", async () => {
    app = await mountApp();
    const id = app.editor.createShapeId();
    app.editor.createShape({
      id,
      type: BLOCK_SHAPE_TYPE,
      x: 120,
      y: 80,
      props: {
        name: "estimate()",
        view: "port",
        ports: { left: [{ id: "frame", name: "frame", type: "Frame" }], right: [{ id: "pose", name: "Pose", type: "Pose" }], top: [], bottom: [] },
      },
    } as never);

    const dots = await waitFor(() => {
      const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
      const frame = wrap?.querySelector<HTMLElement>('[data-port-id="frame"] [data-slot="port-dot"]');
      const pose = wrap?.querySelector<HTMLElement>('[data-port-id="pose"] [data-slot="port-dot"]');
      return frame && pose ? { frame, pose } : null;
    }, { what: "both port dots rendered" });

    const measured = await waitFor(() => {
      const live = app!.editor.getShape(id) as BlockShapeLike;
      return live.props.anchors.length === 2 ? live.props.anchors : null;
    }, { what: "two anchors measured into props" });

    const check = () => {
      const live = app!.editor.getShape(id) as BlockShapeLike;
      const transform = app!.editor.getShapePageTransform(id);
      for (const [portId, dot] of [["frame", dots.frame], ["pose", dots.pose]] as const) {
        const anchor = live.props.anchors.find((a) => a.portId === portId)!;
        const page = transform.applyToPoint({ x: anchor.x, y: anchor.y });
        const screen = app!.editor.pageToScreen(page);
        const actual = centreOf(dot);
        expect(Math.abs(screen.x - actual.x), `${portId}.x`).toBeLessThanOrEqual(3);
        expect(Math.abs(screen.y - actual.y), `${portId}.y`).toBeLessThanOrEqual(3);
      }
    };
    check();
    expect(measured.find((a) => a.portId === "frame")?.side).toBe("left");
    expect(measured.find((a) => a.portId === "pose")?.side).toBe("right");

    // Zoom the camera: anchors are shape-local numbers, so the projection still lands on the dots without re-measuring.
    app.editor.setCamera({ x: -40, y: -20, z: 1.6 });
    await new Promise((r) => setTimeout(r, 120));
    check();
  });

  it("dragging a block by its header moves it (drag from cold, no prior selection); pressing its port rail does not", async () => {
    app = await mountApp();
    const id = app.editor.createShapeId();
    app.editor.createShape({
      id,
      type: BLOCK_SHAPE_TYPE,
      x: 100,
      y: 100,
      props: { name: "mover", view: "port", ports: { left: [{ id: "in", name: "in", type: "" }], right: [], top: [], bottom: [] } },
    } as never);
    const header = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="block-header"]`), { what: "the header" });
    const from = centreOf(header);
    await userEvent.dragAndDrop(header, canvasOf(app.root), { sourcePosition: { x: 4, y: 4 }, targetPosition: { x: from.x + 80, y: from.y + 60 } });
    await waitFor(() => {
      const live = app!.editor.getShape(id)!;
      return live.x > 130 && live.y > 130;
    }, { what: "the block moved by the header drag" });

    const rail = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="block-port-rail"]`), { what: "a port rail" });
    const before = app.editor.getShape(id)!;
    const railAt = centreOf(rail);
    await userEvent.dragAndDrop(rail, canvasOf(app.root), { targetPosition: { x: railAt.x + 60, y: railAt.y + 60 } });
    await new Promise((r) => setTimeout(r, 150));
    const after = app.editor.getShape(id)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });
});
