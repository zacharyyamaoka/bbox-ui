import { useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Badge } from "../components/badge";
import { Bar, type BarSize } from "../components/bar";
import { Block } from "../components/block";
import { BlockPort, RAIL_SLOT_MAIN_PX, functionPortHeaderInsetPx, railDotCentres, railPitches } from "../components/blockPort";
import {
  BLOCK_PORT_LAYOUT_LABELS,
  BLOCK_PORT_LAYOUTS,
  BLOCK_VIEW_LABELS,
  BLOCK_VIEWS,
  RAIL_END_MARGIN_PX,
  RAIL_GAP_PX,
  offsetEdgePaddingPx,
  railPitchPx,
  type BlockPortLayout,
  type BlockView,
} from "../components/blockPort.layout";
import { EditableText } from "../components/editableText";
import { Glyph } from "../components/glyph";
import { PORT_DIAMETERS, type BlockSide, type PortSize } from "../components/port.layout";
import type { Distribution } from "../components/portEdge.layout";
import type { PortEdgeItem } from "../components/portEdge";

/**
 * Basics/BlockPort — phase A1 of docs/BLOCK-PORT-EDGES-PLAN.md: a `Block`
 * wearing real `PortEdge` rails, in each of the donor's four view rules.
 *
 * Every claim below is MEASURED off `getBoundingClientRect`, never inferred
 * from the DOM being populated. That distinction is the whole point here: a
 * rail that renders three dots in a pile and a rail that renders them at a
 * uniform pitch have identical DOM, and only one of them is the feature. The
 * stacking claim is measured too — `document.elementFromPoint`, an actual
 * hit test, rather than reading a `z-index` string back out of a style
 * object (which proves only that the string was written).
 *
 * No wires here. `Trace` is Group B; nothing in this file imports it.
 */

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                 */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function wrapperOf(canvasElement: HTMLElement, index = 0): HTMLElement {
  const all = canvasElement.querySelectorAll<HTMLElement>('[data-slot="block-port"]');
  const found = all[index];
  if (!found) throw new Error(`expected a BlockPort at index ${index}; found ${all.length}`);
  return found;
}

function railOf(wrapper: HTMLElement, edge: BlockSide): HTMLElement {
  return required<HTMLElement>(wrapper, `:scope > [data-slot="block-port-rail"][data-edge="${edge}"]`, `a ${edge} rail`);
}

/** The Block's own regions, in viewport px — the same band the wrapper
 *  measures, re-read independently by the assertion so a bug in the
 *  component's own measurement cannot hide behind itself. */
function bandOf(wrapper: HTMLElement): { block: DOMRect; top: number; bottom: number } {
  const block = required<HTMLElement>(wrapper, ':scope > [data-slot="block"]', "the Block");
  const blockRect = block.getBoundingClientRect();
  const header = block.querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
  const footer = block.querySelector<HTMLElement>(':scope > [data-slot="block-footer"]');
  return {
    block: blockRect,
    top: header ? header.getBoundingClientRect().bottom : blockRect.top,
    bottom: footer ? footer.getBoundingClientRect().top : blockRect.bottom,
  };
}

/**
 * A measured assertion that says what it measured when it fails. A bare
 * `expect(a).toBeCloseTo(b)` on two viewport numbers reports "expected
 * 331.5 to be close to 329" with no way to tell which dot, which rail, or
 * which rule broke.
 */
function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px (±${tolerance}px), off by ${delta.toFixed(2)}px`);
  }
}

/** Every consecutive delta, not a sample: `max - min` over the whole set is
 *  the only reading that can tell a uniform rail from a drifting one. */
function expectUniform(values: number[], tolerance: number, what: string): void {
  if (values.length === 0) throw new Error(`${what} — no gaps to measure`);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max - min <= tolerance)) {
    throw new Error(`${what} — gaps [${values.map((v) => v.toFixed(2)).join(", ")}] span ${(max - min).toFixed(2)}px (±${tolerance}px allowed)`);
  }
}

/**
 * Zach's z-rule, hit-tested: "the port edge is literally just a line. its Z
 * level should be above the block." Probe a point that is inside BOTH the
 * dot and the Block's card — a few px in from the wall — and read which
 * element actually owns that pixel. Reading `zIndex` back off a style would
 * prove only that a string was written; this proves what paints.
 */
function expectRailPaintsAboveBlock(centre: { x: number; y: number }, inward: { dx: number; dy: number }, what: string): void {
  const x = Math.round(centre.x + inward.dx);
  const y = Math.round(centre.y + inward.dy);
  const hit = document.elementFromPoint(x, y);
  if (!hit) throw new Error(`${what} — nothing painted at (${x}, ${y}); the specimen is off-screen, so stacking cannot be read`);
  if (!hit.closest('[data-slot="block-port-rail"]')) {
    const slot = hit.getAttribute("data-slot") ?? hit.tagName.toLowerCase();
    const where = hit.closest('[data-slot="block"]') ? "inside the Block" : "outside both";
    throw new Error(`${what} — the topmost element at (${x}, ${y}) is \`${slot}\`, ${where}; the rail must paint above the Block`);
  }
}

/* ------------------------------------------------------------------ */
/* Fixtures — plain names (D-B6: `name.phase` grammar belongs to the    */
/* async gallery, Group B).                                            */
/* ------------------------------------------------------------------ */

const INPUTS: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "gain", label: "gain", state: "valueSet" },
  { id: "reset", label: "reset", state: "empty" },
];

const OUTPUTS: PortEdgeItem[] = [
  { id: "cmd", label: "cmd", state: "wired" },
  { id: "status", label: "status", state: "empty" },
];

/** Simple view's face: the donor's bare title card. */
function SimpleFace({ width = 180, height = 96 }: { width?: number; height?: number }) {
  return <Block header="Planner" width={width} height={height} showHeaderDivider={false} />;
}

/** Port/expanded view's face: header, body, footer — so the body BAND is a
 *  real band with something above and below it to be bounded by. C-6
 *  (docs/FEEDBACK-2026-09-17b-PLAN.md, Lane C): body carries no TEXT —
 *  Zach's rule is that Port view wouldn't show a centred body title unless
 *  the block is bigger, because the text gets in the way of the ports.
 *  `body={null}` (not an omitted prop): the body region still has to
 *  render as the flex-1 filler that pins the footer to the bottom of the
 *  fixed `height` box and keeps the band the rails measure genuinely
 *  tall — omitting the prop entirely collapses header+footer together
 *  with no filler between them (measured live: every rail/band assertion
 *  in this file broke that way). */
function BandedFace({ width = 220, height = 240 }: { width?: number; height?: number }) {
  return <Block header="Planner" body={null} footer="ready" width={width} height={height} />;
}

/** The four-wall face: NO header, deliberately. Labels flow inward, so a
 *  header band at the top of a small card ends up sharing its pixels with
 *  the first left/right label and the whole top wall's labels — legible
 *  geometry, illegible picture. A body-only card gives every wall's labels
 *  clear space to flow into. */
function HubFace({ width = 260, height = 200 }: { width?: number; height?: number }) {
  return <Block body="Hub" width={width} height={height} />;
}

/** Every specimen sits in a padded frame: rails hang outside the Block's
 *  box by design, and labels flow inward over it. */
function Stage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // `gap: 32` rather than a tight caption: a wall's labels can flow
    // OUTSIDE the Block (FourEdges flows the horizontal walls outward), and
    // those labels are absolutely positioned, so they overlap whatever sits
    // directly above the specimen unless the stage leaves them room.
    <div data-slot="block-ports-stage" style={{ display: "flex", flexDirection: "column", gap: 32, padding: "48px 64px" }}>
      {label && (
        <div data-slot="block-ports-stage-label" style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, slot }: { options: { value: T; label: string }[]; value: T; onChange(v: T): void; slot: string }) {
  return (
    <div data-slot={slot} style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", width: "max-content" }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-slot="block-ports-control-option"
          data-value={option.value}
          data-selected={value === option.value || undefined}
          onClick={() => onChange(option.value)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            cursor: "pointer",
            background: value === option.value ? "var(--accent)" : "transparent",
            color: value === option.value ? "var(--accent-foreground)" : "var(--foreground)",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const meta = {
  title: "Blocks/BlockPort",
  tags: ["area:blocks", "lane:baseline"],
  component: BlockPort,
  // Never read — every story supplies its own `render` with story-local
  // state, because `BlockPort`'s edges are controlled.
  args: { view: "port" as BlockView, edges: {}, children: null },
} satisfies Meta<typeof BlockPort>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* ClassicDag — port view, inline. Zach's "classic input output dag":   */
/* a port edge on the left body edge and one on the right.             */
/* ------------------------------------------------------------------ */

function ClassicDagDemo({ portLayout = "inline" as BlockPortLayout, height = 240 }: { portLayout?: BlockPortLayout; height?: number }) {
  const [inputs, setInputs] = useState(INPUTS);
  const [outputs, setOutputs] = useState(OUTPUTS);
  return (
    <Stage label={`port view · ${BLOCK_PORT_LAYOUT_LABELS[portLayout]}`}>
      <BlockPort
        id="planner"
        view="port"
        portLayout={portLayout}
        edges={{
          left: { items: inputs, onItemsChange: setInputs },
          right: { items: outputs, onItemsChange: setOutputs },
        }}
      >
        <BandedFace height={height} />
      </BlockPort>
    </Stage>
  );
}

export const ClassicDag: Story = {
  render: () => <ClassicDagDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const { block, top: bandTop, bottom: bandBottom } = bandOf(wrapper);

    // C2 (docs/FEEDBACK-2026-09-17b-PLAN.md, Lane C): dropping the body
    // text from `BandedFace` must not collapse the Block — its explicit
    // `height`/`width` (`ClassicDagDemo`'s defaults) still win.
    await expect(block.height).toBe(240);
    await expect(block.width).toBe(220);
    const left = railOf(wrapper, "left");
    const right = railOf(wrapper, "right");

    const leftDots = railDotCentres(left);
    const rightDots = railDotCentres(right);
    await expect(leftDots).toHaveLength(INPUTS.length);
    await expect(rightDots).toHaveLength(OUTPUTS.length);

    // Pins `PORT_EDGE_SLOT_MIN_PX` against the real slot box PortEdge draws,
    // so the constant this app re-declares cannot drift from the one
    // portEdge.tsx keeps private (see blockPort.layout.ts's own WHY).
    const slotBox = required<HTMLElement>(left, '[data-slot="port-edge-member"]', "a slot box on the left rail").getBoundingClientRect();
    expectWithin(slotBox.height, RAIL_SLOT_MAIN_PX, 0.5, "rail slot box main size vs PORT_EDGE_SLOT_MIN_PX");

    // The inline rule, stated as the donor states it: input row i and
    // output row i share a slot, so both lanes' first dot is the same row.
    expectWithin(rightDots[0].y, leftDots[0].y, 1, "inline — right lane's first dot vs left lane's first dot");
    // ...and that row is the body band's top, packed from it.
    expectWithin(leftDots[0].y, bandTop + RAIL_SLOT_MAIN_PX / 2, 1, "first dot centre vs the body band's top");

    // Uniform pitch, every consecutive delta, on both lanes.
    for (const [name, rail] of [["left", left], ["right", right]] as const) {
      const pitches = railPitches(rail, "column");
      expectUniform(pitches, 1, `${name} rail pitch uniformity`);
      for (const pitch of pitches) expectWithin(pitch, railPitchPx(), 1, `${name} rail pitch`);
    }

    // The rail IS the wall: every dot's centre sits on the Block's border
    // line, not beside it.
    for (const dot of leftDots) expectWithin(dot.x, block.left, 1, "left dot centre vs the Block's left wall");
    for (const dot of rightDots) expectWithin(dot.x, block.right, 1, "right dot centre vs the Block's right wall");

    // The band is a real bound: ports stay above the footer.
    await expect(leftDots[leftDots.length - 1].y).toBeLessThan(bandBottom);

    // Zach's z-rule, hit-tested.
    expectRailPaintsAboveBlock(leftDots[0], { dx: 4, dy: 0 }, "left rail stacking");
    expectRailPaintsAboveBlock(rightDots[0], { dx: -4, dy: 0 }, "right rail stacking");
  },
};

/* ------------------------------------------------------------------ */
/* OffsetDag — port view, offset: the right lane starts one full pitch  */
/* below the LAST left-lane port (donor `outputStart = slot +           */
/* inputs.length`).                                                    */
/* ------------------------------------------------------------------ */

export const OffsetDag: Story = {
  render: () => <ClassicDagDemo portLayout="offset" height={300} />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const { top: bandTop, bottom: bandBottom } = bandOf(wrapper);
    const leftDots = railDotCentres(railOf(wrapper, "left"));
    const rightDots = railDotCentres(railOf(wrapper, "right"));
    await expect(leftDots).toHaveLength(INPUTS.length);
    await expect(rightDots).toHaveLength(OUTPUTS.length);

    const pitch = railPitchPx();
    const lastLeft = leftDots[leftDots.length - 1];

    // THE offset rule: one full pitch below the last left-edge port — the
    // same pitch used WITHIN a lane, which is what makes the two lanes read
    // as one continuous column of slots rather than two that happen to
    // overlap.
    expectWithin(rightDots[0].y - lastLeft.y, pitch, 1, "offset — right lane's first dot below the left lane's last");
    expectUniform(railPitches(railOf(wrapper, "right"), "column"), 1, "right rail pitch uniformity under offset");

    // And the closed form that produced it (D-A3's exact helper, not
    // `offsetPaddingFor`'s count*gap approximation — which would land 72px
    // high here and interleave the lanes).
    expectWithin(rightDots[0].y, bandTop + offsetEdgePaddingPx(INPUTS.length) + RAIL_SLOT_MAIN_PX / 2, 1, "offset — right lane's first dot vs the exact edgePadding formula");

    // The offset lane still fits inside the band it was given.
    await expect(rightDots[rightDots.length - 1].y).toBeLessThan(bandBottom);
  },
};

/* ------------------------------------------------------------------ */
/* SimpleView — every port on a wall collapses to ONE dot, centred on    */
/* that wall (donor: `midpoint = height / 2`).                          */
/* ------------------------------------------------------------------ */

/** Deliberately 3 on the left, 1 on the right: a one-port wall never
 *  reaches PortEdge's collapsed branch at all (a groups line naming a
 *  single id is dropped by the parser), so this fixture exercises BOTH
 *  paths — `renderCollapsed` and the collapsed `renderItem` — and proves
 *  they agree on what a collapsed wall looks like. */
const SIMPLE_OUTPUTS: PortEdgeItem[] = [{ id: "cmd", label: "cmd", state: "empty" }];

function SimpleViewDemo() {
  return (
    <Stage label="simple view · every wall collapses to one dot">
      <BlockPort id="planner" view="simple" edges={{ left: { items: INPUTS }, right: { items: SIMPLE_OUTPUTS } }}>
        <SimpleFace />
      </BlockPort>
    </Stage>
  );
}

export const SimpleView: Story = {
  render: () => <SimpleViewDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const { block } = bandOf(wrapper);
    const midY = block.top + block.height / 2;

    for (const [edge, items, wallX] of [
      ["left", INPUTS, block.left],
      ["right", SIMPLE_OUTPUTS, block.right],
    ] as const) {
      const rail = railOf(wrapper, edge);
      const dots = railDotCentres(rail);
      // Exactly one painted dot for the whole wall — not N dots stacked.
      await expect(dots).toHaveLength(1);
      expectWithin(dots[0].y, midY, 1, `simple — ${edge} wall's dot vs the Block's vertical midpoint`);
      expectWithin(dots[0].x, wallX, 1, `simple — ${edge} wall's dot vs the wall line`);

      // Identity is retained even though the paint is de-duplicated: the
      // one dot names every port it stands for (how a Group B wire will
      // re-anchor to it without any wire data changing).
      const stand = required<HTMLElement>(rail, "[data-collapsed-ports]", `a collapsed stand-in dot on the ${edge} wall`);
      const named = (stand.getAttribute("data-collapsed-ports") ?? "").split(",").filter(Boolean);
      await expect(named.sort()).toEqual(items.map((i) => i.id).sort());
    }

    // The donor's simple face draws a LABEL-LESS dot (`label: null`), so
    // PortEdge's own `+N more` chip must not appear — that is what D-A7's
    // `renderCollapsed` seam exists for.
    await expect(wrapper.textContent ?? "").not.toContain("more");
    await expect(wrapper.querySelectorAll('[data-slot="port-label"]')).toHaveLength(0);
  },
};

/* ------------------------------------------------------------------ */
/* ExpandedView — ports spread evenly from the top of the BODY to its   */
/* bottom (donor `placeExpandedBody`).                                  */
/* ------------------------------------------------------------------ */

function ExpandedViewDemo() {
  const [inputs, setInputs] = useState(INPUTS);
  const [outputs, setOutputs] = useState(OUTPUTS);
  return (
    <Stage label="expanded view · evenly spread across the body band">
      <BlockPort
        id="planner"
        view="expanded"
        edges={{ left: { items: inputs, onItemsChange: setInputs }, right: { items: outputs, onItemsChange: setOutputs } }}
      >
        <BandedFace height={280} />
      </BlockPort>
    </Stage>
  );
}

export const ExpandedView: Story = {
  render: () => <ExpandedViewDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const { top: bandTop, bottom: bandBottom } = bandOf(wrapper);

    for (const [edge, count] of [["left", INPUTS.length], ["right", OUTPUTS.length]] as const) {
      const rail = railOf(wrapper, edge);
      const dots = railDotCentres(rail);
      await expect(dots).toHaveLength(count);

      // EVERY consecutive delta — the acceptance the plan insists on,
      // because two sampled gaps cannot distinguish "evenly spread" from
      // "evenly spread except the last one".
      expectUniform(railPitches(rail, "column"), 1, `expanded — ${edge} rail pitch uniformity`);

      // Symmetric ends: `space-evenly` spaces boxes, so the measurable
      // property is equal margins at both walls of the band (D-A4 — the
      // donor's (i+1)/(n+1) point formula is deliberately NOT what this
      // asserts, and the deviation is bounded by half a slot).
      const topMargin = dots[0].y - bandTop;
      const bottomMargin = bandBottom - dots[dots.length - 1].y;
      expectWithin(topMargin, bottomMargin, 1, `expanded — ${edge} rail end margins (top ${topMargin.toFixed(1)} vs bottom ${bottomMargin.toFixed(1)})`);
      await expect(topMargin).toBeGreaterThan(0);

      // ...and the end gap EQUALS the between-gap, which is what makes this
      // `space-evenly` and not `space-between`. Without this line the two
      // schemes are indistinguishable: both give a uniform pitch and
      // symmetric ends, and only this identity separates "evenly, including
      // the edge" from "flush against the walls". `topMargin` is the wall
      // gap plus half a slot; `pitch` is the same wall gap plus a whole
      // slot.
      const pitch = railPitches(rail, "column")[0];
      expectWithin(topMargin, pitch - RAIL_SLOT_MAIN_PX / 2, 1, `expanded — ${edge} rail's end gap equals its between-gap`);
    }

    // The expanded spread is genuinely wider than the packed one it
    // replaces — otherwise "expanded" would be a label with no behaviour.
    const expandedPitch = railPitches(railOf(wrapper, "left"), "column")[0];
    await expect(expandedPitch).toBeGreaterThan(railPitchPx());
  },
};

/* ------------------------------------------------------------------ */
/* ViewMatrix — the gallery: one port set, every view rule, side by     */
/* side, plus a live S|P|E switch (the donor's own per-card control,    */
/* `CommunicationPrototypeControls.tsx:51-55`).                        */
/* ------------------------------------------------------------------ */

const MATRIX: { view: BlockView; portLayout: BlockPortLayout; label: string }[] = [
  { view: "simple", portLayout: "inline", label: "Simple" },
  { view: "port", portLayout: "inline", label: "Port · inline" },
  { view: "port", portLayout: "offset", label: "Port · offset" },
  { view: "expanded", portLayout: "inline", label: "Expanded" },
];

function ViewMatrixDemo() {
  const [view, setView] = useState<BlockView>("port");
  const [portLayout, setPortLayout] = useState<BlockPortLayout>("inline");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: "48px 64px" }}>
      <div data-slot="block-ports-matrix" style={{ display: "flex", gap: 96, alignItems: "flex-start", flexWrap: "wrap" }}>
        {MATRIX.map((cell) => (
          <div key={cell.label} data-slot="block-ports-matrix-cell" data-cell={cell.label} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{cell.label}</div>
            <BlockPort id={cell.label} view={cell.view} portLayout={cell.portLayout} edges={{ left: { items: INPUTS }, right: { items: OUTPUTS } }}>
              {cell.view === "simple" ? <SimpleFace width={180} height={300} /> : <BandedFace width={200} height={300} />}
            </BlockPort>
          </div>
        ))}
      </div>

      <div data-slot="block-ports-live" style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Segmented<BlockView> slot="block-ports-view-control" options={BLOCK_VIEWS.map((v) => ({ value: v, label: BLOCK_VIEW_LABELS[v] }))} value={view} onChange={setView} />
          <Segmented<BlockPortLayout>
            slot="block-ports-layout-control"
            options={BLOCK_PORT_LAYOUTS.map((l) => ({ value: l, label: BLOCK_PORT_LAYOUT_LABELS[l] }))}
            value={portLayout}
            onChange={setPortLayout}
          />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            same ports, live — the view rule is the only thing that changes
          </span>
        </div>
        <div style={{ paddingTop: 24 }}>
          <BlockPort id="live" view={view} portLayout={portLayout} edges={{ left: { items: INPUTS }, right: { items: OUTPUTS } }}>
            {view === "simple" ? <SimpleFace width={180} height={300} /> : <BandedFace width={200} height={300} />}
          </BlockPort>
        </div>
      </div>
    </div>
  );
}

export const ViewMatrix: Story = {
  render: () => <ViewMatrixDemo />,
  play: async ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll<HTMLElement>('[data-slot="block-ports-matrix-cell"]');
    await expect(cells).toHaveLength(MATRIX.length);

    // Each static card obeys its own rule, measured — the gallery is only
    // worth looking at if the four cards genuinely differ.
    const firstCentres: number[] = [];
    for (let i = 0; i < MATRIX.length; i++) {
      const cell = MATRIX[i];
      const wrapper = wrapperOf(cells[i]);
      const left = railOf(wrapper, "left");
      const right = railOf(wrapper, "right");
      const leftDots = railDotCentres(left);
      const rightDots = railDotCentres(right);

      if (cell.view === "simple") {
        await expect(leftDots).toHaveLength(1);
        await expect(rightDots).toHaveLength(1);
        const { block } = bandOf(wrapper);
        expectWithin(leftDots[0].y, block.top + block.height / 2, 1, `${cell.label} — collapsed dot at the midpoint`);
      } else {
        await expect(leftDots).toHaveLength(INPUTS.length);
        await expect(rightDots).toHaveLength(OUTPUTS.length);
        expectUniform(railPitches(left, "column"), 1, `${cell.label} — left rail pitch uniformity`);
      }

      if (cell.view === "port" && cell.portLayout === "inline") {
        expectWithin(rightDots[0].y, leftDots[0].y, 1, `${cell.label} — lanes share row 0`);
      }
      if (cell.view === "port" && cell.portLayout === "offset") {
        expectWithin(rightDots[0].y - leftDots[leftDots.length - 1].y, railPitchPx(), 1, `${cell.label} — right lane one pitch below the left lane's last`);
      }
      firstCentres.push(leftDots[0].y - bandOf(wrapper).block.top);
    }

    // Port·inline and Expanded must not coincidentally land in the same
    // place, or the gallery would be showing one rule twice.
    await expect(Math.abs(firstCentres[1] - firstCentres[3])).toBeGreaterThan(1);

    // The live card's S|P|E switch actually re-lays the ports out.
    const live = required<HTMLElement>(canvasElement, '[data-slot="block-ports-live"]', "the live card");
    const pitchBefore = railPitches(railOf(wrapperOf(live), "left"), "column");
    expectUniform(pitchBefore, 1, "live card — pitch before switching view");
    expectWithin(pitchBefore[0], railPitchPx(), 1, "live card — port view pitch");

    const expandedButton = required<HTMLElement>(live, '[data-slot="block-ports-view-control"] [data-value="expanded"]', "the Expanded option");
    expandedButton.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const pitchAfter = railPitches(railOf(wrapperOf(live), "left"), "column");
    expectUniform(pitchAfter, 1, "live card — pitch after switching to Expanded");
    await expect(pitchAfter[0]).toBeGreaterThan(pitchBefore[0] + 1);

    const simpleButton = required<HTMLElement>(live, '[data-slot="block-ports-view-control"] [data-value="simple"]', "the Simple option");
    simpleButton.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(railDotCentres(railOf(wrapperOf(live), "left"))).toHaveLength(1);

    // Back to where it started — which is BOTH a real claim (collapse is
    // reversible: the ports were never destroyed, only de-duplicated in
    // paint) and the reason a reviewer opening this story finds the live
    // card in its default view rather than wherever the play function
    // happened to stop.
    required<HTMLElement>(live, '[data-slot="block-ports-view-control"] [data-value="port"]', "the Port option").click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const restored = railDotCentres(railOf(wrapperOf(live), "left"));
    await expect(restored).toHaveLength(INPUTS.length);
    expectWithin(railPitches(railOf(wrapperOf(live), "left"), "column")[0], railPitchPx(), 1, "live card — pitch restored after round-tripping through Simple");
  },
};

/* ------------------------------------------------------------------ */
/* FourEdges — ports on all four walls at once (the arrangement the     */
/* async-region gallery will need), spread-on-simple.                   */
/* ------------------------------------------------------------------ */

const FOUR_EDGE_ITEMS: Record<BlockSide, PortEdgeItem[]> = {
  left: [
    { id: "in-a", label: "a", state: "wired" },
    { id: "in-b", label: "b", state: "empty" },
    { id: "in-c", label: "c", state: "empty" },
  ],
  right: [
    { id: "out-a", label: "x", state: "wired" },
    { id: "out-b", label: "y", state: "empty" },
  ],
  top: [
    { id: "top-a", label: "cfg", state: "valueSet" },
    { id: "top-b", label: "clk", state: "empty" },
  ],
  bottom: [
    { id: "bot-a", label: "log", state: "empty" },
    { id: "bot-b", label: "err", state: "received" },
  ],
};

const FOUR_EDGES: BlockSide[] = ["top", "right", "bottom", "left"];

function FourEdgesDemo() {
  return (
    <Stage label="four walls at once · simple face, ports spread (collapsePorts=false)">
      <BlockPort
        id="hub"
        view="simple"
        collapsePorts={false}
        edges={{
          left: { items: FOUR_EDGE_ITEMS.left },
          right: { items: FOUR_EDGE_ITEMS.right },
          // Found by looking at this story, not by measuring it: the DOTS
          // never collide (the end insets guarantee that, and the play
          // function proves it pairwise) — but the LABELS do. Every wall
          // flows its labels inward by default (`inwardTextLayout`), so near
          // a corner the top wall's first label and the left wall's first
          // label are both trying to occupy the same inside corner. That is
          // a corner property, not a size one: growing the Block does not
          // separate them.
          //
          // Flowing the horizontal walls' labels OUTWARD is a story-level
          // fix through the reach-past seam, not a component change — which
          // is the right layer for it, because which way a label flows is a
          // presentation choice a host makes per wall, and PortEdge already
          // exposes the whole `PortTextLayout` vocabulary for it. Reported
          // as a known limit of the inward default rather than papered over.
          top: { items: FOUR_EDGE_ITEMS.top, portEdgeProps: { textLayout: "top" } },
          bottom: { items: FOUR_EDGE_ITEMS.bottom, portEdgeProps: { textLayout: "bot" } },
        }}
      >
        <HubFace />
      </BlockPort>
    </Stage>
  );
}

export const FourEdges: Story = {
  render: () => <FourEdgesDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const { block } = bandOf(wrapper);
    await expect(wrapper.querySelectorAll('[data-slot="block-port-rail"]')).toHaveLength(4);

    const centresByEdge = new Map<BlockSide, { x: number; y: number }[]>();
    for (const edge of FOUR_EDGES) {
      const rail = railOf(wrapper, edge);
      const dots = railDotCentres(rail);
      await expect(dots).toHaveLength(FOUR_EDGE_ITEMS[edge].length);
      centresByEdge.set(edge, dots);

      const vertical = edge === "left" || edge === "right";
      const wallLine = edge === "left" ? block.left : edge === "right" ? block.right : edge === "top" ? block.top : block.bottom;
      for (const dot of dots) {
        expectWithin(vertical ? dot.x : dot.y, wallLine, 1, `${edge} wall — dot centre vs the wall line`);
      }

      // The donor's constant corner clearance, at BOTH corners: 18px of
      // wall, then half a slot to the first dot's centre.
      const along = dots.map((d) => (vertical ? d.y : d.x));
      const start = vertical ? block.top : block.left;
      const end = vertical ? block.bottom : block.right;
      expectWithin(along[0] - start, RAIL_END_MARGIN_PX + RAIL_SLOT_MAIN_PX / 2, 2, `${edge} wall — first dot vs the leading corner`);
      expectWithin(end - along[along.length - 1], RAIL_END_MARGIN_PX + RAIL_SLOT_MAIN_PX / 2, 2, `${edge} wall — last dot vs the trailing corner`);
      expectUniform(railPitches(rail, vertical ? "column" : "row"), 1, `${edge} wall — pitch uniformity`);
    }

    // Corner collision, measured pairwise: no dot from one wall lands
    // within a dot-diameter of a dot on another wall. This is the claim
    // §4 makes about the end insets, asserted rather than assumed.
    for (let i = 0; i < FOUR_EDGES.length; i++) {
      for (let j = i + 1; j < FOUR_EDGES.length; j++) {
        for (const a of centresByEdge.get(FOUR_EDGES[i])!) {
          for (const b of centresByEdge.get(FOUR_EDGES[j])!) {
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (!(distance > PORT_DIAMETERS.md)) {
              throw new Error(`${FOUR_EDGES[i]} and ${FOUR_EDGES[j]} walls collide — dots ${distance.toFixed(2)}px apart, need more than ${PORT_DIAMETERS.md}px`);
            }
          }
        }
      }
    }

    // Nothing collapsed: `collapsePorts={false}` on a Simple face is the
    // donor's communication reading, and it must keep every port's own dot.
    await expect(wrapper.querySelectorAll("[data-collapsed-ports]")).toHaveLength(0);
  },
};

/* ------------------------------------------------------------------ */
/* StackingAboveBlock — the z-rule on its own, over a filled body so    */
/* the overlap is visible as well as measurable.                        */
/* ------------------------------------------------------------------ */

function StackingDemo() {
  return (
    <Stage label="the port edge paints above the block (Zach's z-rule — the donor's is the reverse)">
      <BlockPort
        id="stack"
        view="port"
        edges={{ left: { items: INPUTS }, right: { items: OUTPUTS } }}
      >
        <Block
          header="Planner"
          // An opaque, mid-contrast panel in BOTH themes: the z-rule is only
          // visible if the pixels a dot's inner half lands on would
          // otherwise be the card's. `var(--accent)` is near-invisible
          // against `var(--card)` in the dark theme, which made the point
          // of this story impossible to see.
          body={<div style={{ width: "100%", height: "100%", background: "color-mix(in srgb, var(--foreground) 22%, var(--card))", borderRadius: 4 }} />}
          footer="ready"
          width={220}
          height={240}
        />
      </BlockPort>
    </Stage>
  );
}

export const StackingAboveBlock: Story = {
  render: () => <StackingDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const block = required<HTMLElement>(wrapper, ':scope > [data-slot="block"]', "the Block");

    // DOM order is a redundant guarantee, not the mechanism (see
    // blockPort.tsx's own correction) — asserted anyway, because it is
    // the one of the three that a reader can check by eye.
    const children = Array.from(wrapper.children);
    const blockIndex = children.indexOf(block);
    for (const rail of Array.from(wrapper.querySelectorAll<HTMLElement>(':scope > [data-slot="block-port-rail"]'))) {
      await expect(children.indexOf(rail)).toBeGreaterThan(blockIndex);
    }

    // ...and the hit test is the proof. Probe every dot on both walls, a
    // few px INSIDE the card, where the Block would win if it painted last.
    for (const [edge, dx] of [["left", 4], ["right", -4]] as const) {
      for (const dot of railDotCentres(railOf(wrapper, edge))) {
        expectRailPaintsAboveBlock(dot, { dx, dy: 0 }, `${edge} rail stacking`);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* FunctionPort — the header's reserved "pin 1". Zach, 2026-09-17, on a */
/* variable that is itself a function: "we reserve a special port on   */
/* the header left edge... at most 1 port there and you cannot move    */
/* it... a toggle on or off port." `LabeledPort` with its label         */
/* disabled, per Zach: "make that a labeled port, just without a label  */
/* for now, or disable the label."                                      */
/* ------------------------------------------------------------------ */

/** Independent of `BlockPort`'s own band math — re-measures the header
 *  straight off the DOM, the same discipline `bandOf` already applies, so a
 *  bug in `functionPortCenterPx` cannot hide behind itself. */
function headerCenterOf(wrapper: HTMLElement): number {
  const header = required<HTMLElement>(wrapper, ':scope > [data-slot="block"] > [data-slot="block-header"]', "the block header");
  const rect = header.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function functionPortHolderOf(wrapper: HTMLElement): HTMLElement | null {
  return wrapper.querySelector<HTMLElement>(':scope > [data-slot="block-port-function"]');
}

/**
 * A genuinely TALL header that is still ONE LINE of text — the second
 * header SIZE (S5: if the dot's Y came from some constant instead of a
 * real measurement, this is the fixture that would catch it). Previously
 * this was two lines with an explicit `<br/>` — Zach, 2026-09-17: "please
 * get rid of this Two line function port. this is not a part of our
 * visual language, two lines per port." The specimen only ever needed
 * HEIGHT, not a second line — larger type and generous `lineHeight` reach
 * the same S5 point without it.
 */
function TallHeader() {
  return (
    <div data-slot="tall-header-text" style={{ fontSize: 20, lineHeight: "40px" }}>
      Tall Header
    </div>
  );
}

function FunctionPortPanel({
  id,
  view,
  functionPort,
  header = "Planner",
  width = 200,
  height = 140,
}: {
  id: string;
  view: BlockView;
  functionPort: boolean;
  header?: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <BlockPort id={id} view={view} edges={{}} functionPort={functionPort}>
      <Block header={header} body="body" width={width} height={height} />
    </BlockPort>
  );
}

function FunctionPortGallery() {
  const views: BlockView[] = ["simple", "port", "expanded"];
  return (
    <div style={{ display: "flex", gap: 40, padding: "48px 64px" }}>
      {views.map((view) => (
        <div key={view} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            {BLOCK_VIEW_LABELS[view]}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>off</span>
            <FunctionPortPanel id={`fn-${view}-off`} view={view} functionPort={false} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>on</span>
            <FunctionPortPanel id={`fn-${view}-on`} view={view} functionPort={true} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          Port · tall header
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>on</span>
          <FunctionPortPanel id="fn-port-tall-on" view="port" functionPort={true} header={<TallHeader />} height={160} />
        </div>
      </div>
    </div>
  );
}

export const FunctionPort: Story = {
  render: () => <FunctionPortGallery />,
  play: async ({ canvasElement }) => {
    const views: BlockView[] = ["simple", "port", "expanded"];

    for (const view of views) {
      // Off: the wrapper mounts nothing for the function port at all.
      const off = required<HTMLElement>(canvasElement, `[data-block-id="fn-${view}-off"]`, `the ${view} off panel`);
      await expect(off.querySelectorAll('[data-slot="block-port-function"]')).toHaveLength(0);

      // On: EXACTLY one — never zero, never a rail's worth.
      const on = required<HTMLElement>(canvasElement, `[data-block-id="fn-${view}-on"]`, `the ${view} on panel`);
      const holders = on.querySelectorAll<HTMLElement>('[data-slot="block-port-function"]');
      await expect(holders).toHaveLength(1);
      const dots = holders[0].querySelectorAll<HTMLElement>('[data-slot="port-dot"]');
      await expect(dots).toHaveLength(1);

      // Vertically centred on the header band's OWN centre line, measured
      // independently of the component's internal band math — across every
      // view the component supports, so this survives a view switch.
      const dotCentreY = dots[0].getBoundingClientRect().top + dots[0].getBoundingClientRect().height / 2;
      expectWithin(dotCentreY, headerCenterOf(on), 1, `${view} — function port centre vs the header band's own centre line`);

      // Horizontally, the same wall convention every rail dot straddles.
      const block = required<HTMLElement>(on, ':scope > [data-slot="block"]', "the Block");
      const dotCentreX = dots[0].getBoundingClientRect().left + dots[0].getBoundingClientRect().width / 2;
      expectWithin(dotCentreX, block.getBoundingClientRect().left, 1, `${view} — function port centre vs the Block's left wall`);
    }

    // A SECOND, visibly different header size (S5's own point: two sizes,
    // so this cannot pass by a constant that happens to match one of them).
    const tall = required<HTMLElement>(canvasElement, '[data-block-id="fn-port-tall-on"]', "the tall-header panel");
    const tallDot = required<HTMLElement>(tall, '[data-slot="block-port-function"] [data-slot="port-dot"]', "the tall panel's function port dot");
    const tallHeader = required<HTMLElement>(tall, ':scope > [data-slot="block"] > [data-slot="block-header"]', "the tall header");
    await expect(tallHeader.getBoundingClientRect().height).toBeGreaterThan(30); // genuinely taller than the single-line panels above
    const tallDotY = tallDot.getBoundingClientRect().top + tallDot.getBoundingClientRect().height / 2;
    expectWithin(tallDotY, headerCenterOf(tall), 1, "tall header — function port centre vs the header band's own centre line");

    // "Tall" must not mean "two lines" (Zach, 2026-09-17: "two lines per
    // port" is not the visual language) — a `Range` over the text node's
    // own client rects is the measurement, stronger than a height guess:
    // a wrapped or `<br/>`-split node reports more than one rect, a
    // genuinely single-line one reports exactly one, however tall it is.
    const tallHeaderText = required<HTMLElement>(tall, '[data-slot="tall-header-text"]', "the tall header's text");
    // The WHOLE element's contents, not just its first child — a `<br/>`
    // between two text nodes would otherwise hide behind a range that only
    // ever looked at the first one.
    const range = document.createRange();
    range.selectNodeContents(tallHeaderText);
    await expect(range.getClientRects().length).toBe(1);
  },
};

/* ------------------------------------------------------------------ */
/* FunctionPortIsFixed — Zach: "make sure to have a story to show      */
/* this" (the port cannot be dragged). A story where NOTHING moves      */
/* proves nothing on its own — a broken drag system would look          */
/* identical. The left rail beside it is the CONTROL: same Block, same   */
/* drag gesture, and it genuinely reorders — which is what gives the     */
/* function port's non-movement teeth.                                  */
/* ------------------------------------------------------------------ */

/**
 * `PortEdge.stories.tsx`'s `dragCard`, reused by value (Block.stories.tsx
 * already does the same): a genuine `@dnd-kit/core` `PointerSensor` drag,
 * not a style-only stand-in. `isPrimary: true` is load-bearing — dnd-kit's
 * activator silently no-ops on a synthetic `PointerEvent` without it.
 */
async function dragElement(from: Element, to: Element) {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
}

function FunctionPortIsFixedDemo() {
  const [inputs, setInputs] = useState(INPUTS);
  return (
    <Stage label="pin 1 is fixed · the left rail beside it (control) genuinely reorders">
      <BlockPort id="fn-fixed" view="port" edges={{ left: { items: inputs, onItemsChange: setInputs } }} functionPort>
        <BandedFace />
      </BlockPort>
    </Stage>
  );
}

export const FunctionPortIsFixed: Story = {
  render: () => <FunctionPortIsFixedDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);
    const rail = railOf(wrapper, "left");
    const holder = required<HTMLElement>(wrapper, '[data-slot="block-port-function"]', "the function port");
    const dot = required<HTMLElement>(holder, '[data-slot="port-dot"]', "the function port's dot");

    // Structural proof, ahead of the gesture: the function port carries
    // none of dnd-kit's `useSortable` attributes and sits nowhere near a
    // `PortEdge` track — it was never wired to a drag system to begin with.
    await expect(holder.getAttribute("role")).toBeNull();
    await expect(holder.hasAttribute("tabindex")).toBe(false);
    await expect(holder.closest('[data-slot="port-edge"]')).toBeNull();
    await expect(holder.closest('[data-slot="block-port-rail"]')).toBeNull();

    // CONTROL: drag the rail's first card past its last — a genuine
    // dnd-kit reorder, proving the drag mechanism used below actually
    // works in this story (so "nothing moved" cannot be a broken harness).
    const railIdsBefore = Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
    await expect(railIdsBefore).toEqual(["pose", "gain", "reset"]);
    const cards = Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-edge-card"]'));
    await dragElement(cards[0], cards[cards.length - 1]);
    const railIdsAfter = Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
    await expect(railIdsAfter).not.toEqual(railIdsBefore);
    await expect(railIdsAfter[0]).not.toBe("pose"); // "pose" moved off the top slot

    // TARGET: the identical gesture on the function port — same helper,
    // same distance, aimed at the same rail — changes nothing.
    const before = dot.getBoundingClientRect();
    await dragElement(dot, cards[cards.length - 1]);
    const after = dot.getBoundingClientRect();
    expectWithin(after.left, before.left, 1, "function port x after an attempted drag");
    expectWithin(after.top, before.top, 1, "function port y after an attempted drag");

    // And it never joined the rail it was dragged toward.
    const railIdsAfterAttempt = Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
    await expect(railIdsAfterAttempt).toEqual(railIdsAfter);
  },
};

/* ------------------------------------------------------------------ */
/* FunctionPortHeaderInset — D-5: the header's own content starts on    */
/* the same x as a body port's LABEL, not the dot. Zach's screenshot     */
/* (153855) draws the rule literally — CURRENT BAD has "Planner" hard    */
/* against the dot, DESIRED insets it, and a third panel's red line runs */
/* through the labels below ("offset is same as ports.."), not the      */
/* dots. "If there is no label then... the bar content should start     */
/* where the label would start" — measured the SAME way either way,     */
/* below, since `LabeledPort`'s label span exists (and sits at its final */
/* x) whether or not it holds text.                                     */
/* ------------------------------------------------------------------ */

type HeaderShapeKind = "iconTitle" | "titleBadge" | "full";

/**
 * A stable seam the play function measures off, whatever sits inside it.
 * Three shapes, matching screenshot 153655's own stack (glyph + title +
 * badge + type) plus two smaller cuts of it — Zach's own ask was to "test
 * the function port out with a couple different styles of headers".
 */
function HeaderContentRow({ shape }: { shape: HeaderShapeKind }) {
  const row = { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } as const;
  switch (shape) {
    case "iconTitle":
      return (
        <div data-slot="block-port-header-content" style={row}>
          <Glyph content="lucide:rocket" />
          <EditableText size="sm">Planner</EditableText>
        </div>
      );
    case "titleBadge":
      return (
        <div data-slot="block-port-header-content" style={row}>
          <EditableText size="sm">Planner</EditableText>
          <Badge variant="secondary">Draft 1</Badge>
        </div>
      );
    case "full":
      return (
        <div data-slot="block-port-header-content" style={row}>
          <Glyph content="lucide:anchor" />
          <EditableText size="sm">Planner</EditableText>
          <Badge variant="secondary">Draft 1</Badge>
          <EditableText size="sm" className="text-muted-foreground" style={{ fontSize: 12 }}>
            Type
          </EditableText>
        </div>
      );
  }
}

/**
 * D-5's fix, applied the way `BlockPort` itself never can — it does not
 * touch a header's content (D-A1's own rule: `Block` is composed from the
 * outside). `Bar`'s own public `style` prop overrides its `px-3` gutter on
 * this ONE side, to exactly where a body port's label starts
 * (`functionPortHeaderInsetPx`, blockPort.layout.ts) — not a hardcoded
 * pixel, and not a second padding stacked on top of Bar's own (`Block`
 * zeroes its own header padding whenever a `<Bar>` is the direct child, so
 * Bar's inline override is the ONLY source of the inset).
 */
function insettedHeaderBar(shape: HeaderShapeKind, barSize: BarSize, diameter: PortSize): ReactNode {
  return <Bar size={barSize} left={<HeaderContentRow shape={shape} />} style={{ paddingLeft: functionPortHeaderInsetPx(diameter) }} />;
}

const HEADER_INSET_SPECS: { id: string; shape: HeaderShapeKind; barSize: BarSize; label: string }[] = [
  { id: "hi-icon-sm-label", shape: "iconTitle", barSize: "sm", label: "pose" },
  { id: "hi-icon-sm-empty", shape: "iconTitle", barSize: "sm", label: "" },
  { id: "hi-badge-md-label", shape: "titleBadge", barSize: "md", label: "pose" },
  { id: "hi-badge-md-empty", shape: "titleBadge", barSize: "md", label: "" },
  { id: "hi-full-lg-label", shape: "full", barSize: "lg", label: "pose" },
  { id: "hi-full-lg-empty", shape: "full", barSize: "lg", label: "" },
];

function HeaderInsetPanel({ id, shape, barSize, label }: { id: string; shape: HeaderShapeKind; barSize: BarSize; label: string }) {
  const diameter: PortSize = "md";
  // "full" (glyph + title + badge + type) is the widest shape — a fixed
  // 240px truncates it mid-word, which is a card-width choice, not
  // something D-5's inset is responsible for proving.
  const width = shape === "full" ? 320 : 240;
  return (
    <BlockPort id={id} view="port" functionPort diameter={diameter} edges={{ left: { items: [{ id: "in", label, state: "empty" }] } }}>
      <Block header={insettedHeaderBar(shape, barSize, diameter)} body="body" width={width} height={140} />
    </BlockPort>
  );
}

function FunctionPortHeaderInsetGallery() {
  return (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap", padding: "48px 64px" }}>
      {HEADER_INSET_SPECS.map((spec) => (
        <div key={spec.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            {spec.shape} · {spec.barSize} · {spec.label ? "label" : "no label"}
          </span>
          <HeaderInsetPanel id={spec.id} shape={spec.shape} barSize={spec.barSize} label={spec.label} />
        </div>
      ))}
    </div>
  );
}

function headerContentLeftOf(wrapper: HTMLElement): number {
  const content = required<HTMLElement>(wrapper, '[data-slot="block-port-header-content"]', "the header's content row");
  return content.getBoundingClientRect().left;
}

/**
 * Measured off the REAL rendered label, whether or not it holds text — a
 * `DefaultPortLabel` span exists, and sits at its final x, even when
 * `children` is empty (D2). So "where the label would start" and "where a
 * real label starts" are the SAME measurement here, never a formula
 * standing in for one of them.
 */
function bodyPortLabelLeftOf(wrapper: HTMLElement): number {
  const label = required<HTMLElement>(
    wrapper,
    '[data-slot="block-port-rail"][data-edge="left"] [data-slot="port-label"]',
    "the left rail's port label",
  );
  return label.getBoundingClientRect().left;
}

export const FunctionPortHeaderInset: Story = {
  render: () => <FunctionPortHeaderInsetGallery />,
  play: async ({ canvasElement }) => {
    for (const spec of HEADER_INSET_SPECS) {
      const wrapper = required<HTMLElement>(canvasElement, `[data-block-id="${spec.id}"]`, `the ${spec.id} panel`);
      const headerLeft = headerContentLeftOf(wrapper);
      const labelLeft = bodyPortLabelLeftOf(wrapper);
      // D1 (a real label) and D2 (no label) are literally the same
      // assertion, run over both — see bodyPortLabelLeftOf's own note.
      expectWithin(headerLeft, labelLeft, 1, `${spec.id} — header content left vs body port label left`);
    }

    // Two distinct Bar SIZES are actually exercised above (sm, md, lg) —
    // proving the inset doesn't quietly depend on the Bar's own height.
    const sizes = new Set(HEADER_INSET_SPECS.map((s) => s.barSize));
    await expect(sizes.size).toBeGreaterThanOrEqual(2);
  },
};

/* ------------------------------------------------------------------ */
/* PortPopulationDefaults — E-3, assigned here because `BlockPort` is    */
/* the one component that sees every edge at once. Zach, 2026-09-17:    */
/* "if port edges on all 4 sides. then the edges should all be          */
/* distribute and around. if port edges just on left or right, then it  */
/* should be aligned to edge and to the start... if there is only 1     */
/* port it should be in the middle."                                    */
/* ------------------------------------------------------------------ */

const POP_LEFT: PortEdgeItem[] = [
  { id: "a", label: "a", state: "empty" },
  { id: "b", label: "b", state: "empty" },
];
const POP_RIGHT: PortEdgeItem[] = [
  { id: "x", label: "x", state: "empty" },
  { id: "y", label: "y", state: "empty" },
];
// Deliberately ONE port — "if there is only 1 port it should be in the
// middle" (D3's own claim, not a special case: `mainAxisPositions`'s
// `space-around` branch already centres a lone box).
const POP_TOP: PortEdgeItem[] = [{ id: "cfg", label: "cfg", state: "empty" }];
const POP_BOTTOM: PortEdgeItem[] = [
  { id: "log", label: "log", state: "empty" },
  { id: "err", label: "err", state: "empty" },
];

/** D4's explicit win: the same aligned/start pairing E-3's OWN "left/right
 *  only" default would have produced — deliberately, so what proves the
 *  override worked is that it DISAGREES with the population default
 *  (`distribute/space-around`) the same right edge gets in `pop-four`. */
const EXPLICIT_RIGHT_OVERRIDE: Distribution = { mode: "aligned", anchor: "start", gap: RAIL_GAP_PX, edgePadding: 0 };

function PortPopulationDemo() {
  return (
    <div style={{ display: "flex", gap: 48, flexWrap: "wrap", padding: "48px 64px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>left/right only — aligned to the start</span>
        <BlockPort id="pop-lr" view="port" edges={{ left: { items: POP_LEFT }, right: { items: POP_RIGHT } }}>
          <BandedFace width={200} height={220} />
        </BlockPort>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>all four walls — distribute/around, the lone top port centred</span>
        <BlockPort
          id="pop-four"
          view="port"
          edges={{ left: { items: POP_LEFT }, right: { items: POP_RIGHT }, top: { items: POP_TOP }, bottom: { items: POP_BOTTOM } }}
        >
          <BandedFace width={200} height={220} />
        </BlockPort>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>same four walls, right edge's `distribution` set explicitly — D4</span>
        <BlockPort
          id="pop-override"
          view="port"
          edges={{
            left: { items: POP_LEFT },
            right: { items: POP_RIGHT, distribution: EXPLICIT_RIGHT_OVERRIDE },
            top: { items: POP_TOP },
            bottom: { items: POP_BOTTOM },
          }}
        >
          <BandedFace width={200} height={220} />
        </BlockPort>
      </div>
    </div>
  );
}

export const PortPopulationDefaults: Story = {
  render: () => <PortPopulationDemo />,
  play: async ({ canvasElement }) => {
    const lrWrapper = required<HTMLElement>(canvasElement, '[data-block-id="pop-lr"]', "the left/right-only panel");
    const fourWrapper = required<HTMLElement>(canvasElement, '[data-block-id="pop-four"]', "the all-four-walls panel");
    const overrideWrapper = required<HTMLElement>(canvasElement, '[data-block-id="pop-override"]', "the override panel");

    const lrLeftDots = railDotCentres(railOf(lrWrapper, "left"));
    const fourLeftDots = railDotCentres(railOf(fourWrapper, "left"));
    await expect(lrLeftDots).toHaveLength(2);
    await expect(fourLeftDots).toHaveLength(2);

    // D3: same items (POP_LEFT), same block size — the ONLY difference
    // between `pop-lr` and `pop-four` is whether a top/bottom wall is ALSO
    // populated, and that alone must move the left rail's own dots
    // (aligned/start packs from the body top; distribute/space-around
    // leaves margin before the first dot). Measured, not read off a prop.
    await expect(Math.abs(lrLeftDots[0].y - fourLeftDots[0].y)).toBeGreaterThan(2);

    // D3's other half: the lone top port centres on the wall.
    const fourBlock = bandOf(fourWrapper).block;
    const topDots = railDotCentres(railOf(fourWrapper, "top"));
    await expect(topDots).toHaveLength(1);
    expectWithin(topDots[0].x, fourBlock.left + fourBlock.width / 2, 1, "pop-four — the lone top port centred on the wall");

    // D4: an explicit per-edge `distribution` still wins over the
    // population default. Same all-four-walls population as `pop-four`,
    // but the RIGHT edge is pinned to aligned/start explicitly — its dots
    // must land somewhere different from `pop-four`'s own (default) right
    // rail, which reads distribute/space-around.
    const fourRightDots = railDotCentres(railOf(fourWrapper, "right"));
    const overrideRightDots = railDotCentres(railOf(overrideWrapper, "right"));
    await expect(fourRightDots).toHaveLength(2);
    await expect(overrideRightDots).toHaveLength(2);
    await expect(Math.abs(fourRightDots[0].y - overrideRightDots[0].y)).toBeGreaterThan(2);

    // And the override left every OTHER edge alone — the left rail still
    // reads the population default, matching `pop-four`'s own left rail.
    const overrideLeftDots = railDotCentres(railOf(overrideWrapper, "left"));
    expectWithin(overrideLeftDots[0].y, fourLeftDots[0].y, 1, "pop-override — untouched left rail matches the default four-wall reading");
  },
};

/* ------------------------------------------------------------------ */
/* SimpleFaceCollapsedCount — "+X ports" (screenshot 153001): "In       */
/* simple view perhaps have option to show text here showing +X ports". */
/* `renderCollapsed` already draws the one stand-in dot (D-A7); this     */
/* proves the count sitting beside it names the TRUE hidden count.      */
/* ------------------------------------------------------------------ */

function SimpleFaceCollapsedCountDemo() {
  return (
    <Stage label="simple face · a wall's single dot names how many ports it stands for">
      <BlockPort id="collapsed-count" view="simple" edges={{ left: { items: INPUTS }, right: { items: OUTPUTS } }}>
        <SimpleFace width={220} height={200} />
      </BlockPort>
    </Stage>
  );
}

export const SimpleFaceCollapsedCount: Story = {
  render: () => <SimpleFaceCollapsedCountDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = wrapperOf(canvasElement);

    for (const [edge, items] of [
      ["left", INPUTS],
      ["right", OUTPUTS],
    ] as const) {
      const rail = railOf(wrapper, edge);
      // Exactly one painted dot for the whole wall.
      await expect(railDotCentres(rail)).toHaveLength(1);

      const count = required<HTMLElement>(rail, '[data-slot="block-port-collapsed-count"]', `the ${edge} wall's collapsed count`);
      const trueHiddenCount = items.length;

      // The text says the NUMBER, not just "some" — parsed back out rather
      // than string-matched against the literal template, so a wording
      // change can't silently stop checking the count.
      const match = (count.textContent ?? "").match(/\+(\d+) ports/);
      if (!match) throw new Error(`${edge} wall — expected "+N ports", got "${count.textContent}"`);
      await expect(Number(match[1])).toBe(trueHiddenCount);
      await expect(Number(count.getAttribute("data-collapsed-count"))).toBe(trueHiddenCount);
    }
  },
};
