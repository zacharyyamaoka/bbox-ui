import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import type { EditorView } from "@codemirror/view";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import type { PortEdgeItem } from "../components/portEdge";
import { TRACE_TERMINAL_GAP } from "../components/trace";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "../components/trace.layout";
// WHY the wired set comes from the scene kit while `Wire` stays a paint
// type: the scene lane absorbed `wiredPortKeys`/`withWiredState` out of
// `wiring.ts` (docs/SCENE-KIT.md) so the derivation has ONE owner. `Wire`
// survives there as `WireLayer`'s prop vocabulary — paint only — which is
// why this file still imports it from a component and the derivation from
// `scene/`. Caught by `tsc` after a CLEAN git merge: this file and the
// scene kit never touched the same lines.
import { type Wire } from "../components/wiring";
import { wiredPorts, type SceneEdgeEnds } from "../scene/scene";
import { withWiredState } from "../scene/sceneWires";
import { WireLayer } from "../components/wireLayer";
import { ValueCapsule, VALUE_PILL_RADIUS_CLAMP_PX } from "./value/value";

/**
 * Presets/Value — the Value capsule, the first entry in the presets
 * catalogue (Zach, 2026-09-17: "We will have lots of block presets coming
 * up. Each should kinda get their own folder as if it was a component,
 * even though its just a preset.").
 *
 * WHY a TOP-LEVEL `Presets/` group rather than `Blocks/Presets/Value`:
 * presets get peer status with components — that is the whole ask. Nested
 * under `Blocks/` they would read as Block variants three levels deep,
 * competing with Block's own component stories; at the top level the group
 * is a catalogue ("what ready-made configurations exist?") that any future
 * preset joins by adding `Presets/<Name>`, whatever family of components it
 * happens to compose. The convention is one line: one folder under
 * `src/presets/<name>/`, one story file titled `Presets/<Name>`.
 *
 * Every geometric claim below is measured (`getComputedStyle`,
 * `getBoundingClientRect`, `getPointAtLength`), never DOM-presence-asserted.
 */

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                 */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (±${tolerance}), off by ${delta.toFixed(2)}`);
  }
}

/** The capsule's Block root, found via the wrapper `BlockPort` stamps. */
function capsuleBlockOf(root: ParentNode, id: string): HTMLElement {
  const wrapper = required<HTMLElement>(root, `[data-block-id="${id}"]`, `capsule \`${id}\``);
  return required<HTMLElement>(wrapper, ':scope > [data-slot="block"]', `capsule \`${id}\`'s Block`);
}

function computedRadiusPx(block: HTMLElement): number {
  const style = getComputedStyle(block);
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
  const values = corners.map((c) => Number.parseFloat(c));
  for (const v of values) {
    if (Math.abs(v - values[0]) > 0.01) throw new Error(`capsule corners disagree: ${corners.join(" / ")}`);
  }
  return values[0];
}

/**
 * V1 — the pill contract, for a capsule given an EXPLICIT height: the
 * computed border-radius must equal half the rendered height. A hardcoded
 * radius that happens to look right at one height fails this the moment a
 * second height renders.
 */
function expectPill(block: HTMLElement, what: string): void {
  const rect = block.getBoundingClientRect();
  expectWithin(computedRadiusPx(block), rect.height / 2, 1, `${what} · border-radius vs height/2 (h=${rect.height.toFixed(1)})`);
}

/**
 * The HUGGING capsule's version of the same contract. Its computed radius
 * is the clamp constant, and the pill geometry comes from CSS's own
 * overlapping-curves reduction (Backgrounds & Borders §5.5): with equal
 * corners, the two radii sharing each vertical edge sum to 2r > height, so
 * the USED radius is exactly height/2 — identical rendered geometry to the
 * explicit branch. What is assertable from JS: the computed value really is
 * the clamp constant (≥ height/2, so the clamp engages), and width ≥ height
 * (the precondition for the clamp landing on the HEIGHT, i.e. a pill, not
 * an egg).
 */
function expectClampedPill(block: HTMLElement, what: string): void {
  const rect = block.getBoundingClientRect();
  const radius = computedRadiusPx(block);
  if (!(radius >= rect.height / 2)) {
    throw new Error(`${what} · clamp radius ${radius}px does not exceed height/2 (${(rect.height / 2).toFixed(1)}px) — the overlap clamp never engages`);
  }
  expectWithin(radius, VALUE_PILL_RADIUS_CLAMP_PX, 0.5, `${what} · hugging capsule carries the clamp constant`);
  if (!(rect.width >= rect.height)) {
    throw new Error(`${what} · width ${rect.width.toFixed(1)} < height ${rect.height.toFixed(1)} — not a pill, the clamp would land on the width`);
  }
}

/** V3 — no header, no footer, as OMITTED REGIONS: the DOM nodes must not
 *  exist at all (block.tsx renders nothing for an `undefined` slot — this
 *  asserts the preset actually leaves them undefined). */
function expectNoHeaderNoFooter(block: HTMLElement, what: string): void {
  if (block.querySelector(':scope > [data-slot="block-header"]')) throw new Error(`${what} · a header region exists in the DOM`);
  if (block.querySelector(':scope > [data-slot="block-footer"]')) throw new Error(`${what} · a footer region exists in the DOM`);
}

/** V4 (structure half) — the body holds exactly one CodeEditor and it is
 *  single-line. */
function expectSingleLineEditor(block: HTMLElement, what: string): HTMLElement {
  const editors = block.querySelectorAll<HTMLElement>('[data-slot="code-editor"]');
  if (editors.length !== 1) throw new Error(`${what} · expected exactly 1 CodeEditor in the capsule, found ${editors.length}`);
  const editor = editors[0];
  if (editor.getAttribute("data-multiline") !== "false") throw new Error(`${what} · the capsule's editor is not single-line`);
  if (!editor.closest('[data-slot="block-body"]')) throw new Error(`${what} · the editor is not in the body region`);
  return editor;
}

function dotCentre(dot: HTMLElement): { x: number; y: number } {
  const r = dot.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * V2 — Zach's pill argument, asserted: a collapsed wall's one dot sits at
 * the capsule's vertical centre, which is exactly the centre of the pill's
 * rounded end ("if you have collapsed ports they will always go to the
 * center of the diameter anyways"). Also pins the dot to the wall line, so
 * "the centre of the diameter" is measured in both axes, not just Y.
 */
function expectCollapsedDotCentred(root: ParentNode, id: string, edge: "left" | "right", what: string): void {
  const wrapper = required<HTMLElement>(root, `[data-block-id="${id}"]`, `capsule \`${id}\``);
  const block = capsuleBlockOf(root, id);
  const rail = required<HTMLElement>(wrapper, `[data-slot="block-port-rail"][data-edge="${edge}"]`, `${what} · the ${edge} rail`);
  const dots = rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"]');
  if (dots.length !== 1) throw new Error(`${what} · expected ONE collapsed dot on the ${edge} wall, found ${dots.length}`);
  const centre = dotCentre(dots[0]);
  const rect = block.getBoundingClientRect();
  expectWithin(centre.y, rect.top + rect.height / 2, 1, `${what} · ${edge} dot centre vs the capsule's vertical centre`);
  expectWithin(centre.x, edge === "left" ? rect.left : rect.right, 1, `${what} · ${edge} dot centre vs the wall line`);
}

/* ---- wire-terminal measurement, BlockWiring.stories.tsx's technique ---- */

function benchOf(canvasElement: HTMLElement, benchId: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="wire-bench"][data-bench="${benchId}"]`, `the \`${benchId}\` bench`);
}

/** The rendered dot for one port — `[data-port-id]`, or the collapsed
 *  stand-in whose `data-collapsed-ports` names it: the same reading
 *  `wireLayer.tsx`'s `resolveDot` uses, restated so the test re-finds the
 *  element instead of trusting the component. */
function dotOf(bench: HTMLElement, blockId: string, portId: string): HTMLElement {
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  const direct = block.querySelector<HTMLElement>(`[data-port-id="${portId}"]`);
  if (direct) return direct;
  for (const collapsed of Array.from(block.querySelectorAll<HTMLElement>("[data-collapsed-ports]"))) {
    if ((collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").includes(portId)) return collapsed;
  }
  throw new Error(`expected a dot for ${blockId}/${portId} in bench \`${bench.getAttribute("data-bench")}\``);
}

function stateOf(dot: HTMLElement): string | null {
  return required<HTMLElement>(dot, '[data-slot="port-dot"]', "the port dot").getAttribute("data-state");
}

async function waitForWireGroup(bench: HTMLElement, wireId: string): Promise<SVGGElement> {
  await waitFor(
    () => {
      if (!bench.querySelector(`[data-wire-id="${wireId}"]`)) {
        const layer = bench.querySelector('[data-slot="wire-layer"]');
        throw new Error(`no [data-wire-id="${wireId}"] yet — unresolved="${layer?.getAttribute("data-unresolved-wires")}"`);
      }
    },
    { timeout: 3000 },
  );
  return required<SVGGElement>(bench, `[data-wire-id="${wireId}"]`, `the rendered trace for wire \`${wireId}\``);
}

function traceLineOf(group: SVGGElement): SVGPathElement {
  return required<SVGPathElement>(group, '[data-slot="trace-line"]', "the trace's visible line");
}

function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the svg mounted?");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/**
 * V5 — a wire endpoint really lands on a real port dot. `Trace` draws its
 * line deliberately `TRACE_TERMINAL_GAP` (16px) SHORT of the terminal so
 * the arrowhead never collides with the port's ring, so the naive
 * "path endpoint == dot centre" check is always ~16px off. The true
 * terminal is reconstructed from the rendered path's own endpoint plus that
 * documented pull-back — BlockWiring.stories.tsx's technique, restated.
 */
function expectTerminalOnDot(svg: SVGSVGElement, line: SVGPathElement, end: "from" | "to", railEdge: TraceDir, dot: HTMLElement, what: string): void {
  const dir = end === "from" ? railEdge : OPPOSITE_DIR[railEdge];
  const total = line.getTotalLength();
  const local = end === "from" ? line.getPointAtLength(0) : line.getPointAtLength(total);
  const sign = end === "from" ? -1 : 1;
  const trueLocal = {
    x: local.x + sign * DIR_VECTOR[dir].x * TRACE_TERMINAL_GAP,
    y: local.y + sign * DIR_VECTOR[dir].y * TRACE_TERMINAL_GAP,
  };
  const screen = toScreen(svg, trueLocal.x, trueLocal.y);
  const centre = dotCentre(dot);
  expectWithin(screen.x, centre.x, 2, `${what} — x`);
  expectWithin(screen.y, centre.y, 2, `${what} — y`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function Stage({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "32px 56px", alignItems: "flex-start" }}>{children}</div>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{children}</div>;
}

function Labeled({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <Caption>{caption}</Caption>
      {children}
    </div>
  );
}

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

/** `Wire` (paint) → `SceneEdgeEnds` (derivation). The scene kit owns "which
 *  port is wired"; `WireLayer` still owns how a wire is drawn. One line,
 *  kept here rather than exported, because a story fixture is the only
 *  place the two vocabularies legitimately meet. */
function wireToSceneEdge(wire: Wire): SceneEdgeEnds {
  return {
    source: wire.from.blockId,
    target: wire.to.blockId,
    sourceHandle: wire.from.portId,
    targetHandle: wire.to.portId,
  };
}

function WireBench({ benchId, caption, wires, width, height, children }: { benchId: string; caption?: ReactNode; wires: Wire[]; width: number; height: number; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {caption && <Caption>{caption}</Caption>}
      <div data-slot="wire-bench" data-bench={benchId} ref={containerRef} style={{ position: "relative", width, height }}>
        {children}
        <WireLayer wires={wires} containerRef={containerRef} />
      </div>
    </div>
  );
}

const meta = {
  title: "Presets/Value",
  tags: ["object:block", "lane:baseline"],
  component: ValueCapsule,
  args: { value: "" },
} satisfies Meta<typeof ValueCapsule>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* Literals — the capsule face itself, across widths                     */
/* ==================================================================== */

/** The live EditorView of the newline-probe capsule, captured through the
 *  preset's `codeEditorProps` reach-past — the same harness idiom
 *  CodeEditor.stories.tsx established (`onViewReady`), so the "a newline
 *  cannot land by ANY path" claim is exercised as a raw transaction rather
 *  than a faked clipboard permission. */
let literalsProbeView: EditorView | null = null;

const LONG_EXPRESSION = "math.sqrt(dx * dx + dy * dy) / (2 * tolerance_budget)";

function LiteralsDemo() {
  literalsProbeView = null;
  return (
    <Stage>
      <Labeled caption="hugging literals · width follows the expression">
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <ValueCapsule id="lit-num" value="0.25" codeEditorProps={{ onViewReady: (view) => (literalsProbeView = view) }} />
          <ValueCapsule id="lit-tol" value="tol" />
          <ValueCapsule id="lit-xs" value="xs" />
          <ValueCapsule id="lit-str" value={'"hello"'} />
        </div>
      </Labeled>
      <Labeled caption="explicit width · a long expression clips, never wraps">
        <ValueCapsule id="lit-long" value={LONG_EXPRESSION} width={200} />
      </Labeled>
    </Stage>
  );
}

export const Literals: Story = {
  render: () => <LiteralsDemo />,
  play: async ({ canvasElement }) => {
    const hugIds = ["lit-num", "lit-tol", "lit-xs", "lit-str"];
    for (const id of hugIds) {
      const block = capsuleBlockOf(canvasElement, id);
      expectNoHeaderNoFooter(block, id);
      expectSingleLineEditor(block, id);
      expectClampedPill(block, id);
    }

    // Hugging capsules all share one height (one line of one font), so the
    // row reads as a family — and width genuinely follows the text.
    const heights = hugIds.map((id) => capsuleBlockOf(canvasElement, id).getBoundingClientRect().height);
    for (const h of heights) expectWithin(h, heights[0], 1, "hugging capsules share a height");
    const numW = capsuleBlockOf(canvasElement, "lit-num").getBoundingClientRect().width;
    const xsW = capsuleBlockOf(canvasElement, "lit-xs").getBoundingClientRect().width;
    if (!(numW > xsW)) throw new Error(`width does not follow the text: "0.25" (${numW.toFixed(1)}px) is not wider than "xs" (${xsW.toFixed(1)}px)`);

    // The long expression: fixed width, one line, genuinely clipped — the
    // full text is wider than the box it renders in, and no wrapping class
    // is present, so overflow is CUT rather than folded into a second row.
    const long = capsuleBlockOf(canvasElement, "lit-long");
    expectNoHeaderNoFooter(long, "lit-long");
    const longEditor = expectSingleLineEditor(long, "lit-long");
    expectWithin(long.getBoundingClientRect().width, 200, 1, "lit-long · explicit width");
    const content = required<HTMLElement>(longEditor, ".cm-content", "the long capsule's editor content");
    await expect(content.classList.contains("cm-lineWrapping")).toBe(false);
    const scroller = required<HTMLElement>(longEditor, ".cm-scroller", "the long capsule's scroller");
    if (!(scroller.scrollWidth > scroller.clientWidth)) {
      throw new Error(`lit-long · content (${scroller.scrollWidth}px) fits inside the box (${scroller.clientWidth}px) — nothing is being clipped, the fixture is vacuous`);
    }
    await expect(long.querySelectorAll(".cm-line").length).toBe(1);

    // V4, behavioural half: a newline cannot grow the box — by ANY path.
    // Enter is the exit key (blur), and an inserted "\n" is stripped by
    // singleLineGuard; both leave the capsule one line tall.
    const probe = capsuleBlockOf(canvasElement, "lit-num");
    const before = probe.getBoundingClientRect().height;
    const probeEditor = expectSingleLineEditor(probe, "lit-num");
    await userEvent.click(required<HTMLElement>(probeEditor, ".cm-content", "the probe's content"));
    await userEvent.keyboard("{Enter}");
    const view = literalsProbeView;
    if (!view) throw new Error("expected the probe capsule's EditorView to have been captured via codeEditorProps.onViewReady");
    view.dispatch({ changes: { from: 2, to: 2, insert: "a\nb" } });
    await waitFor(async () => {
      // "0." + "ab" (newline stripped) + "25" — the insert landed, minus \n.
      await expect(view.state.doc.toString()).toBe("0.ab25");
    });
    await expect(probe.querySelectorAll(".cm-line").length).toBe(1);
    expectWithin(probe.getBoundingClientRect().height, before, 0.5, "lit-num · height after a typed Enter and an inserted newline");
  },
};

/* ==================================================================== */
/* PillGeometry — V1 and V2 at three explicit heights                    */
/* ==================================================================== */

const GEOMETRY_HEIGHTS = [40, 56, 72] as const;

function PillGeometryDemo() {
  return (
    <Stage>
      {GEOMETRY_HEIGHTS.map((h) => (
        <Labeled key={h} caption={`height ${h} · radius ${h / 2}`}>
          <ValueCapsule
            id={`geo-${h}`}
            value="tol"
            width={200}
            height={h}
            writers={[{ id: "w1", label: "w1" }, { id: "w2", label: "w2" }]}
            readers={[{ id: "r1", label: "r1" }, { id: "r2", label: "r2" }, { id: "r3", label: "r3" }]}
          />
        </Labeled>
      ))}
    </Stage>
  );
}

export const PillGeometry: Story = {
  render: () => <PillGeometryDemo />,
  play: async ({ canvasElement }) => {
    for (const h of GEOMETRY_HEIGHTS) {
      const id = `geo-${h}`;
      const block = capsuleBlockOf(canvasElement, id);
      expectWithin(block.getBoundingClientRect().height, h, 1, `${id} · rendered height`);
      // V1 — radius == height/2, measured, per height. Three heights is
      // what makes a hardcoded lucky radius impossible.
      expectPill(block, id);
      expectNoHeaderNoFooter(block, id);
      expectSingleLineEditor(block, id);
      // V2 — the collapsed dot on each wall sits at the centre of the
      // pill's rounded end, at every height. The rails exist and dots have
      // rendered only after BlockPort's band measurement lands, hence the
      // waitFor around the first read.
      await waitFor(() => {
        expectCollapsedDotCentred(canvasElement, id, "left", id);
        expectCollapsedDotCentred(canvasElement, id, "right", id);
      });
    }
  },
};

/* ==================================================================== */
/* CollapsedVsExpanded — "we usually collapse them all. Maybe you want    */
/* to expand them though."                                               */
/* ==================================================================== */

const CVE_WRITERS: PortEdgeItem[] = [{ id: "set", label: "set" }, { id: "reset", label: "reset" }, { id: "clamp", label: "clamp" }];
const CVE_READERS: PortEdgeItem[] = [{ id: "ui", label: "ui" }, { id: "ctrl", label: "ctrl" }];

function CollapsedVsExpandedDemo() {
  return (
    <Stage>
      <Labeled caption="collapsed · the usual reading — one dot per wall">
        <ValueCapsule id="cve-collapsed" value="max_speed" height={48} width={220} writers={CVE_WRITERS} readers={CVE_READERS} />
      </Labeled>
      <Labeled caption="expanded · every reader and writer gets its own port">
        <ValueCapsule id="cve-expanded" value="max_speed" height={140} width={260} writers={CVE_WRITERS} readers={CVE_READERS} expanded />
      </Labeled>
    </Stage>
  );
}

export const CollapsedVsExpanded: Story = {
  render: () => <CollapsedVsExpandedDemo />,
  play: async ({ canvasElement }) => {
    /* collapsed: one dot per wall, centred, carrying every member id */
    {
      const block = capsuleBlockOf(canvasElement, "cve-collapsed");
      expectPill(block, "cve-collapsed");
      await waitFor(() => {
        expectCollapsedDotCentred(canvasElement, "cve-collapsed", "left", "cve-collapsed");
        expectCollapsedDotCentred(canvasElement, "cve-collapsed", "right", "cve-collapsed");
      });
      const wrapper = required<HTMLElement>(canvasElement, '[data-block-id="cve-collapsed"]', "the collapsed capsule");
      const leftStand = required<HTMLElement>(wrapper, '[data-slot="block-port-rail"][data-edge="left"] [data-collapsed-ports]', "the left stand-in");
      await expect((leftStand.getAttribute("data-collapsed-ports") ?? "").split(",").sort()).toEqual(CVE_WRITERS.map((w) => w.id).sort());
      const rightStand = required<HTMLElement>(wrapper, '[data-slot="block-port-rail"][data-edge="right"] [data-collapsed-ports]', "the right stand-in");
      await expect((rightStand.getAttribute("data-collapsed-ports") ?? "").split(",").sort()).toEqual(CVE_READERS.map((r) => r.id).sort());
    }

    /* expanded: each port renders as its own labelled dot, spread over the
     * pill's FULL height — no header/footer means the body band is the
     * whole block. */
    {
      const block = capsuleBlockOf(canvasElement, "cve-expanded");
      expectPill(block, "cve-expanded");
      const wrapper = required<HTMLElement>(canvasElement, '[data-block-id="cve-expanded"]', "the expanded capsule");
      await waitFor(() => {
        const leftDots = wrapper.querySelectorAll('[data-slot="block-port-rail"][data-edge="left"] [data-slot="port-dot"]');
        const rightDots = wrapper.querySelectorAll('[data-slot="block-port-rail"][data-edge="right"] [data-slot="port-dot"]');
        if (leftDots.length !== CVE_WRITERS.length) throw new Error(`expanded · left wall has ${leftDots.length} dots, want ${CVE_WRITERS.length}`);
        if (rightDots.length !== CVE_READERS.length) throw new Error(`expanded · right wall has ${rightDots.length} dots, want ${CVE_READERS.length}`);
      });
      // The writers' dots are vertically DISTINCT (really expanded, not
      // three dots painted on one spot) and all inside the block's own band.
      const rect = block.getBoundingClientRect();
      const ys = Array.from(
        wrapper.querySelectorAll<HTMLElement>('[data-slot="block-port-rail"][data-edge="left"] [data-slot="port-dot"]'),
        (dot) => dotCentre(dot).y,
      ).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        if (!(ys[i] - ys[i - 1] > 8)) throw new Error(`expanded · adjacent left dots only ${(ys[i] - ys[i - 1]).toFixed(1)}px apart — not visibly expanded`);
      }
      for (const y of ys) {
        if (!(y > rect.top && y < rect.bottom)) throw new Error(`expanded · a dot centre (${y.toFixed(1)}) sits outside the capsule band (${rect.top.toFixed(1)}..${rect.bottom.toFixed(1)})`);
      }
      // Labels exist in expanded view (collapsed view, by contrast, draws
      // bare dots — SimpleView's own donor rule).
      await expect(wrapper.querySelectorAll('[data-slot="port-label"]').length).toBeGreaterThan(0);
    }
  },
};

/* ==================================================================== */
/* Wired — "Show a bunch of examples with it being wired to and from      */
/* 1 to n components."                                                    */
/* ==================================================================== */

function ConsumerBlock({ id, title }: { id: string; title: string }) {
  return (
    <BlockPort id={id} view="port" edges={{ left: { items: [{ id: "in", label: "in", state: "wired" }] } }}>
      <Block header={title} width={100} height={60} />
    </BlockPort>
  );
}

function ProducerBlock({ id, title }: { id: string; title: string }) {
  return (
    <BlockPort id={id} view="port" edges={{ right: { items: [{ id: "out", label: "out", state: "wired" }] } }}>
      <Block header={title} width={100} height={60} />
    </BlockPort>
  );
}

/** 1 → n: one value, three readers. Every wire leaves the SAME collapsed
 *  dot — the pill's rounded-end centre — because the readers' three ports
 *  all collapse to it. */
function ReadBench() {
  const readers = ["ui", "log", "ctrl"];
  const wires: Wire[] = readers.map((r) => ({ id: `rd-${r}`, from: { blockId: "rd-val", portId: r }, to: { blockId: `rd-${r}`, portId: "in" } }));
  const wiredSet = wiredPorts({ edges: wires.map(wireToSceneEdge) });
  return (
    <WireBench benchId="read" caption="read · one value → three consumers" wires={wires} width={400} height={260}>
      <Positioned x={16} y={102}>
        {/* WHY explicit widths on every wired capsule: the collapsed wall's
         * stock "+N ports" count (BlockPort's own simple-view chrome) points
         * INTO the block on the left wall — on a text-hugging pill it lands
         * on the value itself. Seen on the first visual pass; the capsule
         * stays stock, the fixture just gives the chrome room. */}
        <ValueCapsule id="rd-val" value="tol" width={150} readers={withWiredState(readers.map((r) => ({ id: r, label: r })), "rd-val", wiredSet)} />
      </Positioned>
      {readers.map((r, i) => (
        <Positioned key={r} x={250} y={10 + i * 88}>
          <ConsumerBlock id={`rd-${r}`} title={r} />
        </Positioned>
      ))}
    </WireBench>
  );
}

/** n → 1: three writers, one value. */
function WriteBench() {
  const writers = ["init", "tune", "cal"];
  const wires: Wire[] = writers.map((w) => ({ id: `wr-${w}`, from: { blockId: `wr-${w}`, portId: "out" }, to: { blockId: "wr-val", portId: w } }));
  const wiredSet = wiredPorts({ edges: wires.map(wireToSceneEdge) });
  return (
    <WireBench benchId="write" caption="write · three producers → one value" wires={wires} width={400} height={260}>
      {writers.map((w, i) => (
        <Positioned key={w} x={16} y={10 + i * 88}>
          <ProducerBlock id={`wr-${w}`} title={w} />
        </Positioned>
      ))}
      <Positioned x={240} y={102}>
        <ValueCapsule id="wr-val" value="gain" width={150} writers={withWiredState(writers.map((w) => ({ id: w, label: w })), "wr-val", wiredSet)} />
      </Positioned>
    </WireBench>
  );
}

/** Both at once — "many readers and writers", the sentence as a picture. */
function ThroughBench() {
  const writers = ["plan", "user"];
  const readers = ["arm", "sim"];
  const wires: Wire[] = [
    ...writers.map((w) => ({ id: `th-w-${w}`, from: { blockId: `th-${w}`, portId: "out" }, to: { blockId: "th-val", portId: w } })),
    ...readers.map((r) => ({ id: `th-r-${r}`, from: { blockId: "th-val", portId: r }, to: { blockId: `th-${r}`, portId: "in" } })),
  ];
  const wiredSet = wiredPorts({ edges: wires.map(wireToSceneEdge) });
  return (
    <WireBench benchId="through" caption="both walls · two writers → the value → two readers" wires={wires} width={640} height={200}>
      {writers.map((w, i) => (
        <Positioned key={w} x={16} y={16 + i * 92}>
          <ProducerBlock id={`th-${w}`} title={w} />
        </Positioned>
      ))}
      <Positioned x={210} y={74}>
        <ValueCapsule
          id="th-val"
          value="target_pose"
          width={220}
          writers={withWiredState(writers.map((w) => ({ id: w, label: w })), "th-val", wiredSet)}
          readers={withWiredState(readers.map((r) => ({ id: r, label: r })), "th-val", wiredSet)}
        />
      </Positioned>
      {readers.map((r, i) => (
        <Positioned key={r} x={470} y={16 + i * 92}>
          <ConsumerBlock id={`th-${r}`} title={r} />
        </Positioned>
      ))}
    </WireBench>
  );
}

export const Wired: Story = {
  render: () => (
    <Stage>
      <ReadBench />
      <WriteBench />
      <ThroughBench />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    /* read · 1 → n: every wire's FROM terminal on the value's one collapsed
     * dot, every TO terminal on its consumer's own dot. */
    {
      const bench = benchOf(canvasElement, "read");
      const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      const valueDot = dotOf(bench, "rd-val", "ui");
      await expect(stateOf(valueDot)).toBe("wired"); // any-member-wired on the stand-in
      await expect(valueDot.getAttribute("data-collapsed-ports")).toBe("ui,log,ctrl");
      for (const r of ["ui", "log", "ctrl"]) {
        const group = await waitForWireGroup(bench, `rd-${r}`);
        const line = traceLineOf(group);
        expectTerminalOnDot(svg, line, "from", "right", valueDot, `read · rd-${r} from-terminal on the value's collapsed dot`);
        expectTerminalOnDot(svg, line, "to", "left", dotOf(bench, `rd-${r}`, "in"), `read · rd-${r} to-terminal on ${r}'s in dot`);
      }
    }

    /* write · n → 1 */
    {
      const bench = benchOf(canvasElement, "write");
      const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      const valueDot = dotOf(bench, "wr-val", "init");
      await expect(stateOf(valueDot)).toBe("wired");
      for (const w of ["init", "tune", "cal"]) {
        const group = await waitForWireGroup(bench, `wr-${w}`);
        const line = traceLineOf(group);
        expectTerminalOnDot(svg, line, "from", "right", dotOf(bench, `wr-${w}`, "out"), `write · wr-${w} from-terminal on ${w}'s out dot`);
        expectTerminalOnDot(svg, line, "to", "left", valueDot, `write · wr-${w} to-terminal on the value's collapsed dot`);
      }
    }

    /* through · both walls at once, and the capsule is still a pill with
     * its dots on the rounded ends' centres. */
    {
      const bench = benchOf(canvasElement, "through");
      const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      const block = capsuleBlockOf(bench, "th-val");
      expectClampedPill(block, "th-val");
      await waitFor(() => {
        expectCollapsedDotCentred(bench, "th-val", "left", "th-val");
        expectCollapsedDotCentred(bench, "th-val", "right", "th-val");
      });
      const leftDot = dotOf(bench, "th-val", "plan");
      const rightDot = dotOf(bench, "th-val", "arm");
      for (const w of ["plan", "user"]) {
        const group = await waitForWireGroup(bench, `th-w-${w}`);
        expectTerminalOnDot(svg, traceLineOf(group), "to", "left", leftDot, `through · th-w-${w} to-terminal on the writers' dot`);
      }
      for (const r of ["arm", "sim"]) {
        const group = await waitForWireGroup(bench, `th-r-${r}`);
        expectTerminalOnDot(svg, traceLineOf(group), "from", "right", rightDot, `through · th-r-${r} from-terminal on the readers' dot`);
      }
    }
  },
};

/* ==================================================================== */
/* Editing — the face IS the editor: click it, type, the pill holds       */
/* ==================================================================== */

function EditingDemo() {
  const [value, setValue] = useState("0.25");
  return (
    <Stage>
      <Labeled caption="click the value, type — the capsule stays a pill">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ValueCapsule id="edit-val" value={value} onWrite={setValue} width={200} height={48} readers={[{ id: "r1", label: "r1" }]} />
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            live value: <span data-testid="edit-value">{value}</span>
          </div>
        </div>
      </Labeled>
    </Stage>
  );
}

/** Same technique as CodeEditor.stories.tsx's `typeIntoCodeEditor` — a
 *  synthetic KeyboardEvent can't type into CodeMirror (it reads real edits
 *  off its contenteditable), but `execCommand("insertText")` performs a
 *  REAL DOM mutation with a genuine `input` event, the same path a person
 *  typing takes. */
function typeInto(content: HTMLElement, text: string) {
  content.focus();
  document.execCommand("insertText", false, text);
}

export const Editing: Story = {
  render: () => <EditingDemo />,
  play: async ({ canvasElement }) => {
    const block = capsuleBlockOf(canvasElement, "edit-val");
    const editor = expectSingleLineEditor(block, "edit-val");
    const content = required<HTMLElement>(editor, ".cm-content", "the capsule's editor content");
    const radiusAtRest = computedRadiusPx(block);
    const rectAtRest = block.getBoundingClientRect();
    expectWithin(radiusAtRest, 24, 0.5, "edit-val · radius at rest (height 48 → 24)");

    // Clicking the capsule's value opens its editor: CodeMirror takes focus
    // and shows a caret — the capsule needs no separate display/edit mode,
    // its face IS the single-line CodeEditor.
    await userEvent.click(content);
    await waitFor(async () => {
      await expect(document.activeElement === content || content.contains(document.activeElement)).toBe(true);
    });

    // Replace the whole value; the live harness receives every keystroke.
    document.execCommand("selectAll", false);
    typeInto(content, "1 / 137");
    await waitFor(async () => {
      const live = required<HTMLElement>(canvasElement, '[data-testid="edit-value"]', "the live value probe");
      await expect(live.textContent).toBe("1 / 137");
    });

    // The capsule keeps its pill shape WHILE editing — radius and box both
    // unmoved with the editor focused and a new value typed in.
    expectWithin(computedRadiusPx(block), radiusAtRest, 0.5, "edit-val · radius while editing");
    expectWithin(block.getBoundingClientRect().height, rectAtRest.height, 0.5, "edit-val · height while editing");
    expectWithin(block.getBoundingClientRect().width, rectAtRest.width, 0.5, "edit-val · width while editing");
    expectPill(block, "edit-val (editing)");

    // Enter is the exit: focus leaves the editor, the value stands.
    await userEvent.keyboard("{Enter}");
    await waitFor(async () => {
      await expect(content.contains(document.activeElement)).toBe(false);
    });
    const live = required<HTMLElement>(canvasElement, '[data-testid="edit-value"]', "the live value probe");
    await expect(live.textContent).toBe("1 / 137");
    expectPill(block, "edit-val (after exit)");
  },
};
