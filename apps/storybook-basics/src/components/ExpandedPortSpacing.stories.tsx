import { useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Badge } from "./badge";
import { Bar } from "./bar";
import { Block } from "./block";
import { BlockPort } from "./blockPort";
import { PORT_EDGE_SLOT_MIN_PX } from "./blockPort.layout";
import type { BlockMember } from "./blockMembers";
import type { PortEdgeArrangeMode, PortEdgeItem } from "./portEdge";
import { MIN_PORT_GAP_PX, type CustomNeighbourMode } from "./portSpacing.layout";

/**
 * Blocks/Expanded port spacing — Auto vs Custom.
 *
 * Zach, 2026-09-22: "Prototype toggle between auto and custom spacing on the
 * expanded port edge ... in custom: You just need to respect the ordering of
 * ports — and there is a minimum spacing requirement as well". His sketch
 * ("IN expanded view I want the ability to switch between custom or ordered
 * ports"): an expanded block titled "Title Type", three "Child Member"
 * boxes (one with its own `port Any`), four `port Any` on the left wall and
 * two on the right. Auto spreads them; Custom holds them at author-chosen
 * heights, with a "Min space requirement" bracket between two close ones.
 *
 * The toggle is `PortEdge`'s own per-edge `mode` (forwarded by `BlockPort`
 * through `portEdgeProps`), so each wall switches on its own. The rules live
 * in `portSpacing.layout.ts`; this file proves them on a real rendered
 * block — every claim is a `getBoundingClientRect` reading of a port dot,
 * taken around a real `@dnd-kit/core` `PointerSensor` drag.
 */

/* ------------------------------------------------------------------ */
/* Fixture — the sketch                                                */
/* ------------------------------------------------------------------ */

const LEFT_PORTS: PortEdgeItem[] = ["in1", "in2", "in3", "in4"].map((id) => ({ id, label: "port", type: "Any" }));
const RIGHT_PORTS: PortEdgeItem[] = ["out1", "out2"].map((id) => ({ id, label: "port", type: "Any" }));

const BLOCK_WIDTH = 340;
const BLOCK_HEIGHT = 420;
/** Wide enough that the inward `port Any` labels sit between the wall and
 *  the members, as the sketch draws them. */
const MEMBER_GUTTER = 76;

function ChildMember({ withPort }: { withPort?: boolean }) {
  const face = <Block header="Child Member" width={BLOCK_WIDTH - 2 * MEMBER_GUTTER} height={72} />;
  if (!withPort) return face;
  return (
    <BlockPort id="child-with-port" view="port" edges={{ left: { items: [{ id: "child-in", label: "port", type: "Any" }] } }}>
      {face}
    </BlockPort>
  );
}

const MEMBERS: BlockMember[] = [
  { id: "m1", content: <ChildMember /> },
  { id: "m2", content: <ChildMember withPort /> },
  { id: "m3", content: <ChildMember /> },
];

/* ------------------------------------------------------------------ */
/* Story-local controls                                                */
/* ------------------------------------------------------------------ */

function Segmented<T extends string>({ slot, options, value, onChange }: { slot: string; options: { value: T; label: string }[]; value: T; onChange(v: T): void }) {
  return (
    <div data-slot={slot} style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", width: "max-content" }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-value={option.value}
          data-selected={value === option.value || undefined}
          onClick={() => onChange(option.value)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            background: value === option.value ? "var(--accent)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)", width: 92 }}>{label}</span>
      {children}
    </div>
  );
}

const MODE_OPTIONS: { value: PortEdgeArrangeMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "custom", label: "Custom" },
];

const NEIGHBOUR_OPTIONS: { value: CustomNeighbourMode; label: string }[] = [
  { value: "stop", label: "Stop at neighbour" },
  { value: "push", label: "Push neighbours" },
];

function SmallButton({ testId, onClick, children }: { testId: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{ padding: "3px 8px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The demo                                                            */
/* ------------------------------------------------------------------ */

interface DemoProps {
  initialMode?: PortEdgeArrangeMode;
  initialNeighbour?: CustomNeighbourMode;
  initialLeftOffsets?: Record<string, number>;
  initialRightOffsets?: Record<string, number>;
}

function ExpandedPortSpacingDemo({ initialMode = "auto", initialNeighbour = "stop", initialLeftOffsets = {}, initialRightOffsets = {} }: DemoProps) {
  const [leftMode, setLeftMode] = useState<PortEdgeArrangeMode>(initialMode);
  const [rightMode, setRightMode] = useState<PortEdgeArrangeMode>(initialMode);
  const [neighbour, setNeighbour] = useState<CustomNeighbourMode>(initialNeighbour);
  const [left, setLeft] = useState(LEFT_PORTS);
  const [right, setRight] = useState(RIGHT_PORTS);
  // Each wall's Custom layout lives HERE, in the host, and outlives a trip
  // through Auto — that is what lets Custom -> Auto -> Custom restore it.
  const [leftOffsets, setLeftOffsets] = useState(initialLeftOffsets);
  const [rightOffsets, setRightOffsets] = useState(initialRightOffsets);
  const [added, setAdded] = useState(0);

  const addLeft = () => {
    const id = `new${added + 1}`;
    setAdded(added + 1);
    // Inserted second from the top — between two ports, the case where a
    // new port has to find room rather than simply append.
    setLeft([left[0], { id, label: "port", type: "Any" }, ...left.slice(1)]);
  };
  const removeLeft = () => setLeft(left.slice(0, -1));
  const moveFirstDown = () => setLeft(left.length < 2 ? left : [left[1], left[0], ...left.slice(2)]);

  return (
    <div style={{ display: "flex", gap: 48, padding: "32px 48px", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Labelled label="Left wall">
          <Segmented<PortEdgeArrangeMode> slot="mode-left" options={MODE_OPTIONS} value={leftMode} onChange={setLeftMode} />
        </Labelled>
        <Labelled label="Right wall">
          <Segmented<PortEdgeArrangeMode> slot="mode-right" options={MODE_OPTIONS} value={rightMode} onChange={setRightMode} />
        </Labelled>
        <Labelled label="At a neighbour">
          <Segmented<CustomNeighbourMode> slot="neighbour" options={NEIGHBOUR_OPTIONS} value={neighbour} onChange={setNeighbour} />
        </Labelled>
        <Labelled label="Left ports">
          <div style={{ display: "flex", gap: 6 }}>
            <SmallButton testId="add-left" onClick={addLeft}>
              Add
            </SmallButton>
            <SmallButton testId="remove-left" onClick={removeLeft}>
              Remove last
            </SmallButton>
            <SmallButton testId="move-left" onClick={moveFirstDown}>
              Move first down
            </SmallButton>
          </div>
        </Labelled>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 360 }}>
          Custom: drag a port along its wall. It keeps its order, stays {MIN_PORT_GAP_PX}px (centre to centre) from its neighbours, and stays inside the
          body.
        </span>
      </div>
      <BlockPort
        id="title-type"
        view="expanded"
        edges={{
          left: { items: left, onItemsChange: setLeft, portEdgeProps: { mode: leftMode, freeOffsets: leftOffsets, onFreeOffsetsChange: setLeftOffsets, customNeighbour: neighbour } },
          right: { items: right, onItemsChange: setRight, portEdgeProps: { mode: rightMode, freeOffsets: rightOffsets, onFreeOffsetsChange: setRightOffsets, customNeighbour: neighbour } },
        }}
      >
        <Block
          header={<Bar size="md" left={<span>Title</span>} right={<Badge variant="secondary">Type</Badge>} />}
          width={BLOCK_WIDTH}
          height={BLOCK_HEIGHT}
          members={MEMBERS}
          membersLayout="stack"
          memberGutter={MEMBER_GUTTER}
        />
      </BlockPort>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement + a real drag                                           */
/* ------------------------------------------------------------------ */

type Wall = "left" | "right";

function outerWrapper(canvasElement: HTMLElement): HTMLElement {
  const found = canvasElement.querySelector<HTMLElement>('[data-slot="block-port"][data-block-id="title-type"]');
  if (!found) throw new Error("expected the expanded block's BlockPort");
  return found;
}

function railOf(canvasElement: HTMLElement, wall: Wall): HTMLElement {
  const found = outerWrapper(canvasElement).querySelector<HTMLElement>(`:scope > [data-slot="block-port-rail"][data-edge="${wall}"]`);
  if (!found) throw new Error(`expected the ${wall} rail`);
  return found;
}

function dotOf(canvasElement: HTMLElement, wall: Wall, portId: string): HTMLElement {
  const found = railOf(canvasElement, wall).querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`);
  if (!found) throw new Error(`expected port ${portId} on the ${wall} rail`);
  return found;
}

function centreOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Every port's dot centre on a wall, in the wall's rendered (track) order. */
function wallCentres(canvasElement: HTMLElement, wall: Wall): { id: string; x: number; y: number }[] {
  return Array.from(railOf(canvasElement, wall).querySelectorAll<HTMLElement>("[data-port-id]")).map((item) => {
    const dot = item.querySelector('[data-slot="port-dot"]');
    if (!dot) throw new Error(`port ${item.dataset.portId} has no dot`);
    return { id: item.dataset.portId ?? "", ...centreOf(dot) };
  });
}

/** The span a dot centre may occupy: the body band (header bottom -> block
 *  bottom, no footer here), inset half a slot at each end. Read off the
 *  Block itself, independently of the component's own band maths. */
function centreSpan(canvasElement: HTMLElement): { min: number; max: number } {
  const block = outerWrapper(canvasElement).querySelector<HTMLElement>(':scope > [data-slot="block"]');
  const header = block?.querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
  if (!block || !header) throw new Error("expected the block and its header");
  return { min: header.getBoundingClientRect().bottom + PORT_EDGE_SLOT_MIN_PX / 2, max: block.getBoundingClientRect().bottom - PORT_EDGE_SLOT_MIN_PX / 2 };
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) throw new Error(`${what} — measured ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px (±${tolerance}px)`);
}

/** Rule 3, all of it, measured: order by id, gap >= minimum, inside the span. */
function expectCustomRulesHold(canvasElement: HTMLElement, wall: Wall, expectedOrder: string[], what: string): void {
  const centres = wallCentres(canvasElement, wall);
  const span = centreSpan(canvasElement);
  const byId = new Map(centres.map((c) => [c.id, c]));
  const ys = expectedOrder.map((id) => {
    const found = byId.get(id);
    if (!found) throw new Error(`${what} — port ${id} is not on the ${wall} wall`);
    return found.y;
  });
  for (let i = 1; i < ys.length; i++) {
    const gap = ys[i] - ys[i - 1];
    if (!(gap >= MIN_PORT_GAP_PX - 0.5)) {
      throw new Error(`${what} — ${expectedOrder[i - 1]} -> ${expectedOrder[i]} centre gap ${gap.toFixed(2)}px, below the ${MIN_PORT_GAP_PX}px minimum (or out of order)`);
    }
  }
  ys.forEach((y, i) => {
    if (!(y >= span.min - 0.5 && y <= span.max + 0.5)) {
      throw new Error(`${what} — ${expectedOrder[i]} centre at ${y.toFixed(2)}px, outside the body span ${span.min.toFixed(2)}..${span.max.toFixed(2)}`);
    }
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A genuine `@dnd-kit/core` `PointerSensor` drag on a port dot — the same
 * technique `PortEdge.stories.tsx`'s `dragCard` documents (`isPrimary: true`
 * is load-bearing). `dx` is deliberately non-zero in callers: the pointer
 * wanders sideways and the port must not. `whileHeld` runs with the button
 * still down, which is when the min-gap marker exists.
 */
async function dragDot(dot: Element, dy: number, options: { dx?: number; whileHeld?: () => Promise<void> } = {}): Promise<void> {
  const fire = (type: string, x: number, y: number) =>
    dot.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }));
  const start = centreOf(dot);
  const dx = options.dx ?? 0;
  fire("pointerdown", start.x, start.y);
  await pause(30);
  fire("pointermove", start.x, start.y + Math.sign(dy || 1) * 6); // clears the 4px activation constraint
  await pause(30);
  fire("pointermove", start.x + dx / 2, start.y + dy / 2);
  await pause(30);
  fire("pointermove", start.x + dx, start.y + dy);
  await pause(60);
  if (options.whileHeld) await options.whileHeld();
  fire("pointerup", start.x + dx, start.y + dy);
  await pause(80);
}

async function clickOption(canvasElement: HTMLElement, slot: string, value: string): Promise<void> {
  const button = canvasElement.querySelector<HTMLElement>(`[data-slot="${slot}"] [data-value="${value}"]`);
  if (!button) throw new Error(`expected the ${slot} option ${value}`);
  button.click();
  await pause(60);
}

function snapshot(canvasElement: HTMLElement, wall: Wall): Record<string, number> {
  return Object.fromEntries(wallCentres(canvasElement, wall).map((c) => [c.id, c.y]));
}

function expectSameLayout(actual: Record<string, number>, expected: Record<string, number>, tolerance: number, what: string): void {
  for (const [id, y] of Object.entries(expected)) expectWithin(actual[id], y, tolerance, `${what} — ${id}`);
}

/** Auto: `space-evenly` across the body band — equal pitch AND an end gap
 *  equal to the between-gap (what separates it from `space-between`). */
function expectAutoEven(canvasElement: HTMLElement, wall: Wall): void {
  const ys = wallCentres(canvasElement, wall).map((c) => c.y);
  const pitches = ys.slice(1).map((y, i) => y - ys[i]);
  const span = centreSpan(canvasElement);
  const pitch = pitches[0];
  for (const p of pitches) expectWithin(p, pitch, 1, `auto — ${wall} pitch`);
  const bandTop = span.min - PORT_EDGE_SLOT_MIN_PX / 2;
  const bandBottom = span.max + PORT_EDGE_SLOT_MIN_PX / 2;
  expectWithin(ys[0] - bandTop, pitch - PORT_EDGE_SLOT_MIN_PX / 2, 1, `auto — ${wall} top end gap equals the between-gap`);
  expectWithin(bandBottom - ys[ys.length - 1], pitch - PORT_EDGE_SLOT_MIN_PX / 2, 1, `auto — ${wall} bottom end gap equals the between-gap`);
}

function minGapMarkers(canvasElement: HTMLElement, wall: Wall): HTMLElement[] {
  return Array.from(railOf(canvasElement, wall).querySelectorAll<HTMLElement>('[data-slot="port-edge-min-gap"]'));
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

const meta = {
  title: "Components/Blocks/BlockPort/Port Spacing",
  tags: ["object:block", "lane:port-spacing-auto-custom"],
  component: ExpandedPortSpacingDemo,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ExpandedPortSpacingDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/** The block on its own, no play function — the surface to try it by hand. */
export const Playground: Story = {
  args: {},
};

/**
 * The live toggle, starting in Auto, with "stop at neighbour". Play: Auto
 * spreads evenly; entering Custom moves nothing; a drag moves along the wall
 * only; running into a neighbour stops one minimum gap short (marker shown
 * while held, gone after); both ends clamp to the body; Custom -> Auto
 * redistributes and Auto -> Custom restores the dragged layout.
 */
export const AutoVsCustom: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Title");
    await waitFor(() => expect(wallCentres(canvasElement, "left")).toHaveLength(4));

    // Auto — the existing expanded rule, unchanged.
    expectAutoEven(canvasElement, "left");
    expectAutoEven(canvasElement, "right");
    const autoLeft = snapshot(canvasElement, "left");

    // Auto -> Custom: nothing jumps.
    await clickOption(canvasElement, "mode-left", "custom");
    expectSameLayout(snapshot(canvasElement, "left"), autoLeft, 0.5, "entering Custom");
    // The right wall is its own edge — still Auto.
    expectAutoEven(canvasElement, "right");

    // A drag moves along the wall ONLY, though the pointer wanders 40px.
    const in2 = dotOf(canvasElement, "left", "in2");
    const before = centreOf(in2);
    await dragDot(in2, 20, { dx: 40 });
    const after = centreOf(dotOf(canvasElement, "left", "in2"));
    expectWithin(after.x, before.x, 0.5, "in2 stays on its wall (x)");
    expectWithin(after.y, before.y + 20, 1, "in2 follows the pointer along the wall (y)");

    // Past a neighbour: stop mode clamps one minimum gap short, and the
    // marker is on screen while the port is held there.
    const in3y = centreOf(dotOf(canvasElement, "left", "in3")).y;
    let markersWhileHeld = 0;
    await dragDot(dotOf(canvasElement, "left", "in2"), 200, {
      dx: -30,
      whileHeld: async () => {
        markersWhileHeld = minGapMarkers(canvasElement, "left").length;
        const heldGap = centreOf(dotOf(canvasElement, "left", "in3")).y - centreOf(dotOf(canvasElement, "left", "in2")).y;
        expectWithin(heldGap, MIN_PORT_GAP_PX, 0.5, "in2 held against in3 mid-drag");
      },
    });
    await expect(markersWhileHeld).toBeGreaterThan(0);
    await expect(minGapMarkers(canvasElement, "left")).toHaveLength(0);
    expectWithin(centreOf(dotOf(canvasElement, "left", "in3")).y, in3y, 0.5, "stop mode — in3 did not move");
    expectWithin(centreOf(dotOf(canvasElement, "left", "in3")).y - centreOf(dotOf(canvasElement, "left", "in2")).y, MIN_PORT_GAP_PX, 0.5, "in2 stopped at the minimum gap");
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "after stopping at a neighbour");

    // Both ends clamp to the body band: below the header, above the bottom.
    const span = centreSpan(canvasElement);
    await dragDot(dotOf(canvasElement, "left", "in1"), -600);
    expectWithin(centreOf(dotOf(canvasElement, "left", "in1")).y, span.min, 0.5, "in1 clamps to the top of the body");
    await dragDot(dotOf(canvasElement, "left", "in4"), 600);
    expectWithin(centreOf(dotOf(canvasElement, "left", "in4")).y, span.max, 0.5, "in4 clamps to the bottom of the body");
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "after the end clamps");

    // Custom -> Auto redistributes; Auto -> Custom restores what was dragged.
    const custom = snapshot(canvasElement, "left");
    await clickOption(canvasElement, "mode-left", "auto");
    expectAutoEven(canvasElement, "left");
    await clickOption(canvasElement, "mode-left", "custom");
    expectSameLayout(snapshot(canvasElement, "left"), custom, 0.5, "Custom restored after a trip through Auto");
  },
};

/**
 * "Push neighbours": dragging into a neighbour shoves it along, gaps and
 * order intact — and it can shove a whole run, but never out of the body.
 */
export const PushNeighbours: Story = {
  args: { initialMode: "custom", initialNeighbour: "push" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Title");
    await waitFor(() => expect(wallCentres(canvasElement, "left")).toHaveLength(4));
    // Mounted in Custom with nothing stored: starts from the Auto spread.
    expectAutoEven(canvasElement, "left");

    const in2Before = centreOf(dotOf(canvasElement, "left", "in2")).y;
    const in1Before = centreOf(dotOf(canvasElement, "left", "in1")).y;
    const push = in2Before - in1Before + 30;
    let markersWhileHeld = 0;
    await dragDot(dotOf(canvasElement, "left", "in1"), push, {
      dx: 25,
      whileHeld: async () => {
        markersWhileHeld = minGapMarkers(canvasElement, "left").length;
        const heldGap = centreOf(dotOf(canvasElement, "left", "in2")).y - centreOf(dotOf(canvasElement, "left", "in1")).y;
        expectWithin(heldGap, MIN_PORT_GAP_PX, 0.5, "in2 pushed ahead of in1 mid-drag");
      },
    });
    await expect(markersWhileHeld).toBeGreaterThan(0);
    const in1After = centreOf(dotOf(canvasElement, "left", "in1")).y;
    const in2After = centreOf(dotOf(canvasElement, "left", "in2")).y;
    expectWithin(in1After, in1Before + push, 1, "in1 went where it was dragged");
    expectWithin(in2After - in1After, MIN_PORT_GAP_PX, 0.5, "in2 was pushed ahead of in1 at the minimum gap");
    await expect(in2After).toBeGreaterThan(in2Before + 1);
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "after a push");

    // Shove the whole run into the bottom: everything stacks at the minimum
    // gap and the last port sits at the body's bottom, not past it.
    await dragDot(dotOf(canvasElement, "left", "in1"), 800);
    const span = centreSpan(canvasElement);
    const ys = ["in1", "in2", "in3", "in4"].map((id) => centreOf(dotOf(canvasElement, "left", id)).y);
    expectWithin(ys[3], span.max, 0.5, "the pushed run stops at the bottom of the body");
    for (let i = 1; i < 4; i++) expectWithin(ys[i] - ys[i - 1], MIN_PORT_GAP_PX, 0.5, `pushed run gap ${i}`);
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "after pushing into the end");
  },
};

/**
 * The sketch's Custom block, reached by real drags from the Auto spread:
 * left wall — two close near the top, two close near the bottom; right wall
 * — two close near the bottom.
 */
export const SketchLayout: Story = {
  args: { initialMode: "custom" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Title");
    await waitFor(() => expect(wallCentres(canvasElement, "right")).toHaveLength(2));
    await dragDot(dotOf(canvasElement, "left", "in1"), -600);
    await dragDot(dotOf(canvasElement, "left", "in2"), -600);
    await dragDot(dotOf(canvasElement, "left", "in4"), 600);
    await dragDot(dotOf(canvasElement, "left", "in3"), 600);
    await dragDot(dotOf(canvasElement, "right", "out2"), 600);
    await dragDot(dotOf(canvasElement, "right", "out1"), 600);

    const span = centreSpan(canvasElement);
    const y = (wall: Wall, id: string) => centreOf(dotOf(canvasElement, wall, id)).y;
    expectWithin(y("left", "in1"), span.min, 0.5, "in1 at the top");
    expectWithin(y("left", "in2") - y("left", "in1"), MIN_PORT_GAP_PX, 0.5, "in1/in2 close");
    expectWithin(y("left", "in4"), span.max, 0.5, "in4 at the bottom");
    expectWithin(y("left", "in4") - y("left", "in3"), MIN_PORT_GAP_PX, 0.5, "in3/in4 close");
    expectWithin(y("right", "out2"), span.max, 0.5, "out2 at the bottom");
    expectWithin(y("right", "out2") - y("right", "out1"), MIN_PORT_GAP_PX, 0.5, "out1/out2 close — the sketch's min-space pair");
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "sketch left");
    expectCustomRulesHold(canvasElement, "right", ["out1", "out2"], "sketch right");
  },
};

/**
 * Rule 5: the edge changes underneath a Custom layout — a port added between
 * two close ones, one removed, and a reorder — and every rule still holds.
 * The reorder makes the two ports trade places.
 */
export const EdgeChangesInCustom: Story = {
  args: {
    initialMode: "custom",
    // A crowded wall: in1/in2 already at the minimum gap, so the new port
    // inserted between them has to push its way in.
    initialLeftOffsets: { in1: 0, in2: MIN_PORT_GAP_PX, in3: 250, in4: 250 + MIN_PORT_GAP_PX },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Title");
    await waitFor(() => expect(wallCentres(canvasElement, "left")).toHaveLength(4));
    expectCustomRulesHold(canvasElement, "left", ["in1", "in2", "in3", "in4"], "seeded");
    const seeded = snapshot(canvasElement, "left");

    (await canvas.findByTestId("add-left")).click();
    await waitFor(() => expect(wallCentres(canvasElement, "left")).toHaveLength(5));
    expectCustomRulesHold(canvasElement, "left", ["in1", "new1", "in2", "in3", "in4"], "after an add");

    (await canvas.findByTestId("remove-left")).click();
    await waitFor(() => expect(wallCentres(canvasElement, "left")).toHaveLength(4));
    expectCustomRulesHold(canvasElement, "left", ["in1", "new1", "in2", "in3"], "after a remove");

    const beforeMove = snapshot(canvasElement, "left");
    (await canvas.findByTestId("move-left")).click();
    await pause(60);
    expectCustomRulesHold(canvasElement, "left", ["new1", "in1", "in2", "in3"], "after a reorder");
    const afterMove = snapshot(canvasElement, "left");
    expectWithin(afterMove.new1, beforeMove.in1, 0.5, "reorder — new1 took in1's height");
    expectWithin(afterMove.in1, beforeMove.new1, 0.5, "reorder — in1 took new1's height");
    // The top port never moved off the author's chosen top.
    expectWithin(afterMove.new1, seeded.in1, 0.5, "the top height survived every change");
  },
};
