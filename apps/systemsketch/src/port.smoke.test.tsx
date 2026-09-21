// src/port.smoke.test.tsx — L2's acceptance: an ss-port shape renders the
// trunk's LabeledPort, measures exactly one anchor (FLOATING_PORT_ID) onto
// its dot, is a system-family tool, and its label edits inline. Committed
// with the plan (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L2), off-limits to
// builders.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { FLOATING_PORT_ID, PORT_SHAPE_TYPE, PORT_TOOL_ID } from "./shapes/types";
import { centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface PortShapeLike {
  id: TLShapeId;
  props: { declaration: string; direction: "in" | "out"; anchors: { portId: string; x: number; y: number; side: string | null }[] };
}

describe("L2 — floating port shape", () => {
  it("is a system-family tool", async () => {
    app = await mountApp();
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "system face" });
    const chevron = face.parentElement?.querySelector<HTMLElement>("[aria-haspopup]") ?? face;
    await userEvent.click(chevron);
    const row = await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => /^\s*port\s*$/i.test(el.textContent ?? "")), { what: "a Port row" });
    await userEvent.click(row);
    await waitFor(() => app!.editor.getCurrentToolId() === PORT_TOOL_ID, { what: "the port tool is current" });
  });

  it("renders the trunk LabeledPort, measures its single anchor onto the dot, and carries its declaration literally", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 200, y: 160, props: { declaration: "gain_x  : float", direction: "in" } } as never);

    const dot = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port"] [data-slot="port-dot"]`), { what: "the LabeledPort's dot" });
    const label = app.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`);
    // Truthful rendering: the two painted runs reassemble the authored line
    // byte for byte — trailing spaces inside the name, colon included.
    expect(label?.textContent).toBe("gain_x  : float");

    const anchors = await waitFor(() => {
      const live = app!.editor.getShape(id) as PortShapeLike;
      return live.props.anchors.length === 1 ? live.props.anchors : null;
    }, { what: "one anchor measured" });
    expect(anchors[0].portId).toBe(FLOATING_PORT_ID);
    const page = app.editor.getShapePageTransform(id).applyToPoint({ x: anchors[0].x, y: anchors[0].y });
    const screen = app.editor.pageToScreen(page);
    const actual = centreOf(dot);
    expect(Math.abs(screen.x - actual.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(screen.y - actual.y)).toBeLessThanOrEqual(3);
  });

  it("direction decides which side the dot sits on (in → dot left of label; out → dot right of label)", async () => {
    app = await mountApp();
    const mk = (direction: "in" | "out", y: number) => {
      const id = createShapeId();
      app!.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 100, y, props: { declaration: "p", direction } } as never);
      return id;
    };
    const inId = mk("in", 100);
    const outId = mk("out", 200);
    const geometry = async (id: TLShapeId) => {
      const dot = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-dot"]`), { what: "dot" });
      const label = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`)!;
      return { dot: centreOf(dot).x, label: centreOf(label).x };
    };
    const a = await geometry(inId);
    const b = await geometry(outId);
    expect(a.dot).toBeLessThan(a.label);
    expect(b.dot).toBeGreaterThan(b.label);
  });

  it("double-click edits the declaration inline and writes it back", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 200, y: 160, props: { declaration: "old", direction: "out" } } as never);
    const label = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "label" });
    await userEvent.dblClick(label);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "editing the port" });
    // The TYPE is typed here too, which is the whole of ruling 8: before the
    // collapse `props.type` had no writer in the app at all, so this keystroke
    // could not have existed.
    await userEvent.keyboard("{Control>}a{/Control}new_name: float{Enter}");
    await waitFor(() => (app!.editor.getShape(id) as PortShapeLike).props.declaration === "new_name: float", { what: "declaration written back" });
  });
});
