/**
 * Components/Blocks/BlockRegion/Branch — `if`/`elif`/`else`, drawn as the
 * generic Region (lane A) carrying branch DATA under the SPLIT grammar
 * (`region.branch.ts`'s header, "SPLIT, 2026-09-22";
 * `reports/media/truthful-branching-2026-09-22.html`). `match`/`case`
 * moved to `ControlFlowMatch.stories.tsx` — the two are different shapes
 * now, not two titles on one factory.
 *
 * The one rule every story below either SHOWS or WITHHOLDS: a dot is a
 * value the structure consumes, and its POSITION says who consumes it.
 * `if`/`elif`/`else` has NO shared subject — each arm owns its OWN boolean,
 * on that arm's own header, left wall. `else` tests nothing, so it carries
 * no dot at all, and neither does the region's own corner card (Q1/V1: a
 * branch yields nothing either, so the corner never grows a right wall).
 *
 * The other axis every board here varies on: SUPPLIED vs UNSUPPLIED
 * (report §3.2). A wired arm leaves `test.default` unset — an empty dot
 * with a real cable landing on it. An unwired arm sets `test.default` to
 * the literal expression, rendered verbatim as `PortState "valueSet"` —
 * Zach's "default variables in the title". The SAME dot renders
 * differently depending on which is true, which is the whole truthful-
 * rendering claim: a title can no longer silently say "this is live" when
 * it is really just typed in, or vice versa.
 *
 * The assertions live in `blockRegion.acceptance.ts`, committed before this
 * file and off-limits to it; every one MEASURES
 * (`getBoundingClientRect`, `getComputedStyle`, `data-state`) rather than
 * asserting DOM presence. The local helpers below extend that same
 * discipline to the two things the frozen file has no vocabulary for yet:
 * an ARM's own test/capture dot (as opposed to the region's corner ports)
 * and whether an arm carries no dot at all.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import {
  BRANCH_ACTIVE,
  BRANCH_FOLDED,
  BRANCH_IF_ELSE_DEFAULT,
  BRANCH_IF_ELSE_WIRED,
  BRANCH_LADDER_DEFAULT,
  BRANCH_LADDER_MIXED,
  BRANCH_LADDER_WIRED,
  BRANCH_NESTED,
} from "../scene/region.branch.fixtures";
import {
  expectArmsStacked,
  expectMemberInside,
  expectRegionExpanded,
  expectWirePainted,
} from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion/Branch",
  tags: ["object:region", "host:dom", "host:react-flow", "lane:truthful-branch-viz"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** The fold is a SCENE write (`data.arm.open` on the arm node), so every
 *  bench that can be clicked owns the scene and writes it back — a read-only
 *  `DomCanvas` would render a chevron that does nothing. */
function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/* ------------------------------------------------------------------ */
/* Local helpers — an ARM's own dot, never the region's corner ports    */
/* (`expectCornerPorts` in the frozen file only ever reads the corner). */
/* ------------------------------------------------------------------ */

function armHeader(root: ParentNode, armId: string): HTMLElement {
  return required<HTMLElement>(root, `[data-arm-id="${armId}"] [data-slot="region-arm-header"]`, `arm \`${armId}\`'s header`);
}

/** The arm's own dot, by wall — `edge="left"` for a test/guard, `"right"`
 *  for a capture (region.branch.ts's "the split": IN vs OUT of the arm). */
function armDot(root: ParentNode, armId: string, portId: string): HTMLElement {
  return required<HTMLElement>(armHeader(root, armId), `[data-port-id="${portId}"]`, `arm \`${armId}\`'s dot \`${portId}\``);
}

/** `PortState` read straight off the paint (`port.tsx`'s own `data-state`),
 *  never inferred from the fixture — a fade or a wired override that never
 *  reached the DOM would still pass a check against the fixture's own
 *  field. */
function armDotState(root: ParentNode, armId: string, portId: string): string | null {
  return armDot(root, armId, portId).querySelector('[data-slot="port-dot"]')?.getAttribute("data-state") ?? null;
}

/**
 * The default expression as actually PAINTED — truthful rendering means
 * this has to match the authored string character for character, never a
 * normalised or trimmed copy of it. NOT read off the dot itself: the dot's
 * own label slot is deliberately blank (`blockRegion.tsx`'s `ArmHeaderRail`,
 * "A BARE DOT — no label", commit fee87b9 — drawing the expression there
 * collided with the arm's own title, `mode == "fast"` over `if:` painting
 * as `modif:e == "fast"`). The text lives one element over, in the Bar's
 * own `[data-slot="region-arm-test"]` span, right after the title — absent
 * entirely when the arm has no default (wired, or `else`).
 */
function armTestText(root: ParentNode, armId: string): string {
  return armHeader(root, armId).querySelector('[data-slot="region-arm-test"]')?.textContent ?? "";
}

/** `else` tests nothing, so it owns no rail at all — not an empty one. */
function expectArmHasNoDot(root: ParentNode, armId: string): void {
  expect(armHeader(root, armId).querySelector('[data-slot="block-port-rail"]'), `arm \`${armId}\` should carry no dot at all`).toBeNull();
}

/** Q1/V1, restated for the split: an `if`/`elif`/`else` region shares no
 *  subject between arms, so its corner card grows NO wall at all — not
 *  even the one wall a `match` region's corner would. */
function expectCornerHasNoRail(root: ParentNode, regionId: string): void {
  const corner = required<HTMLElement>(root, `[data-slot="region-corner"] [data-block-id="${regionId}"]`, "the corner block");
  expect(corner.querySelectorAll('[data-slot="block-port-rail"]'), "an if/elif/else corner shares no subject and yields nothing").toHaveLength(0);
}

/**
 * The defect class that shipped twice on 2026-09-22 (commit 03b330a, the
 * coordinator's own words): a DOT-position assertion cannot see a TEXT
 * collision — `mode == "fast"` painted straight through `if:` for hours
 * while every existing measured assertion (all of them dot-box checks)
 * stayed green. Measured here instead of merely asserted-present: the
 * title's own box and the expression's own box must not overlap on
 * screen, in real pixels, not by trusting that two elements existing means
 * two elements are legible.
 */
function expectNoTextOverlap(root: ParentNode, armId: string): void {
  const header = armHeader(root, armId);
  const title = required<HTMLElement>(header, '[data-slot="region-arm-title"]', `arm \`${armId}\`'s title`);
  const test = header.querySelector<HTMLElement>('[data-slot="region-arm-test"]');
  if (!test) return; // nothing to collide with — `else`, or a wired arm
  const titleRect = title.getBoundingClientRect();
  const testRect = test.getBoundingClientRect();
  const overlaps = titleRect.left < testRect.right && testRect.left < titleRect.right && titleRect.top < testRect.bottom && testRect.top < titleRect.bottom;
  // DOMRect's fields are prototype accessors, not own properties, so
  // JSON.stringify(rect) is "{}" — spread it into a plain object first.
  const describe = (r: DOMRect) => JSON.stringify({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  expect(overlaps, `arm \`${armId}\`'s title (${describe(titleRect)}) and its default (${describe(testRect)}) must not overlap`).toBe(false);
}

/* ------------------------------------------------------------------ */
/* 1 · SUPPLIED — the test comes from a real `==` block                */
/* ------------------------------------------------------------------ */

export const WiredCondition: Story = {
  name: "if / else — the test SUPPLIED by a real `==` block",
  render: () => <StatefulDomCanvas initial={BRANCH_IF_ELSE_WIRED} width={1200} height={560} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    await expectRegionExpanded(canvasElement, "br");
    expectCornerHasNoRail(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", ["if", "else"]);
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate");
    expectMemberInside(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "fallback");

    // The truthful form: nothing wired means NOTHING inline either — the
    // dot is empty, not lying about owning a default it does not have.
    expect(armTestText(canvasElement, "if")).toBe("");
    expect(armDotState(canvasElement, "if", "if")).toBe("empty");
    expectArmHasNoDot(canvasElement, "else");

    // The `==` block is real and its output actually resolves onto the
    // arm's dot — not a title pretending to compute something.
    for (const wireId of ["e-mode", "e-lit", "e-cond", "e-frame1", "e-frame2", "e-out1", "e-out2"]) {
      await expectWirePainted(canvasElement, wireId);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 2 · UNSUPPLIED — the inline default, "default variables in the title"*/
/* ------------------------------------------------------------------ */

export const InlineDefault: Story = {
  name: 'if / else — UNSUPPLIED, the inline default (\'mode == "fast"\')',
  render: () => <StatefulDomCanvas initial={BRANCH_IF_ELSE_DEFAULT} width={1040} height={520} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    await expectRegionExpanded(canvasElement, "br");
    expectCornerHasNoRail(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", ["if", "else"]);

    // Truthful rendering: the expression keeps its spaces and its quotes,
    // verbatim, and the dot itself reports `valueSet` — "owns a default".
    expect(armTestText(canvasElement, "if")).toBe('mode == "fast"');
    expect(armDotState(canvasElement, "if", "if")).toBe("valueSet");
    expectArmHasNoDot(canvasElement, "else");
    expectNoTextOverlap(canvasElement, "if");
  },
};

/* ------------------------------------------------------------------ */
/* 3-5 · the five-arm ladder Zach named explicitly                     */
/* ------------------------------------------------------------------ */

const LADDER_ARM_IDS = ["if", "elif", "elif-2", "elif-3", "else"];

export const FiveArmLadderDefault: Story = {
  name: "if / elif / elif / elif / else — all inline defaults",
  render: () => <StatefulDomCanvas initial={BRANCH_LADDER_DEFAULT} width={1300} height={780} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    await expectRegionExpanded(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", LADDER_ARM_IDS);

    const expected = ['mode == "fast"', 'mode == "safe"', "count > 10", "retries == 0"];
    for (const [index, armId] of ["if", "elif", "elif-2", "elif-3"].entries()) {
      expect(armTestText(canvasElement, armId), `arm \`${armId}\`'s default`).toBe(expected[index]);
      expect(armDotState(canvasElement, armId, armId)).toBe("valueSet");
      // The defect class that shipped twice on 2026-09-22: this is exactly
      // the ladder where a title/expression collision would show, arm
      // after arm, and a dot-position check alone cannot see it.
      expectNoTextOverlap(canvasElement, armId);
    }
    expectArmHasNoDot(canvasElement, "else");
  },
};

export const FiveArmLadderWired: Story = {
  name: "if / elif / elif / elif / else — every test wired",
  render: () => <StatefulDomCanvas initial={BRANCH_LADDER_WIRED} width={1500} height={820} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    await expectRegionExpanded(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", LADDER_ARM_IDS);

    for (const armId of ["if", "elif", "elif-2", "elif-3"]) {
      expect(armTestText(canvasElement, armId), `arm \`${armId}\` shows no inline text once wired`).toBe("");
    }
    expectArmHasNoDot(canvasElement, "else");

    for (const wireId of [
      "e-mode-1",
      "e-mode-2",
      "e-count",
      "e-retries",
      "e-cond-if",
      "e-cond-elif",
      "e-cond-elif2",
      "e-cond-elif3",
    ]) {
      await expectWirePainted(canvasElement, wireId);
    }
  },
};

export const FiveArmLadderMixed: Story = {
  name: "if / elif / elif / elif / else — wired and inline, arm by arm",
  render: () => <StatefulDomCanvas initial={BRANCH_LADDER_MIXED} width={1500} height={820} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    await expectRegionExpanded(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", LADDER_ARM_IDS);

    // `if`/`elif`: wired, so no inline text.
    expect(armTestText(canvasElement, "if")).toBe("");
    expect(armTestText(canvasElement, "elif")).toBe("");
    await expectWirePainted(canvasElement, "e-cond-if");
    await expectWirePainted(canvasElement, "e-cond-elif");

    // `elif-2`/`elif-3`: unwired, so the literal shows verbatim.
    expect(armTestText(canvasElement, "elif-2")).toBe("count > 10");
    expect(armDotState(canvasElement, "elif-2", "elif-2")).toBe("valueSet");
    expect(armTestText(canvasElement, "elif-3")).toBe("retries == 0");
    expect(armDotState(canvasElement, "elif-3", "elif-3")).toBe("valueSet");
    expectNoTextOverlap(canvasElement, "elif-2");
    expectNoTextOverlap(canvasElement, "elif-3");

    expectArmHasNoDot(canvasElement, "else");
  },
};

/* ------------------------------------------------------------------ */
/* 6 · Folded arm — a sibling's members hold their arm-relative position */
/* ------------------------------------------------------------------ */

export const FoldedArm: Story = {
  name: "Folded arm (unfold, and nothing below moves in its own space)",
  render: () => <StatefulDomCanvas initial={BRANCH_FOLDED} width={1040} height={660} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("identity()");

    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    expect(required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "the folded arm").getAttribute("data-open")).toBe("false");

    // `identity()`'s offset inside ITS OWN arm body — the number that must
    // not change when a SIBLING arm above it unfolds. Re-read from the DOM
    // both times (React may hand back different elements across the write).
    const identityOffset = () => {
      const body = required<HTMLElement>(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "the else arm's body");
      const member = required<HTMLElement>(canvasElement, '[data-block-id="identity"]', "identity()");
      return member.getBoundingClientRect().top - body.getBoundingClientRect().top;
    };
    const rowTop = () => required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "the else row").getBoundingClientRect().top;
    const offsetBefore = identityOffset();
    const rowTopBefore = rowTop();

    await userEvent.click(required<HTMLElement>(canvasElement, '[data-arm-id="elif"] [data-slot="folding-chevron"]', "the elif chevron"));
    await waitFor(() => {
      expect(required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "elif").getAttribute("data-open")).toBe("true");
    });

    // Non-vacuous first: the row really did move, by the body that appeared
    // above it. Then the claim: its member did not move within it.
    expect(rowTop() - rowTopBefore, "unfolding elif pushes the else row down by its body").toBeGreaterThan(100);
    expect(Math.abs(identityOffset() - offsetBefore), "the member's arm-relative position is untouched").toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* 7 · Active arm — the rest fade to one token                          */
/* ------------------------------------------------------------------ */

export const ActiveArm: Story = {
  name: "Active arm (the rest fade to one token)",
  render: () => <StatefulDomCanvas initial={BRANCH_ACTIVE} width={1040} height={660} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("identity()");

    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    const active = required<HTMLElement>(canvasElement, '[data-arm-id="if"]', "the active arm");
    const faded = required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "a non-active arm");
    expect(active.getAttribute("data-active")).toBe("true");
    expect(faded.getAttribute("data-active")).toBe("false");
    // Read back off the browser, not off our own constant: a fade that never
    // reached the paint would still satisfy a DOM-presence check.
    expect(getComputedStyle(faded).opacity).toBe("0.18");
    expect(getComputedStyle(active).opacity).toBe("1");
  },
};

/* ------------------------------------------------------------------ */
/* 8 · Nested — a branch inside an arm                                  */
/* ------------------------------------------------------------------ */

export const Nested: Story = {
  name: "Nested (a branch inside an arm)",
  render: () => <StatefulDomCanvas initial={BRANCH_NESTED} width={760} height={680} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("refine()");

    await expectRegionExpanded(canvasElement, "inner");
    // The containment the scene declares is the containment the DOM shows:
    // the inner branch's `parentId` is the ARM, so it renders inside that
    // arm's body — not in the outer region's free body, which is a scope
    // the program does not have.
    required(
      canvasElement,
      '[data-arm-id="if"] [data-slot="region"][data-region-id="inner"]',
      "the inner branch inside the outer `if` arm",
    );
    await expectArmsStacked(canvasElement, "inner", ["inner-if", "inner-else"]);
    expectCornerHasNoRail(canvasElement, "inner");
    expect(armTestText(canvasElement, "inner-if")).toBe("gain > 1.0");
    expectMemberInside(canvasElement, '[data-arm-id="inner-if"] [data-slot="region-arm-body"]', "refine");
  },
};

/* ------------------------------------------------------------------ */
/* 9 · Through a real host — the projection regression guard            */
/* ------------------------------------------------------------------ */

export const WiredLadderInAHostDom: Story = {
  name: "The five-arm ladder, wired, in a host (DOM canvas)",
  render: () => <StatefulDomCanvas initial={BRANCH_LADDER_WIRED} width={1500} height={820} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    // `hosts/nodeViews.tsx` projects `arm.data.arm.test` into `RegionArm.test`
    // — this regression broke silently once (this file's own header
    // comment). Every arm's dot has to exist AND a real cable has to
    // resolve onto it, in a host, not just against a direct `<BlockRegion>`
    // caller.
    await expectArmsStacked(canvasElement, "br", LADDER_ARM_IDS);
    for (const armId of ["if", "elif", "elif-2", "elif-3"]) {
      armDot(canvasElement, armId, armId); // throws if the dot does not exist
    }
    await expectWirePainted(canvasElement, "e-cond-if");
    await expectWirePainted(canvasElement, "e-cond-elif3");
  },
};

export const WiredLadderInAHostReactFlow: Story = {
  name: "The five-arm ladder, wired, in a host (React Flow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(BRANCH_LADDER_WIRED);
      return (
        <ReactFlowHost scene={scene} onSceneChange={setScene} width={1500} height={820} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      );
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("estimate()");

    // C3: one renderer, three hosts — the branch preset is DATA, so React
    // Flow needed zero branch-specific code. Same regression guard as the
    // DOM host above, against the OTHER host — dot presence only:
    // `expectWirePainted` reads `[data-slot="wire-layer"] [data-wire-id]`,
    // which is `DomCanvas`'s own cable renderer; `ReactFlowHost` paints its
    // cables through `Trace`/`data-slot="trace"` instead (confirmed by
    // inspection — no existing story anywhere in this repo calls
    // `expectWirePainted` against a `ReactFlowHost`), so the frozen helper
    // does not apply here. The acceptance criterion this story exists for
    // is dot presence in a host, which `armDot` alone proves.
    await expectArmsStacked(canvasElement, "br", LADDER_ARM_IDS);
    for (const armId of ["if", "elif", "elif-2", "elif-3"]) {
      armDot(canvasElement, armId, armId);
    }
  },
};
