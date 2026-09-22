/**
 * Components/Blocks/BlockPortMembers/Collapsed Members — a stacked Block whose
 * members collapse to edge-to-edge port bands (lane `collapsed-members`).
 *
 * Zach, 2026-09-22: "Collapsed member regions. Can you please show an example
 * story book of a block in stack mode, displayed with both an expanded view
 * and the port view. The key idea here is that we collapse each of the
 * children members to a port state, and then make them go edge to edge. We
 * can optionally show or hide the header of the children members."
 *
 * `Grid` is his sketch as drawn: rows Expanded / Port, columns member headers
 * shown / hidden, on his fixture (My Component · Class, holding Func 3 with
 * 2/2 ports, Func 1 with 1/1 and Func 2 with 1/1). `LiveSwitch` puts both
 * switches on one block. `WireIntoCollapsedMember` proves where a collapsed
 * member's dot lives for a wire.
 *
 * Every assertion MEASURES (`getBoundingClientRect`), never DOM presence alone.
 */
import { useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Badge } from "./badge";
import { Bar } from "./bar";
import { Block } from "./block";
import { BlockPort } from "./blockPort";
import { BlockPortMembers, type BlockMemberHeaders, type BlockPortMember, type BlockPortMembersView } from "./blockPortMembers";
import { Switch } from "./switch";
import { TRACE_TERMINAL_GAP } from "./trace";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "./trace.layout";
import type { Wire } from "./wiring";
import { WireLayer } from "./wireLayer";

const meta = {
  title: "Components/Blocks/BlockPortMembers/Collapsed Members",
  tags: ["object:block", "lane:collapsed-members"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Fixture: Zach's sketch                                               */
/* ------------------------------------------------------------------ */

const PARENT_ID = "my-component";

function ports(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}_${i + 1}`, label: "port" }));
}

const MEMBERS: BlockPortMember[] = [
  { id: "func-3", name: "Func 3", left: ports("in", 2), right: ports("out", 2) },
  { id: "func-1", name: "Func 1", left: ports("in", 1), right: ports("out", 1) },
  { id: "func-2", name: "Func 2", left: ports("in", 1), right: ports("out", 1) },
];

function MyComponent({ id = PARENT_ID, view, memberHeaders }: { id?: string; view: BlockPortMembersView; memberHeaders: BlockMemberHeaders }) {
  return (
    <BlockPortMembers
      id={id}
      view={view}
      memberHeaders={memberHeaders}
      width={240}
      members={MEMBERS}
      header={<Bar left={<span style={{ fontSize: 13 }}>My Component</span>} right={<Badge variant="secondary">Class</Badge>} />}
      footer={<Bar size="sm" />}
    />
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what}: measured ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (±${tolerance}), off by ${delta.toFixed(2)}`);
  }
}

function centreOf(element: Element): { x: number; y: number } {
  const r = element.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** The parent `Block` inside one `BlockPortMembers`. */
function parentBlockOf(root: ParentNode): HTMLElement {
  return required<HTMLElement>(root, '[data-slot="block-port-members"] > [data-slot="block"]', "the parent block");
}

/** Every dot one member owns, each with the wall its rail is on. Found by
 *  the member's own `data-block-id`, exactly as `wireLayer.tsx` resolves. */
function memberDots(root: ParentNode, memberId: string): { dot: HTMLElement; edge: string }[] {
  const owner = required<HTMLElement>(root, `[data-block-id="${memberId}"]`, `member \`${memberId}\``);
  return Array.from(owner.querySelectorAll<HTMLElement>('[data-slot="port-dot"]')).map((dot) => ({
    dot,
    edge: dot.closest('[data-slot="block-port-rail"]')?.getAttribute("data-edge") ?? "?",
  }));
}

/**
 * Wall tolerance, px. The brief allows ±1; this is tighter on purpose. In the
 * port view a band is edge-to-edge, so the band's OWN wall is the parent's
 * inner wall, exactly one border (1px) inside the parent's outer wall. At ±1
 * a dot put back on the band's wall would still pass. At ±0.5 it fails, which
 * is what makes the wall assertion able to fail at all.
 */
const WALL_TOLERANCE_PX = 0.5;

/** Port view: bands tile, every dot is on the parent's outer wall and inside
 *  its own band, and the parent is exactly as tall as its bands. */
async function expectCollapsed(cell: HTMLElement): Promise<void> {
  const parent = parentBlockOf(cell);
  const parentRect = parent.getBoundingClientRect();
  const bands = Array.from(parent.querySelectorAll<HTMLElement>('[data-slot="block-member-band"]'));
  await expect(bands.map((band) => band.getAttribute("data-member-id"))).toEqual(MEMBERS.map((m) => m.id));

  // Bands tile edge to edge, full inner width, no gap.
  const rects = bands.map((band) => band.getBoundingClientRect());
  for (const [i, rect] of rects.entries()) {
    expectWithin(rect.width, parent.clientWidth, 1, `band ${i} width vs the parent's inner width`);
    if (i > 0) expectWithin(rect.top, rects[i - 1].bottom, 1, `band ${i} top vs band ${i - 1} bottom`);
  }
  // No gap to the parent's header or footer either: the parent is exactly
  // as tall as its bands need.
  const header = required<HTMLElement>(parent, ':scope > [data-slot="block-header"]', "the parent header");
  const footer = required<HTMLElement>(parent, ':scope > [data-slot="block-footer"]', "the parent footer");
  expectWithin(rects[0].top, header.getBoundingClientRect().bottom, 1, "first band top vs the parent header's bottom");
  expectWithin(rects.at(-1)!.bottom, footer.getBoundingClientRect().top, 1, "last band bottom vs the parent footer's top");

  for (const [i, member] of MEMBERS.entries()) {
    const dots = memberDots(cell, member.id);
    await expect(dots).toHaveLength((member.left?.length ?? 0) + (member.right?.length ?? 0));
    for (const { dot, edge } of dots) {
      const centre = centreOf(dot);
      const wallX = edge === "left" ? parentRect.left : parentRect.right;
      expectWithin(centre.x, wallX, WALL_TOLERANCE_PX, `${member.id} ${edge} dot x vs the PARENT's ${edge} wall`);
      if (!(centre.y >= rects[i].top && centre.y <= rects[i].bottom)) {
        throw new Error(`${member.id} dot y ${centre.y.toFixed(2)} is outside its band ${rects[i].top.toFixed(2)}..${rects[i].bottom.toFixed(2)}`);
      }
      // Its whole slot fits in the band's ports area: nothing hangs out.
      const portsArea = required<HTMLElement>(bands[i], '[data-slot="block-member-band-ports"]', `${member.id}'s ports area`).getBoundingClientRect();
      if (!(centre.y - 12 >= portsArea.top - 0.5 && centre.y + 12 <= portsArea.bottom + 0.5)) {
        throw new Error(`${member.id} dot slot ${centre.y.toFixed(2)}±12 hangs outside its ports area ${portsArea.top.toFixed(2)}..${portsArea.bottom.toFixed(2)}`);
      }
    }
  }
}

/** Expanded view: today's cards. Each member's dots sit on its OWN card's
 *  walls, inset from the parent's, and the cards keep equal gaps. */
async function expectExpanded(cell: HTMLElement): Promise<void> {
  const parent = parentBlockOf(cell);
  const parentRect = parent.getBoundingClientRect();
  const slots = Array.from(parent.querySelectorAll<HTMLElement>(':scope > [data-slot="block-members"] > [data-slot="block-member"]'));
  await expect(slots.map((slot) => slot.getAttribute("data-member-id"))).toEqual(MEMBERS.map((m) => m.id));
  const slotRects = slots.map((slot) => slot.getBoundingClientRect());
  const gaps = slotRects.slice(1).map((rect, i) => rect.top - slotRects[i].bottom);
  for (const gap of gaps) {
    await expect(gap).toBeGreaterThan(4);
    expectWithin(gap, gaps[0], 1, "expanded card gap");
  }
  for (const member of MEMBERS) {
    const owner = required<HTMLElement>(cell, `[data-block-id="${member.id}"]`, `member card \`${member.id}\``);
    const card = required<HTMLElement>(owner, ':scope > [data-slot="block"]', `${member.id}'s own card`).getBoundingClientRect();
    // A real card, inset from the parent's walls, not a band.
    await expect(card.left - parentRect.left).toBeGreaterThan(4);
    await expect(parentRect.right - card.right).toBeGreaterThan(4);
    for (const { dot, edge } of memberDots(cell, member.id)) {
      const centre = centreOf(dot);
      expectWithin(centre.x, edge === "left" ? card.left : card.right, 1, `${member.id} ${edge} dot x vs its OWN card wall`);
      if (!(centre.y >= card.top && centre.y <= card.bottom)) throw new Error(`${member.id} dot is outside its own card`);
    }
  }
}

/** Shown: every name, visible, in order. Hidden: no member header element. */
async function expectHeaders(cell: HTMLElement, memberHeaders: BlockMemberHeaders): Promise<void> {
  const headers = Array.from(cell.querySelectorAll<HTMLElement>('[data-slot="block-member-header"]'));
  if (memberHeaders === "hide") {
    await expect(headers).toHaveLength(0);
    return;
  }
  await expect(headers.map((h) => h.textContent)).toEqual(MEMBERS.map((m) => m.name));
  for (const h of headers) {
    await expect(h).toBeVisible();
    // Visible means not clipped away: the name's full text width fits.
    await expect(h.scrollWidth).toBeLessThanOrEqual(h.clientWidth + 1);
  }
}

/* ------------------------------------------------------------------ */
/* Grid — the sketch                                                    */
/* ------------------------------------------------------------------ */

const VIEWS: { view: BlockPortMembersView; label: string }[] = [
  { view: "expanded", label: "Expanded View" },
  { view: "port", label: "Port View" },
];
const HEADERS: { memberHeaders: BlockMemberHeaders; label: string }[] = [
  { memberHeaders: "show", label: "Children members with header" },
  { memberHeaders: "hide", label: "Header hidden on children members" },
];

function GridDemo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", columnGap: 64, rowGap: 40, padding: "24px 40px", alignItems: "start" }}>
      <div />
      {HEADERS.map(({ label }) => (
        <Caption key={label}>{label}</Caption>
      ))}
      {VIEWS.map(({ view, label }) => [
        <div key={`${view}-label`} style={{ paddingTop: 8 }}>
          <Caption>{label}</Caption>
        </div>,
        ...HEADERS.map(({ memberHeaders }) => (
          <div key={`${view}-${memberHeaders}`} data-testid={`cell-${view}-${memberHeaders}`}>
            <MyComponent id={`${PARENT_ID}-${view}-${memberHeaders}`} view={view} memberHeaders={memberHeaders} />
          </div>
        )),
      ])}
    </div>
  );
}

export const Grid: Story = {
  render: () => <GridDemo />,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findAllByText("My Component");
    for (const { view } of VIEWS) {
      for (const { memberHeaders } of HEADERS) {
        const cell = required<HTMLElement>(canvasElement, `[data-testid="cell-${view}-${memberHeaders}"]`, `the ${view}/${memberHeaders} cell`);
        // The port view's dots land one pass after its bands are measured.
        await waitFor(() => expect(cell.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(8));
        await expectHeaders(cell, memberHeaders);
        if (view === "port") await expectCollapsed(cell);
        else await expectExpanded(cell);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* LiveSwitch — both switches on one block                              */
/* ------------------------------------------------------------------ */

function LiveSwitchDemo() {
  const [collapsed, setCollapsed] = useState(true);
  const [showHeaders, setShowHeaders] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Switch aria-label="Port view" checked={collapsed} onCheckedChange={setCollapsed} />
          Port view
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Switch aria-label="Member headers" checked={showHeaders} onCheckedChange={setShowHeaders} />
          Member headers
        </div>
      </div>
      <div data-testid="live">
        <MyComponent view={collapsed ? "port" : "expanded"} memberHeaders={showHeaders ? "show" : "hide"} />
      </div>
    </div>
  );
}

export const LiveSwitch: Story = {
  render: () => <LiveSwitchDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("My Component");
    const cell = required<HTMLElement>(canvasElement, '[data-testid="live"]', "the live block");
    const settled = () => waitFor(() => expect(cell.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(8));

    await settled();
    await expectHeaders(cell, "show");
    await expectCollapsed(cell);

    await userEvent.click(canvas.getByRole("switch", { name: "Member headers" }));
    await waitFor(() => expect(cell.querySelector('[data-member-headers="hide"]')).not.toBeNull());
    await settled();
    await expectHeaders(cell, "hide");
    await expectCollapsed(cell);

    await userEvent.click(canvas.getByRole("switch", { name: "Port view" }));
    await waitFor(() => expect(cell.querySelector('[data-view="expanded"]')).not.toBeNull());
    await settled();
    await expectHeaders(cell, "hide");
    await expectExpanded(cell);
  },
};

/* ------------------------------------------------------------------ */
/* WireIntoCollapsedMember — the dot keeps its member's id              */
/* ------------------------------------------------------------------ */

/** Screen-space position of an SVG user-space point, via the real CTM. The
 *  same technique `BlockWiring.stories.tsx` uses. */
function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the svg mounted?");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/** The TERMINAL the layer resolved for a wire's `to` end: the drawn line's
 *  last point, pushed forward by `Trace`'s documented `TRACE_TERMINAL_GAP`
 *  pull-back along the arrival direction (`BlockWiring.stories.tsx`'s
 *  `expectTerminalOnDot`, the same derivation). */
function toTerminalOf(svg: SVGSVGElement, line: SVGPathElement, railEdge: TraceDir): { x: number; y: number } {
  const dir = OPPOSITE_DIR[railEdge];
  const end = line.getPointAtLength(line.getTotalLength());
  return toScreen(svg, end.x + DIR_VECTOR[dir].x * TRACE_TERMINAL_GAP, end.y + DIR_VECTOR[dir].y * TRACE_TERMINAL_GAP);
}

// The cable runs to Func 1's first left port. `through` names the parent,
// because the parent is the container that end sits inside.
const WIRE: Wire = {
  id: "source-to-func1",
  from: { blockId: "source", portId: "out" },
  to: { blockId: "func-1", portId: "in_1" },
  through: [PARENT_ID],
};

function WireDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<BlockPortMembersView>("port");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <Switch aria-label="Port view" checked={view === "port"} onCheckedChange={(on) => setView(on ? "port" : "expanded")} />
        Port view
      </div>
      <div data-slot="wire-bench" ref={containerRef} style={{ position: "relative", width: 560, height: 360 }}>
        <div style={{ position: "absolute", left: 0, top: 150 }}>
          <BlockPort id="source" view="port" edges={{ right: { items: [{ id: "out", label: "out", state: "wired" }] } }}>
            <Block width={140} header={<Bar size="sm" left={<span style={{ fontSize: 12 }}>Source</span>} />} body={<div style={{ height: 8 }} />} />
          </BlockPort>
        </div>
        <div style={{ position: "absolute", left: 280, top: 0 }}>
          <MyComponent view={view} memberHeaders="show" />
        </div>
        <WireLayer wires={[WIRE]} containerRef={containerRef} layoutKey={view} />
      </div>
    </div>
  );
}

async function expectWireOnMemberDot(canvasElement: HTMLElement, wall: "parent" | "card"): Promise<void> {
  const bench = required<HTMLElement>(canvasElement, '[data-slot="wire-bench"]', "the wire bench");
  const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
  await waitFor(() => expect(bench.querySelector(`[data-wire-id="${WIRE.id}"] [data-slot="trace-line"]`)).not.toBeNull(), { timeout: 3000 });
  await expect(svg.getAttribute("data-unresolved-wires") ?? "").toBe("");
  const line = required<SVGPathElement>(bench, `[data-wire-id="${WIRE.id}"] [data-slot="trace-line"]`, "the trace line");

  // The dot the wire must reach: port `in_1` owned by Func 1's own
  // `data-block-id`, which in the port view is drawn on the PARENT's wall.
  const owner = required<HTMLElement>(bench, '[data-block-id="func-1"]', "Func 1");
  const dot = required<HTMLElement>(owner, '[data-port-id="in_1"] [data-slot="port-dot"]', "Func 1's in_1 dot");
  const centre = centreOf(dot);
  const parentRect = parentBlockOf(bench).getBoundingClientRect();
  if (wall === "parent") {
    expectWithin(centre.x, parentRect.left, WALL_TOLERANCE_PX, "Func 1's in_1 dot x vs the PARENT's left wall");
  } else {
    const card = required<HTMLElement>(owner, ':scope > [data-slot="block"]', "Func 1's own card").getBoundingClientRect();
    expectWithin(centre.x, card.left, 1, "Func 1's in_1 dot x vs its OWN card's left wall");
  }

  // The trace's terminal lands on that dot, within 0.5px.
  await waitFor(() => {
    const terminal = toTerminalOf(svg, line, "left");
    const now = centreOf(dot);
    expectWithin(terminal.x, now.x, 0.5, "wire terminal x vs the dot centre");
    expectWithin(terminal.y, now.y, 0.5, "wire terminal y vs the dot centre");
  });
}

export const WireIntoCollapsedMember: Story = {
  render: () => <WireDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("My Component");
    await expectWireOnMemberDot(canvasElement, "parent");

    // Same wire, same ids, expanded: it now lands on Func 1's own card.
    await userEvent.click(canvas.getByRole("switch", { name: "Port view" }));
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="block-port-members"][data-view="expanded"]')).not.toBeNull());
    await expectWireOnMemberDot(canvasElement, "card");
  },
};
