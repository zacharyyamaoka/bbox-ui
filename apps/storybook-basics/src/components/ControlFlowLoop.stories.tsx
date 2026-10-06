/**
 * Components/Blocks/BlockRegion/Loop — the loop PRESET (docs/CONTROL-FLOW-PLAN.md lane B),
 * built entirely out of `scene/region.loop.ts`'s factories over the generic
 * Region lane A shipped. There is no Loop component in this repo and these
 * stories are the proof: every board below is `forLoopNode` /
 * `whileLoopNode` / `carriedValueEdge` handing data to the SAME
 * `SceneNodeView` a plain block goes through.
 *
 * The two load-bearing ideas, as things these stories MEASURE:
 *
 *   • **Everything is a block.** A loop's header is not a band, a title or
 *     a decoration — it is a real `BlockPort` in the frame's corner, and
 *     `expectCornerPorts` reads `Iterable`/`Iter` off its rails through the
 *     identical `[data-block-id]` → `[data-port-id]` walk `merge()`'s own
 *     ports resolve through. `WhileLoopRecheck` sharpens it into a
 *     negative: a `while` header has NO right rail in the DOM, because the
 *     construct genuinely has no item outlet.
 *   • **Never mix data and control lines.** Not one cable on these boards
 *     is control flow. The cable that comes back (`e-carry`) is an ordinary
 *     data cable that is merely one turn late — dotted, with a pill naming
 *     the seed — and `LoopWithBreak`'s exit is a MARK, which
 *     `expectControlMark` proves by enumerating every painted wire and
 *     finding none that originates at it.
 *
 * The assertions live in `controlFlow.acceptance.ts`, committed before this
 * file existed and off-limits to it.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { LOOP_PORT_IDS } from "../scene/region.loop";
import {
  FOR_LOOP_CARRIED,
  FOR_LOOP_CONTINUE,
  FOR_LOOP_EMPTY,
  FOR_LOOP_NESTED,
  LOOP_WITH_BREAK,
  LOOP_WITH_TURN,
  WHILE_LOOP_MUTATES,
  WHILE_LOOP_RECHECK,
} from "../scene/region.loop.fixtures";
import { portViewSlotCount, railBandHeightForSlots } from "../scene/fitToContent";
import { Bar } from "./bar";
import { Block } from "./block";
import { BlockPort } from "./blockPort";
import { BlockRegion, type RegionCornerCard } from "./blockRegion";
import { REGION_CORNER_WIDTH_PX } from "./blockRegion.layout";
import { ControlMark } from "./controlMark";
import type { PortEdgeItem } from "./portEdge";
import {
  expectControlMark,
  expectCornerPorts,
  expectMemberInside,
  expectRegionExpanded,
  expectWireAvoids,
  expectWireBadge,
  expectWirePainted,
} from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion/Loop",
  tags: ["object:region", "host:dom", "host:react-flow", "lane:truthful-branch-viz"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** Every board is read-write: a member is draggable and a port rail is
 *  reorderable, so the bench holds the scene the same way
 *  `SceneHosts.stories.tsx` does rather than freezing a literal. */
function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/**
 * The bypass claim on the line that is actually PAINTED — the same local
 * check `ControlFlowWires.stories.tsx` (lane D) carries, for the same
 * measured reason, repeated here rather than imported because it belongs to
 * a story file that is not this lane's to edit.
 *
 * `expectWireAvoids` is called unchanged on every story below and IS the
 * acceptance; its selector is `[data-wire-id] path`, and `querySelector`
 * takes the first match in document order — which is the arrowhead marker
 * inside `<defs>`, not the route (`trace.tsx` renders defs first). So the
 * helper passes without looking at the cable. This one selects
 * `path[data-slot="trace-line"]`, the real routed line, so "the carried
 * value goes AROUND merge instead of across it" is proved rather than
 * assumed. The fix belongs in `controlFlow.acceptance.ts`, which this lane
 * may not edit either; it is one selector, and it is reported.
 */
function expectRoutedLineAvoids(root: ParentNode, wireId: string, obstacleSelector: string): void {
  const obstacle = required<HTMLElement>(root, obstacleSelector, `obstacle \`${obstacleSelector}\``);
  const line = required<SVGPathElement>(
    root,
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
    `wire \`${wireId}\`'s painted line`,
  );
  const ctm = line.getScreenCTM();
  if (!ctm) throw new Error(`wire \`${wireId}\`'s line is not rendered — no screen CTM`);
  const box = obstacle.getBoundingClientRect();
  const total = line.getTotalLength();
  const inside: { x: number; y: number }[] = [];
  for (let d = 0; d <= total; d += 4) {
    const local = line.getPointAtLength(d);
    const point = new DOMPoint(local.x, local.y).matrixTransform(ctm);
    if (point.x > box.left + 1 && point.x < box.right - 1 && point.y > box.top + 1 && point.y < box.bottom - 1) inside.push(point);
  }
  expect(inside, `wire ${wireId}'s PAINTED line enters ${obstacleSelector} at ${inside.length} sampled points`).toHaveLength(0);
}

/* ==================================================================== */
/* ForLoopEmpty                                                          */
/* ==================================================================== */

export const ForLoopEmpty: Story = {
  name: "for — the typed, unnamed header on an empty frame",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_EMPTY} width={540} height={360} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // The header contract, measured: `Iterable` in on the left wall,
    // `Iter` out on the right, and nothing else anywhere on the card. The
    // ids ARE the type labels (donor loopModel.ts:55-70) — there is no
    // name to check because a header port deliberately has none.
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
  },
};

/* ==================================================================== */
/* ForLoopCarried                                                        */
/* ==================================================================== */

export const ForLoopCarried: Story = {
  name: "for — merge() / smooth(), the seed from outside, the z⁻¹ back cable",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_CARRIED} width={1100} height={420} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
    // The nesting the scene declares is the nesting the DOM shows: `merge`
    // renders inside the loop's own body, never as a host node of its own.
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "smooth");

    // Three cables, three different relationships to the frame, all
    // resolved against real dots: the header handing out this turn's
    // element (private, inside), the seed crossing the frame straight into
    // a member (V1's direct crossing cable), and the body's result leaving
    // for a block outside.
    await expectWirePainted(canvasElement, "e-iter");
    await expectWirePainted(canvasElement, "e-seed");
    await expectWirePainted(canvasElement, "e-out");

    // The carried value: the pill names the seed, character for character,
    // and the cable goes AROUND the block it belongs to rather than across
    // it ("go to the end first, then loop back" — format, not semantics).
    await expectWireBadge(canvasElement, "e-carry", "z⁻¹ = estimate()");
    await expectWireAvoids(canvasElement, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
    expectRoutedLineAvoids(canvasElement, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
  },
};

/* ==================================================================== */
/* WhileLoopRecheck                                                      */
/* ==================================================================== */

export const WhileLoopRecheck: Story = {
  name: "while — a Bool inlet, no item outlet, and a visible re-check",
  render: () => <StatefulDomCanvas initial={WHILE_LOOP_RECHECK} width={900} height={400} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Bool"] });

    // The negative half of the header contract, and the reason a `while` is
    // not a renamed `for`: there is no right RAIL at all, not an empty one.
    // `edgeSpecsOf` mints one rail per KEY of `data.ports`, so this fails
    // the moment someone "completes the symmetry" with `right: []`.
    const corner = required<HTMLElement>(
      canvasElement,
      '[data-slot="region"][data-region-id="loop"] [data-slot="region-corner"] [data-block-id="loop"]',
      "the corner block",
    );
    expect(corner.querySelector('[data-slot="block-port-rail"][data-edge="right"]')).toBeNull();

    // The condition is re-evaluated after every pass, so it is WIRED back to
    // the header rather than hidden in a title — and it is a data cable that
    // is merely one turn late, not a control line.
    await expectWirePainted(canvasElement, "e-recheck");
    await expectWireBadge(canvasElement, "e-recheck", "z⁻¹");
  },
};

/* ==================================================================== */
/* LoopWithTurn                                                          */
/* ==================================================================== */

export const LoopWithTurn: Story = {
  name: "for — the turn chip in the corner block's header",
  render: () => <StatefulDomCanvas initial={LOOP_WITH_TURN} width={620} height={340} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // The chip is a stock `Badge` in the corner header's `Bar` right slot —
    // reached ONLY because `data.badge` is set, which is what keeps every
    // pre-existing story's header markup a plain string.
    const chip = required<HTMLElement>(
      canvasElement,
      '[data-slot="region-corner"] [data-slot="bar-right"] [data-slot="badge"]',
      "the turn chip",
    );
    expect(chip.textContent?.trim()).toBe("iteration 3 of 7");
    // It minted no port: a turn count is a reading, never something to wire.
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
  },
};

/* ==================================================================== */
/* LoopWithBreak                                                         */
/* ==================================================================== */

export const LoopWithBreak: Story = {
  name: "while — break is a mark beside the call, never a cable",
  render: () => <StatefulDomCanvas initial={LOOP_WITH_BREAK} width={860} height={360} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // B5, measured twice over: the mark is a badge ON `check()`, and no wire
    // in the whole layer originates at `check/break` — the only honest way
    // to assert an absence is to enumerate what IS painted.
    expectControlMark(canvasElement, "check", "break");
    // And it minted no handle. A mark that quietly became a port is exactly
    // the "data and control mixed" failure the rule exists to prevent.
    const check = required<HTMLElement>(canvasElement, '[data-block-id="check"]', "the marked block");
    expect(Array.from(check.querySelectorAll("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"))).toEqual(["next"]);
  },
};

/* ==================================================================== */
/* ForLoopReactFlow                                                      */
/* ==================================================================== */

export const ForLoopReactFlow: Story = {
  name: "for — the same board in a canvas host (React Flow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(FOR_LOOP_CARRIED);
      return (
        <ReactFlowHost
          scene={scene}
          onSceneChange={setScene}
          width={1100}
          height={420}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        />
      );
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    // C3, on the preset: React Flow needed zero loop-specific code. The
    // region falls through `NODE_TYPES` to the same `BboxNode` every other
    // kind uses, `SceneNodeView` owns the switch, and a member stays a
    // member — drawn inside the loop's body, never promoted to an RF node
    // (which is what `expectMemberInside`'s second half asserts).
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "merge");
  },
};

/* ==================================================================== */
/* ForLoopNested                                                         */
/* ==================================================================== */

export const ForLoopNested: Story = {
  name: "for — a for nested in a for, the inner Iterable fed by the outer's Iter",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_NESTED} width={920} height={500} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "outer");
    expectCornerPorts(canvasElement, "outer", { left: ["Iterable"], right: ["Iter"] });
    // The nesting the scene declares is the nesting the DOM shows, one
    // level deeper than `ForLoopCarried` ever needed: the INNER LOOP itself
    // renders inside the outer's body, not as a sibling top-level region —
    // the same claim `BRANCH_NESTED` proves for branches, made here for the
    // first time for loops.
    expectMemberInside(canvasElement, '[data-region-id="outer"] [data-slot="region-body"]', "inner");
    await expectRegionExpanded(canvasElement, "inner");
    expectCornerPorts(canvasElement, "inner", { left: ["Iterable"], right: ["Iter"] });
    // And the inner loop's OWN member lives inside the inner body, not the
    // outer's — an arm-relative-style nesting check one region deeper.
    expectMemberInside(canvasElement, '[data-region-id="inner"] [data-slot="region-body"]', "process");

    // The cable that makes this a NESTED loop rather than two independent
    // ones: the outer's own `Iter` feeds the inner's own `Iterable`,
    // corner card to corner card.
    await expectWirePainted(canvasElement, "e-outer-inner");
  },
};

/* ==================================================================== */
/* ForLoopWithContinue                                                   */
/* ==================================================================== */

export const ForLoopWithContinue: Story = {
  name: "for — continue is a mark beside the call, never a cable",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_CONTINUE} width={780} height={340} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // `continue`'s own proof, the `for` cousin of `LoopWithBreak`'s `while`
    // one: the mark is a badge ON `skip_if_empty()`, and no wire in the
    // whole layer originates at `skip/continue`.
    expectControlMark(canvasElement, "skip", "continue");
    const skip = required<HTMLElement>(canvasElement, '[data-block-id="skip"]', "the marked block");
    expect(Array.from(skip.querySelectorAll("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"))).toEqual(["item"]);
  },
};

/* ==================================================================== */
/* WhileLoopMutates                                                      */
/* ==================================================================== */

export const WhileLoopMutates: Story = {
  name: "while — the body mutates the value the re-check reads",
  render: () => <StatefulDomCanvas initial={WHILE_LOOP_MUTATES} width={920} height={420} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Bool"] });
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "mutate");
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "overLimit");

    // The re-check: `over_limit()`'s own result feeds `Bool` back, one turn
    // late, badged `z⁻¹` exactly as `WhileLoopRecheck`'s does.
    await expectWirePainted(canvasElement, "e-recheck");
    await expectWireBadge(canvasElement, "e-recheck", "z⁻¹");

    // The mutation that makes the re-check MATTER: `mutate`'s own output is
    // what carries into its own input next turn — the same value
    // `over_limit` just re-tested, going around `mutate` rather than across
    // it (`FOR_LOOP_CARRIED`'s own bypass claim, one loop kind over).
    await expectWireBadge(canvasElement, "e-carry", "z⁻¹ = 0");
    await expectWireAvoids(canvasElement, "e-carry", '[data-block-id="mutate"] [data-slot="block"]');
  },
};

/* ==================================================================== */
/* ForLoopDefaultIterable                                                */
/* ==================================================================== */

/** The Iterable's inline default when nothing is wired — leading/trailing
 *  spaces intact (truthful rendering), kept short on purpose: the corner
 *  CARD is narrow (`REGION_CORNER_WIDTH_PX`, not an arm header's full-frame
 *  band), and a long expression here collides with the `Iter` label on the
 *  opposite wall rather than wrapping. `WHILE_DEFAULT_BOOL` below is where
 *  this file's quoted-literal case lives — a `while`'s corner has no right
 *  wall to collide with, so it can afford the longer string. */
const FOR_DEFAULT_ITERABLE = "  range(10)  ";

/**
 * `Iterable` UNWIRED, its inline default shown as `PortState "valueSet"`
 * (`components/port.tsx:60`) — the loop analogue of an inline default, and
 * the one `for` scenario this file never drew.
 *
 * Mounted with `<BlockRegion>` directly, the same way `BlockRegion.stories.
 * tsx`'s `ArmPortsBench` mounts it directly for `test`/`captures`: the
 * scene→host pipeline (`nodeViews.tsx`'s `edgeSpecsOf`) rebuilds a corner's
 * items fresh from `data.ports`' bare id STRINGS on every render (see
 * `edgeSpecsOf`'s own item builder — `id`, `label`, `availability`,
 * `diagnostics`, `selected`, and nothing else), so it has no seam for a
 * per-port `state` or an authored `label` to ride through; only
 * `region.branch.ts`'s ARM headers get one, through `ArmHeaderRail`, a
 * bespoke renderer for that one band. `region.loop.ts`'s grammar itself is
 * UNCHANGED by this: it is still `forLoopNode`'s own `Iterable`/`Iter`
 * pair (`LOOP_PORT_IDS`), landing on the identical corner-card DOM
 * `CornerCardView` always renders — only the ITEMS are authored by hand
 * here instead of derived from `data.ports`.
 */
function ForLoopDefaultIterableBoard() {
  const items: PortEdgeItem[] = [{ id: LOOP_PORT_IDS.iterable, label: FOR_DEFAULT_ITERABLE, state: "valueSet" }];
  const cornerCard: RegionCornerCard = {
    header: "For Loop",
    width: REGION_CORNER_WIDTH_PX,
    edges: {
      left: { items },
      right: { items: [{ id: LOOP_PORT_IDS.iter, label: LOOP_PORT_IDS.iter }] },
    },
    bandHeight: railBandHeightForSlots(portViewSlotCount({ leftCount: items.length, rightCount: 1, portLayout: "inline" })),
  };
  return (
    <div style={{ position: "relative", width: 440, height: 240 }}>
      <BlockRegion id="loop" kind="loop" view="expanded" cornerCard={cornerCard} width={400} height={200} />
    </div>
  );
}

export const ForLoopDefaultIterable: Story = {
  name: "for — Iterable unwired, its inline default shown as valueSet",
  render: () => <ForLoopDefaultIterableBoard />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: [LOOP_PORT_IDS.iterable], right: [LOOP_PORT_IDS.iter] });

    // The default expression, verbatim — leading/trailing spaces intact —
    // and the dot itself in PortState "valueSet", never "empty".
    const item = required<HTMLElement>(
      canvasElement,
      `[data-slot="region-corner"] [data-block-id="loop"] [data-slot="block-port-rail"][data-edge="left"] [data-port-id="${LOOP_PORT_IDS.iterable}"]`,
      "the Iterable item",
    );
    expect(item.textContent).toBe(FOR_DEFAULT_ITERABLE);
    const dot = required<HTMLElement>(item, '[data-slot="port-dot"]', "the Iterable dot");
    expect(dot.getAttribute("data-state")).toBe("valueSet");
  },
};

/* ==================================================================== */
/* WhileLoopDefaultBool                                                  */
/* ==================================================================== */

/** `Bool`'s inline default — spaces and a quoted empty-string literal, the
 *  same truthful-rendering shape `FOR_DEFAULT_ITERABLE` uses one wall over. */
const WHILE_DEFAULT_BOOL = '  last_error != ""  ';

/**
 * `Bool` UNWIRED, its inline default shown as `valueSet` — `while`'s own
 * version of `ForLoopDefaultIterable`, and the sharper negative test:
 * because a `while` mints no right wall AT ALL (`region.loop.ts`'s
 * `whilePorts`), `cornerCard.edges` below carries no `right` key — the
 * exact "a key that is not there mints no rail" rule `WhileLoopRecheck`
 * already exercises through `edgeSpecsOf`, here against hand-authored
 * items instead.
 */
function WhileLoopDefaultBoolBoard() {
  const items: PortEdgeItem[] = [{ id: LOOP_PORT_IDS.bool, label: WHILE_DEFAULT_BOOL, state: "valueSet" }];
  const cornerCard: RegionCornerCard = {
    header: "While Loop",
    width: REGION_CORNER_WIDTH_PX,
    edges: { left: { items } },
    bandHeight: railBandHeightForSlots(portViewSlotCount({ leftCount: items.length, rightCount: 0, portLayout: "inline" })),
  };
  return (
    <div style={{ position: "relative", width: 420, height: 220 }}>
      <BlockRegion id="loop" kind="loop" view="expanded" cornerCard={cornerCard} width={380} height={180} />
    </div>
  );
}

export const WhileLoopDefaultBool: Story = {
  name: "while — Bool unwired, its inline default shown as valueSet, no right wall",
  render: () => <WhileLoopDefaultBoolBoard />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: [LOOP_PORT_IDS.bool] });

    const item = required<HTMLElement>(
      canvasElement,
      `[data-slot="region-corner"] [data-block-id="loop"] [data-slot="block-port-rail"][data-edge="left"] [data-port-id="${LOOP_PORT_IDS.bool}"]`,
      "the Bool item",
    );
    expect(item.textContent).toBe(WHILE_DEFAULT_BOOL);
    const dot = required<HTMLElement>(item, '[data-slot="port-dot"]', "the Bool dot");
    expect(dot.getAttribute("data-state")).toBe("valueSet");

    // The negative half of the header contract, unchanged by hand-authoring
    // the items: no right RAIL at all.
    const corner = required<HTMLElement>(
      canvasElement,
      '[data-slot="region"][data-region-id="loop"] [data-slot="region-corner"] [data-block-id="loop"]',
      "the corner block",
    );
    expect(corner.querySelector('[data-slot="block-port-rail"][data-edge="right"]')).toBeNull();
  },
};

/* ==================================================================== */
/* WhileTrueBreak                                                        */
/* ==================================================================== */

const WHILE_TRUE_LITERAL = "True";

/**
 * `while True:` — the condition is a LITERAL (an unwired `valueSet` `Bool`
 * reading `True`, never re-evaluated because nothing feeds it), and the
 * real exit is `check()`'s `break` MARK. The idiom every `while` reaches
 * for once its real termination lives in the body rather than the header —
 * and the sharpest proof yet that a mark, not a cable, is what leaves:
 * this board draws no edges at all, so `expectControlMark`'s wire sweep
 * finds an empty layer, not a cable it had to rule out.
 */
function WhileTrueBreakBoard() {
  const items: PortEdgeItem[] = [{ id: LOOP_PORT_IDS.bool, label: WHILE_TRUE_LITERAL, state: "valueSet" }];
  const cornerCard: RegionCornerCard = {
    header: "While Loop",
    width: REGION_CORNER_WIDTH_PX,
    edges: { left: { items } },
    bandHeight: railBandHeightForSlots(portViewSlotCount({ leftCount: items.length, rightCount: 0, portLayout: "inline" })),
  };
  const check = (
    <BlockPort id="check" view="port" edges={{ left: { items: [{ id: "value", label: "value" }] } }}>
      <Block header={<Bar size="md" left="check()" right={<ControlMark mark="break" />} />} width={210} height={80} />
    </BlockPort>
  );
  return (
    <div style={{ position: "relative", width: 480, height: 260 }}>
      <BlockRegion
        id="loop"
        kind="loop"
        view="expanded"
        cornerCard={cornerCard}
        width={440}
        height={220}
        members={[{ id: "check", content: check, x: 60, y: 30 }]}
      />
    </div>
  );
}

export const WhileTrueBreak: Story = {
  name: "while — while True:, the real exit is check()'s break mark",
  render: () => <WhileTrueBreakBoard />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: [LOOP_PORT_IDS.bool] });

    const item = required<HTMLElement>(
      canvasElement,
      `[data-slot="region-corner"] [data-block-id="loop"] [data-slot="block-port-rail"][data-edge="left"] [data-port-id="${LOOP_PORT_IDS.bool}"]`,
      "the Bool item",
    );
    expect(item.textContent).toBe(WHILE_TRUE_LITERAL);
    const dot = required<HTMLElement>(item, '[data-slot="port-dot"]', "the Bool dot");
    expect(dot.getAttribute("data-state")).toBe("valueSet");

    expectMemberInside(canvasElement, '[data-slot="region-body"]', "check");
    expectControlMark(canvasElement, "check", "break");
  },
};
