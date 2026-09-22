import { useRef } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Bar } from "./bar";
import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { BlockOpaqueTitle } from "./blockOpaqueTitle";
import { BlockPort, type BlockSideEffects, type MutationLink } from "./blockPort";
import { Glyph } from "./glyph";
import { paintTier } from "./paintOrder";
import type { PortEdgeItem } from "./portEdge";
import type { Wire } from "./wiring";
import { WireLayer } from "./wireLayer";

/**
 * Ports/Side effects — first-class INPUT and OUTPUT side-effect ports on a
 * Block's top wall, and the MUTATION line that says "this input is mutated
 * and leaves through that output". Everything drawn here is drawn by the
 * trunk's own `BlockPort` (`sideEffects` / `mutations` props) and the
 * existing `WireLayer` — the story only composes the fixture.
 *
 * Zach, 2026-09-22: "add first class support for output and input side
 * effect ports. Success here looks like a story for output/input
 * sideeffects that shows a gallery with these various situations." And:
 * "lets even just assume its static UI for now... and just get concrete
 * with what it looks like." So: static — no right-click, no adding ports.
 *
 * Captions are his own wording from the four sketches.
 */
const meta = {
  title: "Ports/Side effects",
  tags: ["area:ports", "lane:side-effect-ports"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const BLOCK_WIDTH = 240;
/** The expanded faces are wider, and their members inset past the rail
 *  labels ("port Any" reads inward from both walls) so a member card never
 *  lands on a label. */
const EXPANDED_WIDTH = 320;
const MEMBER_GUTTER = 88;
const PORT_FACE_HEIGHT = 230;
const EXPANDED_FACE_HEIGHT = 290;
/** Room right of the main block for the output helper and its wires. */
const BENCH_TAIL = 140;
const MAIN_LEFT = 80;
const MAIN_TOP = 140;
const HELPER_WIDTH = 96;

const anyPort = (id: string, state?: PortEdgeItem["state"]): PortEdgeItem => ({ id, label: "port", type: "Any", ...(state ? { state } : null) });

const LEFT_PORTS: PortEdgeItem[] = ["p1", "p2", "p3", "p4"].map((id) => anyPort(id));
const RIGHT_PORTS: PortEdgeItem[] = ["q1", "q2"].map((id) => anyPort(id));

function TitleTypeHeader() {
  return (
    <Bar
      left={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Glyph content="lucide:rocket" />
          <span style={{ fontWeight: 600 }}>Title</span>
          <span className="text-muted-foreground" style={{ fontSize: 12 }}>
            Type
          </span>
        </span>
      }
    />
  );
}

const FOOTER = <Bar size="sm" />;

function childMembers(): BlockMember[] {
  return ["m1", "m2", "m3"].map((id) => ({
    id,
    content: <Block header="Child Member" width={EXPANDED_WIDTH - 2 * MEMBER_GUTTER - 2} />,
  }));
}

type Face = "port" | "expanded" | "opaque";

function MainFace({ face }: { face: Face }): ReactNode {
  if (face === "port") return <Block header={<TitleTypeHeader />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />;
  if (face === "expanded") {
    return (
      <Block
        header={<TitleTypeHeader />}
        members={childMembers()}
        membersLayout="stack"
        memberGutter={MEMBER_GUTTER}
        footer={FOOTER}
        width={EXPANDED_WIDTH}
        height={EXPANDED_FACE_HEIGHT}
      />
    );
  }
  // "Expanded View Opaque": the same frame — same width, same height,
  // same header row and footer — with the members gone and the title
  // centred in the body.
  return (
    <Block
      header={<Bar />}
      body={<BlockOpaqueTitle glyph={<Glyph content="lucide:rocket" />} title="Title" type="Type" />}
      footer={FOOTER}
      width={EXPANDED_WIDTH}
      height={EXPANDED_FACE_HEIGHT}
    />
  );
}

interface CaseSpec {
  id: string;
  caption: string;
  face?: Face;
  sideEffects?: BlockSideEffects;
  mutations?: MutationLink[];
  /** Draw real wires into every input effect and out of every output. */
  wired?: boolean;
}

/** A helper block standing in for the outside state an effect reads or
 *  writes: its ports on ONE wall, facing the main block. */
function HelperBlock({ id, wall, portIds, left, top }: { id: string; wall: "left" | "right"; portIds: string[]; left: number; top: number }) {
  return (
    <div style={{ position: "absolute", left, top }}>
      <BlockPort id={id} view="port" edges={{ [wall]: { items: portIds.map((portId) => ({ id: portId, label: "", state: "wired" as const })) } }}>
        <Block header="state" body="" width={HELPER_WIDTH} height={36 + portIds.length * 42} />
      </BlockPort>
    </div>
  );
}

function Case({ spec }: { spec: CaseSpec }) {
  const benchRef = useRef<HTMLDivElement | null>(null);
  const face = spec.face ?? "port";
  const inputs = spec.sideEffects?.inputs ?? [];
  const outputs = spec.sideEffects?.outputs ?? [];
  const wires: Wire[] = spec.wired
    ? [
        ...inputs.map((effect, i) => ({ id: `${spec.id}-w-${effect.id}`, from: { blockId: `${spec.id}-src`, portId: `s${i}` }, to: { blockId: `${spec.id}-main`, portId: effect.id } })),
        ...outputs.map((effect, i) => ({ id: `${spec.id}-w-${effect.id}`, from: { blockId: `${spec.id}-main`, portId: effect.id }, to: { blockId: `${spec.id}-sink`, portId: `k${i}` } })),
      ]
    : [];
  const faceHeight = face === "port" ? PORT_FACE_HEIGHT : EXPANDED_FACE_HEIGHT;
  const benchWidth = MAIN_LEFT + (face === "port" ? BLOCK_WIDTH : EXPANDED_WIDTH) + BENCH_TAIL;
  return (
    <figure data-slot="side-effect-case" data-case={spec.id} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <figcaption className="text-muted-foreground" style={{ fontSize: 13 }}>
        {spec.caption}
      </figcaption>
      <div ref={benchRef} data-slot="wire-bench" data-bench={spec.id} style={{ position: "relative", width: benchWidth, height: MAIN_TOP + faceHeight + 30 }}>
        {spec.wired && inputs.length > 0 && <HelperBlock id={`${spec.id}-src`} wall="right" portIds={inputs.map((_, i) => `s${i}`)} left={0} top={0} />}
        {spec.wired && outputs.length > 0 && <HelperBlock id={`${spec.id}-sink`} wall="left" portIds={outputs.map((_, i) => `k${i}`)} left={benchWidth - HELPER_WIDTH} top={0} />}
        <div style={{ position: "absolute", left: MAIN_LEFT, top: MAIN_TOP }}>
          <BlockPort
            id={`${spec.id}-main`}
            view={face === "port" ? "port" : "expanded"}
            edges={{
              left: { items: LEFT_PORTS },
              right: { items: RIGHT_PORTS },
            }}
            sideEffects={spec.sideEffects}
            mutations={spec.mutations}
          >
            <MainFace face={face} />
          </BlockPort>
        </div>
        {wires.length > 0 && <WireLayer wires={wires} containerRef={benchRef} />}
      </div>
    </figure>
  );
}

const wired = <T extends { id: string; label?: string }>(effects: T[]) => effects.map((effect) => ({ ...effect, state: "wired" as const }));

const MUTATING_EFFECTS: BlockSideEffects = {
  inputs: wired([{ id: "fx-in", label: "input port" }]),
  outputs: wired([
    { id: "out1", label: "out 1" },
    { id: "out2", label: "out 2" },
  ]),
};

const MUTATION: MutationLink[] = [{ from: "p3", to: "out1" }];

const CASES: CaseSpec[] = [
  { id: "none", caption: "No Side effect" },
  { id: "input", caption: "input sideeffect", sideEffects: { inputs: [{ id: "fx-in" }] } },
  { id: "output", caption: "output sideeffect", sideEffects: { outputs: [{ id: "fx-out" }] } },
  { id: "both", caption: "input sideeffect + output sideeffect", sideEffects: { inputs: [{ id: "fx-in" }], outputs: [{ id: "fx-out" }] } },
  {
    id: "multiple",
    caption: "Multiple input/output side effects",
    sideEffects: {
      inputs: [
        { id: "in1", label: "in1" },
        { id: "in2", label: "in2" },
      ],
      outputs: [
        { id: "out1", label: "out1" },
        { id: "out2", label: "out2" },
      ],
    },
  },
  { id: "wired", caption: "Wired", wired: true, sideEffects: { inputs: wired([{ id: "fx-in" }]), outputs: wired([{ id: "fx-out" }]) } },
  { id: "mutating", caption: "With mutating line", wired: true, sideEffects: MUTATING_EFFECTS, mutations: MUTATION },
  { id: "expanded", caption: "Expanded View", face: "expanded", wired: true, sideEffects: MUTATING_EFFECTS, mutations: MUTATION },
  { id: "opaque", caption: "Expanded View Opaque", face: "opaque", wired: true, sideEffects: MUTATING_EFFECTS, mutations: MUTATION },
];

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function caseOf(canvasElement: HTMLElement, id: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="side-effect-case"][data-case="${id}"]`, `the \`${id}\` case`);
}

function mainOf(cell: HTMLElement, id: string) {
  const wrapper = required<HTMLElement>(cell, `[data-block-id="${id}-main"]`, `the main block of \`${id}\``);
  const block = required<HTMLElement>(wrapper, ':scope > [data-slot="block"]', `the Block of \`${id}\``);
  return { wrapper, block };
}

function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (±${tolerance}), off by ${delta.toFixed(2)}`);
  }
}

function expectInsideRect(point: { x: number; y: number }, rect: DOMRect, tolerance: number, what: string): void {
  const inside =
    point.x >= rect.left - tolerance && point.x <= rect.right + tolerance && point.y >= rect.top - tolerance && point.y <= rect.bottom + tolerance;
  if (!inside) {
    throw new Error(
      `${what} — point (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) is not on the dot [${rect.left.toFixed(2)}..${rect.right.toFixed(2)}] × [${rect.top.toFixed(2)}..${rect.bottom.toFixed(2)}] (±${tolerance})`,
    );
  }
}

function effectDots(wrapper: HTMLElement, direction: "input" | "output"): HTMLElement[] {
  return Array.from(wrapper.querySelectorAll<HTMLElement>(`[data-slot="block-side-effect"][data-side-effect-direction="${direction}"]`));
}

function dotOf(holder: HTMLElement): HTMLElement {
  return required<HTMLElement>(holder, '[data-slot="port-dot"]', "the effect's port dot");
}

/** Everything that decides how a dot is FILLED, as one comparable string. */
function paintSignature(dot: HTMLElement): string {
  const style = getComputedStyle(dot);
  const core = dot.querySelector<HTMLElement>('[data-slot="port-dot-core"]');
  return [style.backgroundColor, style.boxShadow, core ? getComputedStyle(core).backgroundColor : "no-core"].join(" | ");
}

/** SVG user-space point → screen, through the real CTM. */
function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the svg mounted?");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/** The top-wall acceptance every case with side effects must pass. */
async function expectTopWall(cell: HTMLElement, id: string, expected: { inputs: number; outputs: number }) {
  const { wrapper, block } = mainOf(cell, id);
  // `elementFromPoint` answers only inside the viewport, and the gallery
  // wraps — bring this case on screen before anything is measured.
  cell.scrollIntoView({ block: "center", inline: "center" });
  const blockRect = block.getBoundingClientRect();
  const wallY = blockRect.top;
  const wallCentreX = blockRect.left + blockRect.width / 2;

  const inputs = effectDots(wrapper, "input");
  const outputs = effectDots(wrapper, "output");
  await expect(inputs).toHaveLength(expected.inputs);
  await expect(outputs).toHaveLength(expected.outputs);

  const divider = required<HTMLElement>(wrapper, '[data-slot="block-side-effect-divider"]', `the divider of \`${id}\``);
  const dividerRect = divider.getBoundingClientRect();
  const dividerX = dividerRect.left + dividerRect.width / 2;
  expectWithin(dividerX, wallCentreX, 1, `${id}: divider x vs the wall's horizontal centre`);
  // Above the wall: it ends on the wall line and sticks out upward.
  expectWithin(dividerRect.bottom, wallY, 1, `${id}: divider foot vs the top wall`);
  await expect(dividerRect.top).toBeLessThan(wallY - 4);

  for (const holder of [...inputs, ...outputs]) {
    const direction = holder.getAttribute("data-side-effect-direction");
    const effectId = holder.getAttribute("data-port-id");
    const centre = centreOf(dotOf(holder));
    expectWithin(centre.y, wallY, 1, `${id}: ${effectId} centre y vs the top border`);
    if (direction === "input") await expect(centre.x).toBeLessThan(dividerX);
    else await expect(centre.x).toBeGreaterThan(dividerX);

    // Hittable: the topmost element at the dot's centre belongs to THIS
    // effect — not the header, not the frame border, not a neighbour.
    const hit = document.elementFromPoint(centre.x, centre.y);
    await expect(hit?.closest('[data-slot="block-side-effect"]')).toBe(holder);

    const label = holder.querySelector<HTMLElement>('[data-slot="block-side-effect-label"]');
    if (label) {
      const labelRect = label.getBoundingClientRect();
      await expect(labelRect.bottom).toBeLessThanOrEqual(wallY);
      await expect(labelRect.width).toBeGreaterThan(0);
    }
  }
  return { wrapper, block, inputs, outputs };
}

/** The mutation line lands on the input port's dot and the effect's dot. */
async function expectMutationLine(cell: HTMLElement, id: string, from: string, to: string) {
  const { wrapper, block } = mainOf(cell, id);
  const group = await waitFor(() => required<SVGGElement>(block, `[data-slot="block-mutation-line"][data-mutation-from="${from}"][data-mutation-to="${to}"]`, `${id}: the ${from}→${to} line`));
  const svg = group.ownerSVGElement!;
  // Drawn INSIDE the Block, at the below-content tier.
  await expect(svg.parentElement).toBe(block);
  await expect(getComputedStyle(svg).zIndex).toBe(String(paintTier("underlay")));
  const polyline = required<SVGPolylineElement>(group, "polyline", "the line");
  const points = Array.from(polyline.points).map((p) => toScreen(svg, p.x, p.y));
  await expect(points).toHaveLength(3);
  // Orthogonal, horizontal first then vertical.
  expectWithin(points[0].y, points[1].y, 0.5, `${id}: first leg is horizontal`);
  expectWithin(points[1].x, points[2].x, 0.5, `${id}: second leg is vertical`);

  const fromDot = dotOf(required<HTMLElement>(wrapper, `[data-slot="block-port-rail"][data-edge="left"] [data-port-id="${from}"]`, `${id}: port ${from}`));
  const toDot = dotOf(required<HTMLElement>(wrapper, `[data-slot="block-side-effect"][data-port-id="${to}"]`, `${id}: effect ${to}`));
  expectInsideRect(points[0], fromDot.getBoundingClientRect(), 2, `${id}: mutation start on ${from}'s dot`);
  expectInsideRect(points[2], toDot.getBoundingClientRect(), 2, `${id}: mutation end on ${to}'s dot`);
  // And actually aimed at them: same row as the port, same column as the effect.
  expectWithin(points[0].y, centreOf(fromDot).y, 1, `${id}: mutation row vs ${from}'s centre`);
  expectWithin(points[2].x, centreOf(toDot).x, 1, `${id}: mutation column vs ${to}'s centre`);
  // An arrowhead exists at the effect end.
  required<SVGPolygonElement>(group, "polygon", "the arrowhead");
}

/** Every wire in a bench resolved, and each effect wire actually meets its
 *  effect's dot along the wall normal (the rendered path keeps the dot's x
 *  on its vertical approach — `Trace` pulls the visible end back along it). */
async function expectEffectWires(cell: HTMLElement, id: string, effectIds: { inputs: string[]; outputs: string[] }) {
  const layer = required<SVGSVGElement>(cell, '[data-slot="wire-layer"]', `${id}: the wire layer`);
  for (const effect of [...effectIds.inputs, ...effectIds.outputs]) {
    await waitFor(() => required(cell, `[data-wire-id="${id}-w-${effect}"] [data-slot="trace-line"]`, `${id}: the wire on ${effect}`), { timeout: 3000 });
  }
  await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
  const { wrapper } = mainOf(cell, id);
  for (const [effect, end] of [...effectIds.inputs.map((e) => [e, "to"] as const), ...effectIds.outputs.map((e) => [e, "from"] as const)]) {
    const path = required<SVGPathElement>(cell, `[data-wire-id="${id}-w-${effect}"] [data-slot="trace-line"]`, `${id}: ${effect}'s trace`);
    const local = path.getPointAtLength(end === "to" ? path.getTotalLength() : 0);
    const onScreen = toScreen(layer, local.x, local.y);
    const dot = centreOf(dotOf(required<HTMLElement>(wrapper, `[data-slot="block-side-effect"][data-port-id="${effect}"]`, `${id}: ${effect}`)));
    expectWithin(onScreen.x, dot.x, 1.5, `${id}: ${effect}'s wire column vs its dot`);
    await expect(onScreen.y).toBeLessThan(dot.y);
  }
}

/* ------------------------------------------------------------------ */
/* The gallery                                                          */
/* ------------------------------------------------------------------ */

export const Gallery: Story = {
  render: () => (
    <div className="bg-background text-foreground" style={{ padding: 32, display: "flex", flexWrap: "wrap", gap: 40, minHeight: "100vh" }}>
      {CASES.map((spec) => (
        <Case key={spec.id} spec={spec} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Wait for the last case's own dots to exist before measuring anything.
    await waitFor(() => required(canvasElement, '[data-case="opaque"] [data-slot="block-side-effect"][data-port-id="out2"]', "the opaque case's out 2"), { timeout: 3000 });

    // No side effect: no divider, no side-effect row, exactly as before.
    const none = caseOf(canvasElement, "none");
    await expect(none.querySelector('[data-slot="block-side-effect-divider"]')).toBeNull();
    await expect(none.querySelector('[data-rail-kind="side-effects"]')).toBeNull();
    await expect(none.querySelector('[data-slot="block-mutation-lines"]')).toBeNull();

    // Placement, case by case.
    await expectTopWall(caseOf(canvasElement, "input"), "input", { inputs: 1, outputs: 0 });
    // Outputs only still sit right of the divider — "towards the back end".
    await expectTopWall(caseOf(canvasElement, "output"), "output", { inputs: 0, outputs: 1 });
    await expectTopWall(caseOf(canvasElement, "both"), "both", { inputs: 1, outputs: 1 });
    const multiple = await expectTopWall(caseOf(canvasElement, "multiple"), "multiple", { inputs: 2, outputs: 2 });
    // Authored order survives: in1 before in2, out1 before out2.
    await expect(multiple.inputs.map((h) => h.getAttribute("data-port-id"))).toEqual(["in1", "in2"]);
    await expect(multiple.outputs.map((h) => h.getAttribute("data-port-id"))).toEqual(["out1", "out2"]);
    await expect(multiple.inputs.map((h) => h.textContent)).toEqual(["in1", "in2"]);

    // Wired: real wires through the existing wire layer, and wired dots
    // are FILLED where unwired ones are hollow.
    const wiredCell = caseOf(canvasElement, "wired");
    const wiredTop = await expectTopWall(wiredCell, "wired", { inputs: 1, outputs: 1 });
    await expectEffectWires(wiredCell, "wired", { inputs: ["fx-in"], outputs: ["fx-out"] });
    const hollow = paintSignature(dotOf(effectDots(mainOf(caseOf(canvasElement, "both"), "both").wrapper, "input")[0]));
    const filled = paintSignature(dotOf(wiredTop.inputs[0]));
    await expect(filled).not.toBe(hollow);
    await expect(dotOf(wiredTop.inputs[0]).getAttribute("data-state")).toBe("wired");

    // With mutating line — in port view, expanded, and expanded opaque.
    for (const id of ["mutating", "expanded", "opaque"]) {
      const cell = caseOf(canvasElement, id);
      await expectTopWall(cell, id, { inputs: 1, outputs: 2 });
      await expectEffectWires(cell, id, { inputs: ["fx-in"], outputs: ["out1", "out2"] });
      await expectMutationLine(cell, id, "p3", "out1");
      await expect(mainOf(cell, id).wrapper.getAttribute("data-unresolved-mutations")).toBe("");
    }

    // Expanded: the three members are really there.
    const expanded = mainOf(caseOf(canvasElement, "expanded"), "expanded").block;
    await expect(expanded.querySelectorAll('[data-slot="block-members"] [data-slot="block"]')).toHaveLength(3);

    // Expanded opaque: the same frame, members gone, title centred.
    const opaque = mainOf(caseOf(canvasElement, "opaque"), "opaque").block;
    await expect(opaque.querySelector('[data-slot="block-members"]')).toBeNull();
    await expect(opaque.textContent).not.toContain("Child Member");
    const expandedRect = expanded.getBoundingClientRect();
    const opaqueRect = opaque.getBoundingClientRect();
    expectWithin(opaqueRect.width, expandedRect.width, 0.5, "opaque frame width vs expanded");
    expectWithin(opaqueRect.height, expandedRect.height, 0.5, "opaque frame height vs expanded");
    const body = required<HTMLElement>(opaque, ':scope > [data-slot="block-body"]', "the opaque body");
    const title = required<HTMLElement>(body, '[data-slot="block-opaque-title"]', "the opaque title");
    const bodyCentre = centreOf(body);
    const titleCentre = centreOf(title);
    expectWithin(titleCentre.x, bodyCentre.x, 1, "opaque title x vs body centre");
    expectWithin(titleCentre.y, bodyCentre.y, 1, "opaque title y vs body centre");
    await expect(title.getBoundingClientRect().width).toBeGreaterThan(0);
  },
};
