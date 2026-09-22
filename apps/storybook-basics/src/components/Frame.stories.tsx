/**
 * Blocks/Frame — the FRAME primitive alone (layer 1 of Zach's build-up,
 * 2026-09-22: "start with frame, add 4 port edges to all sides"). Sketch 1:
 * a bare frame, then the same frame with a port edge on each wall.
 *
 * Every toggle Zach named is a prop of `Frame` and a control INSIDE the
 * story below (never a URL flag): title above / header / none, frame drawn
 * or not, free vs stacked members, custom vs auto fit, a port edge on any
 * subset of walls, auto vs custom spacing per wall.
 *
 * The play functions MEASURE (`getBoundingClientRect`, `elementFromPoint`):
 * every rail's cross centre on its wall, every dot on its wall, the two
 * faces of a port sharing one box under ONE owner `[data-block-id]`, and a
 * press 15px outside the wall still landing on the port — the clip trap
 * `reports/blockregion-as-block-preset-2026-09-22.html` §8 measured.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { RAIL_END_MARGIN_PX } from "./blockPort.layout";
import { Frame, type FrameFit, type FrameTitlePlacement, type FrameWall } from "./frame";
import { innerFaceHandle } from "./frame.layout";
import { Label } from "./label";
import { BLOCK_SIDES, type BlockSide } from "./port.layout";
import type { PortEdgeItem } from "./portEdge";
import { Switch } from "./switch";

const meta = {
  title: "Blocks/Frame",
  tags: ["area:blocks", "lane:frame-auto-port-edges"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                 */
/* ------------------------------------------------------------------ */

const PX = 1;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The wall's line for `side`, in client px, off the box's border box. */
function wallLine(box: DOMRect, side: BlockSide): number {
  return side === "left" ? box.left : side === "right" ? box.right : side === "top" ? box.top : box.bottom;
}

function boxOf(frame: Element): DOMRect {
  return required<HTMLElement>(frame, '[data-slot="frame-box"]', "the frame box").getBoundingClientRect();
}

/** A point's distance to its wall's line — the cross-axis error. */
function offWall(point: { x: number; y: number }, box: DOMRect, side: BlockSide): number {
  const line = wallLine(box, side);
  return Math.abs((side === "left" || side === "right" ? point.x : point.y) - line);
}

const port = (id: string, type?: string): PortEdgeItem => ({ id, label: id, ...(type ? { type } : {}) });

/* ------------------------------------------------------------------ */
/* Sketch 1 — a bare frame, then four port edges                        */
/* ------------------------------------------------------------------ */

export const FrameAlone: Story = {
  name: "Frame alone — bare, then four port edges (sketch 1)",
  render: () => (
    <div style={{ display: "flex", gap: 48, alignItems: "flex-start", padding: 40 }}>
      <Frame id="bare" title="Frame" width={320} height={220} portEdges={[]} />
      <Frame id="edged" title="Frame" width={320} height={220} showPortEdgeLines />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const bare = await waitFor(() => required<HTMLElement>(canvasElement, '[data-frame-id="bare"]', "the bare frame"));
    const edged = required<HTMLElement>(canvasElement, '[data-frame-id="edged"]', "the edged frame");

    await step("The bare frame draws no rail; the edged one draws four, each centred on its wall", async () => {
      expect(bare.querySelectorAll('[data-slot="block-port-rail"]').length).toBe(0);
      await waitFor(() => expect(edged.querySelectorAll('[data-slot="block-port-rail"][data-rail-owner="edged"]').length).toBe(4));
      const box = boxOf(edged);
      for (const side of BLOCK_SIDES) {
        const rail = required<HTMLElement>(edged, `[data-slot="block-port-rail"][data-rail-owner="edged"][data-edge="${side}"]`, `${side} rail`);
        expect(offWall(centreOf(rail), box, side), `${side} rail's cross centre on the wall`).toBeLessThanOrEqual(PX);
        const line = required<HTMLElement>(edged, `[data-slot="frame-port-edge-line"][data-edge="${side}"]`, `${side} edge line`);
        expect(offWall(centreOf(line), box, side), `${side} line on the wall`).toBeLessThanOrEqual(PX + 1);
        // The line stops short of both corners by the rail's own clearance.
        const lineRect = line.getBoundingClientRect();
        if (side === "left" || side === "right") {
          expect(Math.abs(lineRect.top - (box.top + RAIL_END_MARGIN_PX))).toBeLessThanOrEqual(PX);
          expect(Math.abs(lineRect.bottom - (box.bottom - RAIL_END_MARGIN_PX))).toBeLessThanOrEqual(PX);
        } else {
          expect(Math.abs(lineRect.left - (box.left + RAIL_END_MARGIN_PX))).toBeLessThanOrEqual(PX);
          expect(Math.abs(lineRect.right - (box.right - RAIL_END_MARGIN_PX))).toBeLessThanOrEqual(PX);
        }
      }
    });

    await step("The title sits above the box, and the root is the one owner box", async () => {
      const title = required<HTMLElement>(edged, '[data-slot="frame-title"]', "the title");
      expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(boxOf(edged).top + PX);
      expect(edged.getAttribute("data-block-id")).toBe("edged");
      expect(canvasElement.querySelectorAll('[data-block-id="edged"]').length).toBe(1);
    });
  },
};

/**
 * The bare default primitive — `<Frame id="f" />`, nothing else — carries a
 * port edge on all four walls, ports or not (judge round 1, finding 6: it
 * rendered zero rails, because a wall with no `walls` entry was skipped
 * unless the edge lines were painted; `portEdges`' default of all four
 * promises otherwise, and an empty rail is the drop target a drag lands on).
 */
export const BareDefault: Story = {
  name: "Bare default — <Frame id> alone still carries four port edges",
  render: () => (
    <div style={{ padding: 40 }}>
      <Frame id="f" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frame = await waitFor(() => required<HTMLElement>(canvasElement, '[data-frame-id="f"]', "the frame"));
    await waitFor(() => expect(frame.querySelectorAll('[data-slot="block-port-rail"][data-rail-owner="f"]').length).toBe(4));
    const box = boxOf(frame);
    for (const side of BLOCK_SIDES) {
      const rail = required<HTMLElement>(frame, `[data-slot="block-port-rail"][data-rail-owner="f"][data-edge="${side}"]`, `${side} rail`);
      expect(offWall(centreOf(rail), box, side), `${side} rail's cross centre on the wall`).toBeLessThanOrEqual(PX);
      // An empty rail is a real `PortEdge` track — the drop target.
      expect(rail.querySelector('[data-slot="port-edge"]'), `${side} rail holds a PortEdge`).not.toBeNull();
    }
    expect(frame.querySelectorAll('[data-slot="port-dot"]').length).toBe(0);
  },
};

/* ------------------------------------------------------------------ */
/* Ports on every wall — two faces, one box, hit area intact            */
/* ------------------------------------------------------------------ */

const FOUR_WALLS: Partial<Record<BlockSide, FrameWall>> = {
  left: { items: [port("in1", "Pose"), port("in2", "float")] },
  right: { items: [port("out1", "Pose")] },
  top: { items: [port("ctl", "bool")] },
  bottom: { items: [port("log", "str"), port("err", "str")] },
};

export const PortsOnEveryWall: Story = {
  name: "Ports on every wall — two faces, one owner box, hit area past the wall",
  render: () => (
    // Padded so the left wall's outside — where the hit test presses — is
    // inside the viewport: `elementFromPoint` answers `null` for x < 0
    // (measured: the vitest runner renders the story flush left).
    <div style={{ padding: 40 }}>
      <Frame id="walls" title="Frame" width={360} height={240} walls={FOUR_WALLS} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const frame = await waitFor(() => required<HTMLElement>(canvasElement, '[data-frame-id="walls"]', "the frame"));
    await waitFor(() => expect(frame.querySelectorAll('[data-slot="port-dot"]').length).toBe(6));
    const box = boxOf(frame);

    await step("Every dot's centre is on its wall, inside the corner clearance", async () => {
      for (const side of BLOCK_SIDES) {
        for (const item of FOUR_WALLS[side]!.items) {
          const dot = required<HTMLElement>(frame, `[data-port-id="${item.id}"] [data-slot="port-dot"]`, `${item.id}'s dot`);
          const at = centreOf(dot);
          expect(offWall(at, box, side), `${item.id} on the ${side} wall`).toBeLessThanOrEqual(PX);
          const along = side === "left" || side === "right" ? at.y : at.x;
          const start = side === "left" || side === "right" ? box.top : box.left;
          const end = side === "left" || side === "right" ? box.bottom : box.right;
          expect(along).toBeGreaterThanOrEqual(start + RAIL_END_MARGIN_PX - PX);
          expect(along).toBeLessThanOrEqual(end - RAIL_END_MARGIN_PX + PX);
        }
      }
    });

    await step("Each port's inner face is a second [data-port-id] on the SAME box, facing the opposite wall", async () => {
      for (const side of BLOCK_SIDES) {
        for (const item of FOUR_WALLS[side]!.items) {
          const outer = required<HTMLElement>(frame, `[data-slot="block-port-item"][data-port-id="${item.id}"]`, `${item.id}`);
          const inner = required<HTMLElement>(frame, `[data-port-id="${innerFaceHandle(item.id)}"]`, `${item.id}'s inner face`);
          const a = required<HTMLElement>(outer, '[data-slot="port-dot"]', "dot").getBoundingClientRect();
          const b = inner.getBoundingClientRect();
          expect(Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)), `${item.id} faces share a centre (x)`).toBeLessThanOrEqual(PX);
          expect(Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)), `${item.id} faces share a centre (y)`).toBeLessThanOrEqual(PX);
          // The rail each face reads its direction from (`wireLayer.tsx`'s `railEdgeOf`).
          const outerEdge = required<HTMLElement>(outer, '[data-slot="port-dot"]', "dot").closest('[data-slot="block-port-rail"]')!.getAttribute("data-edge");
          const innerEdge = inner.closest('[data-slot="block-port-rail"]')!.getAttribute("data-edge");
          expect(outerEdge).toBe(side);
          expect(innerEdge).toBe(side === "left" ? "right" : side === "right" ? "left" : side === "top" ? "bottom" : "top");
          // Both faces resolve under the one owner box.
          expect(inner.closest("[data-block-id]")).toBe(frame);
          expect(outer.closest("[data-block-id]")).toBe(frame);
        }
      }
      expect(canvasElement.querySelectorAll('[data-block-id="walls"]').length).toBe(1);
    });

    await step("A press 15px OUTSIDE the wall still lands on the port — the frame does not clip the hit halo", async () => {
      const dot = required<HTMLElement>(frame, '[data-port-id="in1"] [data-slot="port-dot"]', "in1's dot");
      const at = centreOf(dot);
      const hit = document.elementFromPoint(at.x - 15, at.y);
      expect(hit, "something is under the point").not.toBeNull();
      expect(hit!.closest("[data-port-id]")?.getAttribute("data-port-id"), "the port took the hit").toBe("in1");
      const right = required<HTMLElement>(frame, '[data-port-id="out1"] [data-slot="port-dot"]', "out1's dot");
      const atRight = centreOf(right);
      expect(document.elementFromPoint(atRight.x + 15, atRight.y)?.closest("[data-port-id]")?.getAttribute("data-port-id")).toBe("out1");
    });
  },
};

/* ------------------------------------------------------------------ */
/* The toggles — every behaviour Zach named, switchable in the story    */
/* ------------------------------------------------------------------ */

function childMember(id: string, x: number, y: number): BlockMember {
  return { id, x, y, content: <Block width={120} header={id} /> };
}

const MEMBERS = [childMember("child A", 96, 20), childMember("child B", 180, 96)];

function Toggles() {
  const [placement, setPlacement] = useState<FrameTitlePlacement>("above");
  const [surface, setSurface] = useState(true);
  const [layout, setLayout] = useState<"free" | "stack">("free");
  const [fit, setFit] = useState<FrameFit>("custom");
  const [edges, setEdges] = useState<BlockSide[]>([...BLOCK_SIDES]);
  const [arrange, setArrange] = useState<"auto" | "custom">("auto");
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [lines, setLines] = useState(true);
  const toggleEdge = (side: BlockSide) => setEdges((current) => (current.includes(side) ? current.filter((s) => s !== side) : [...current, side]));
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", padding: 24 }}>
      <div data-slot="frame-toggles" style={{ display: "grid", gap: 10, fontSize: 12, minWidth: 220 }}>
        <Label>
          title placement
          <select data-testid="title-placement" value={placement} onChange={(event) => setPlacement(event.target.value as FrameTitlePlacement)} style={{ marginLeft: 6 }}>
            <option value="above">above</option>
            <option value="header">header</option>
            <option value="none">none</option>
          </select>
        </Label>
        <Label>
          <Switch data-testid="surface" checked={surface} onCheckedChange={setSurface} /> draw the frame
        </Label>
        <Label>
          members
          <select data-testid="members-layout" value={layout} onChange={(event) => setLayout(event.target.value as "free" | "stack")} style={{ marginLeft: 6 }}>
            <option value="free">free</option>
            <option value="stack">stack</option>
          </select>
        </Label>
        <Label>
          fit
          <select data-testid="fit" value={fit} onChange={(event) => setFit(event.target.value as FrameFit)} style={{ marginLeft: 6 }}>
            <option value="custom">custom (320 × 200)</option>
            <option value="auto">auto (hug members)</option>
          </select>
        </Label>
        <Label>
          spacing
          <select data-testid="arrange" value={arrange} onChange={(event) => setArrange(event.target.value as "auto" | "custom")} style={{ marginLeft: 6 }}>
            <option value="auto">auto</option>
            <option value="custom">custom</option>
          </select>
        </Label>
        <Label>
          <Switch data-testid="lines" checked={lines} onCheckedChange={setLines} /> port edge lines
        </Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {BLOCK_SIDES.map((side) => (
            <Label key={side}>
              <Switch data-testid={`edge-${side}`} checked={edges.includes(side)} onCheckedChange={() => toggleEdge(side)} /> {side}
            </Label>
          ))}
        </div>
      </div>
      <Frame
        id="toggles"
        title="Frame"
        titlePlacement={placement}
        surface={surface ? "frame" : "none"}
        width={320}
        height={200}
        fit={fit}
        members={MEMBERS}
        membersLayout={layout}
        portEdges={edges}
        showPortEdgeLines={lines}
        walls={{
          left: { items: [port("in1", "Pose"), port("in2", "float"), port("in3", "int")], arrange, offsets, onOffsetsChange: setOffsets },
          right: { items: [port("out1", "Pose")] },
        }}
      />
    </div>
  );
}

/** The same bench with no play function — the one to try by hand (the
 *  play below leaves the frame in its last toggled state). */
export const EveryToggleTryIt: Story = {
  name: "Every toggle — try it",
  render: () => <Toggles />,
};

export const EveryToggle: Story = {
  name: "Every toggle — title, surface, members, fit, edges, spacing",
  render: () => <Toggles />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const frame = await waitFor(() => required<HTMLElement>(canvasElement, '[data-frame-id="toggles"]', "the frame"));
    await waitFor(() => expect(frame.querySelectorAll('[data-slot="port-dot"]').length).toBe(4));

    await step("Title as a HEADER: the left rail's ports drop into the body band, under the header", async () => {
      // Box-relative, not client px: moving the title inside removes the row
      // above the box, so the box itself shifts up by that row's height
      // (measured: client y read 77 before AND after).
      const before = centreOf(required<HTMLElement>(frame, '[data-port-id="in1"] [data-slot="port-dot"]', "in1")).y - boxOf(frame).top;
      await userEvent.selectOptions(canvas.getByTestId("title-placement"), "header");
      await waitFor(() => {
        const header = required<HTMLElement>(frame, '[data-slot="frame-header"]', "the header bar");
        const afterClient = centreOf(required<HTMLElement>(frame, '[data-port-id="in1"] [data-slot="port-dot"]', "in1")).y;
        const after = afterClient - boxOf(frame).top;
        expect(afterClient).toBeGreaterThan(header.getBoundingClientRect().bottom);
        expect(after).toBeGreaterThan(before + 20);
        // The TOP wall still spans the whole box — a header does not shorten it.
        const top = required<HTMLElement>(frame, '[data-slot="frame-port-edge-line"][data-edge="top"]', "top line").getBoundingClientRect();
        expect(Math.abs(top.left - (boxOf(frame).left + RAIL_END_MARGIN_PX))).toBeLessThanOrEqual(PX);
      });
      await userEvent.selectOptions(canvas.getByTestId("title-placement"), "above");
    });

    await step("Fit AUTO: the box grows to hold both members plus padding", async () => {
      const before = boxOf(frame);
      expect(before.width).toBeCloseTo(320, 0);
      await userEvent.selectOptions(canvas.getByTestId("fit"), "auto");
      await waitFor(() => {
        const box = boxOf(frame);
        const members = Array.from(frame.querySelectorAll<HTMLElement>('[data-slot="block-member"]')).map((m) => m.getBoundingClientRect());
        const right = Math.max(...members.map((m) => m.right));
        const bottom = Math.max(...members.map((m) => m.bottom));
        expect(box.right).toBeGreaterThanOrEqual(right + 12 - PX);
        expect(box.bottom).toBeGreaterThanOrEqual(bottom + 12 - PX);
        expect(frame.getAttribute("data-fit")).toBe("auto");
      });
      await userEvent.selectOptions(canvas.getByTestId("fit"), "custom");
      await waitFor(() => expect(boxOf(frame).width).toBeCloseTo(320, 0));
    });

    await step("Members STACK: the two children become an ordered column", async () => {
      await userEvent.selectOptions(canvas.getByTestId("members-layout"), "stack");
      await waitFor(() => {
        const [a, b] = Array.from(frame.querySelectorAll<HTMLElement>('[data-slot="block-member"]')).map((m) => m.getBoundingClientRect());
        expect(Math.abs(a.left - b.left)).toBeLessThanOrEqual(PX);
        expect(b.top).toBeGreaterThanOrEqual(a.bottom);
        expect(frame.getAttribute("data-members-layout")).toBe("stack");
      });
      await userEvent.selectOptions(canvas.getByTestId("members-layout"), "free");
    });

    await step("Port edges per wall: switching the right wall off removes its rail and its port", async () => {
      await userEvent.click(canvas.getByTestId("edge-right"));
      await waitFor(() => {
        expect(frame.querySelector('[data-slot="block-port-rail"][data-rail-owner="toggles"][data-edge="right"]')).toBeNull();
        expect(frame.querySelector('[data-port-id="out1"]')).toBeNull();
      });
      await userEvent.click(canvas.getByTestId("edge-right"));
      await waitFor(() => expect(frame.querySelector('[data-port-id="out1"]')).not.toBeNull());
    });

    await step("Spacing CUSTOM keeps the auto snapshot, then the left rail reports custom", async () => {
      const before = ["in1", "in2", "in3"].map((id) => centreOf(required<HTMLElement>(frame, `[data-port-id="${id}"] [data-slot="port-dot"]`, id)).y);
      await userEvent.selectOptions(canvas.getByTestId("arrange"), "custom");
      await waitFor(() => {
        expect(required<HTMLElement>(frame, '[data-slot="block-port-rail"][data-rail-owner="toggles"][data-edge="left"]', "left rail").getAttribute("data-arrange")).toBe("custom");
        const after = ["in1", "in2", "in3"].map((id) => centreOf(required<HTMLElement>(frame, `[data-port-id="${id}"] [data-slot="port-dot"]`, id)).y);
        // Entering custom snapshots the auto layout: nothing moves.
        after.forEach((y, i) => expect(Math.abs(y - before[i])).toBeLessThanOrEqual(PX));
      });
    });

    await step("Frame OFF: no border is painted; the rails stay", async () => {
      await userEvent.click(canvas.getByTestId("surface"));
      await waitFor(() => {
        expect(frame.getAttribute("data-surface")).toBe("none");
        const box = required<HTMLElement>(frame, '[data-slot="frame-box"]', "box");
        expect(getComputedStyle(box).borderTopColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        expect(frame.querySelectorAll('[data-slot="block-port-rail"][data-rail-owner="toggles"]').length).toBe(4);
      });
    });
  },
};
