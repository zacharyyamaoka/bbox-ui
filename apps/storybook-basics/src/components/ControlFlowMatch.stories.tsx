/**
 * Components/Blocks/BlockRegion/Match — `match`/`case`, drawn as the
 * generic Region (lane A) carrying match DATA under the SPLIT grammar
 * (`region.branch.ts`'s header, "SPLIT, 2026-09-22";
 * `reports/media/truthful-branching-2026-09-22.html`, §3.1/§3.3). Split out
 * of `ControlFlowBranch.stories.tsx` because `match` and `if`/`elif`/`else`
 * are two SHAPES now, not two titles on one factory — a LabVIEW Case
 * Structure next to a predicate ladder.
 *
 * The one rule every story below either SHOWS or WITHHOLDS: a dot is a
 * value the structure consumes, and its POSITION says who consumes it.
 * `match` has exactly ONE subject, tested once, on the REGION's own corner
 * card — never an arm. Arms carry static PATTERNS, which are text because a
 * pattern is MATCHED, never evaluated, so `case _:` (nothing to test) gets
 * no dot at all, and neither does any other case arm's LEFT wall.
 *
 * A pattern that also BINDS (`case Point(x=0, y=y)`) is different: `y` is a
 * value the HEADER produces INTO the arm, so it rides the arm's own RIGHT
 * wall — an output, "facing right, facing out" (the report's own words),
 * never the subject's wall. And a guard (`case … if y > 0:`) comes back IN
 * on that SAME arm's own LEFT wall, exactly like an `if` arm's test — the
 * one arm in this file that owns both.
 *
 * The assertions live in `blockRegion.acceptance.ts`, committed before this
 * file and off-limits to it. The local helpers below extend that same
 * measured discipline to what the frozen file has no vocabulary for: an
 * ARM's own capture/guard dot, and whether an arm carries no dot at all.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { MATCH_CAPTURE, MATCH_CASE, MATCH_GUARD, MATCH_NESTED } from "../scene/region.branch.fixtures";
import { expectArmsStacked, expectCornerPorts, expectMemberInside, expectRegionExpanded, expectWirePainted } from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion/Match",
  tags: ["object:region", "host:dom", "host:react-flow", "lane:truthful-branch-viz"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/* ------------------------------------------------------------------ */
/* Local helpers — an ARM's own dot, never the region's corner ports    */
/* (mirrors ControlFlowBranch.stories.tsx's own; kept file-local rather */
/* than shared, matching every other story file's own small `required`).*/
/* ------------------------------------------------------------------ */

function armHeader(root: ParentNode, armId: string): HTMLElement {
  return required<HTMLElement>(root, `[data-arm-id="${armId}"] [data-slot="region-arm-header"]`, `arm \`${armId}\`'s header`);
}

function armDot(root: ParentNode, armId: string, portId: string): HTMLElement {
  return required<HTMLElement>(armHeader(root, armId), `[data-port-id="${portId}"]`, `arm \`${armId}\`'s dot \`${portId}\``);
}

function armDotState(root: ParentNode, armId: string, portId: string): string | null {
  return armDot(root, armId, portId).querySelector('[data-slot="port-dot"]')?.getAttribute("data-state") ?? null;
}

/**
 * A test's default, as actually PAINTED — read from the Bar's own
 * `[data-slot="region-arm-test"]` span, never from the dot itself
 * (`blockRegion.tsx`'s `ArmHeaderRail` draws a BARE dot on purpose,
 * `labelSlot={null}` — see `ControlFlowBranch.stories.tsx`'s identical
 * helper for the collision that forced it). A capture's NAME has no such
 * sibling span yet — `arm.captures` renders through the very same bare-dot
 * `ArmHeaderRail`, and nothing in `blockRegion.tsx` currently paints a
 * capture's name anywhere a reader can see it (only its `[data-port-id]`
 * carries it) — so `Capture`/`Guard` below assert the dot's PRESENCE,
 * STATE and POSITION, never text content, for `y`.
 */
function armTestText(root: ParentNode, armId: string): string {
  return armHeader(root, armId).querySelector('[data-slot="region-arm-test"]')?.textContent ?? "";
}

/** A case arm that tests nothing (`case _:`, or any pattern with no guard)
 *  owns no LEFT-wall dot at all — the subject already lives on the head. */
function expectArmHasNoTest(root: ParentNode, armId: string): void {
  expect(armHeader(root, armId).querySelector('[data-slot="block-port-rail"][data-edge="left"]'), `arm \`${armId}\` should test nothing of its own`).toBeNull();
}

/**
 * The defect class that shipped twice on 2026-09-22 (commit 03b330a): a
 * dot-position assertion cannot see a TEXT collision between an arm's
 * title and its inline default/guard. Measured here, not merely asserted
 * present — see `ControlFlowBranch.stories.tsx`'s identical helper.
 */
function expectNoTextOverlap(root: ParentNode, armId: string): void {
  const header = armHeader(root, armId);
  const title = required<HTMLElement>(header, '[data-slot="region-arm-title"]', `arm \`${armId}\`'s title`);
  const test = header.querySelector<HTMLElement>('[data-slot="region-arm-test"]');
  if (!test) return;
  const titleRect = title.getBoundingClientRect();
  const testRect = test.getBoundingClientRect();
  const overlaps = titleRect.left < testRect.right && testRect.left < titleRect.right && titleRect.top < testRect.bottom && testRect.top < titleRect.bottom;
  expect(overlaps, `arm \`${armId}\`'s title and its guard must not overlap`).toBe(false);
}

/* ------------------------------------------------------------------ */
/* 10 · match / case — three cases + the wildcard, subject wired on head */
/* ------------------------------------------------------------------ */

export const MatchCase: Story = {
  name: 'match cmd: — three cases + case _:, subject wired on the head card',
  render: () => <StatefulDomCanvas initial={MATCH_CASE} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("start()");

    await expectRegionExpanded(canvasElement, "br");
    // The interface, on the corner block: the ONE subject, nothing else.
    expectCornerPorts(canvasElement, "br", { left: ["cmd"] });
    const corner = required<HTMLElement>(canvasElement, '[data-slot="region-corner"]', "the corner block");
    expect(
      Array.from(corner.querySelectorAll('[data-slot="block-port-rail"]')).map((rail) => rail.getAttribute("data-edge")),
      "one wall, the subject's",
    ).toEqual(["left"]);
    await expectWirePainted(canvasElement, "e-subject");

    await expectArmsStacked(canvasElement, "br", ["case-1", "case-2", "case-_"]);
    // No arm carries a dot of its own — patterns are TEXT, matched, never
    // evaluated, so none of the three owns an operand.
    for (const armId of ["case-1", "case-2", "case-_"]) expectArmHasNoTest(canvasElement, armId);

    // Truthful rendering: an arm header is the SOURCE header verbatim.
    expect(
      Array.from(canvasElement.querySelectorAll('[data-slot="region-arm-title"]')).map((title) => title.textContent),
    ).toEqual(['case "go":', 'case "stop":', "case _:"]);

    expectMemberInside(canvasElement, '[data-arm-id="case-1"] [data-slot="region-arm-body"]', "start");
    expectMemberInside(canvasElement, '[data-arm-id="case-2"] [data-slot="region-arm-body"]', "halt");
    expectMemberInside(canvasElement, '[data-arm-id="case-_"] [data-slot="region-arm-body"]', "ignore");
  },
};

/* ------------------------------------------------------------------ */
/* 11 · A capture — a pattern that also BINDS                          */
/* ------------------------------------------------------------------ */

export const Capture: Story = {
  name: "case Point(x=0, y=y): — a capture rides the tab's right edge, facing out",
  render: () => <StatefulDomCanvas initial={MATCH_CAPTURE} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("north()");

    await expectRegionExpanded(canvasElement, "match");
    expectCornerPorts(canvasElement, "match", { left: ["pt"] });
    await expectArmsStacked(canvasElement, "match", ["case-1", "case-2", "case-_"]);

    // `case-1` binds `y` OUT — a capture, never a test: no left wall, and
    // its dot exists and reads its constant `"empty"` state (captures never
    // wire — `region.branch.ts`'s `armNode` always hands them state
    // `"empty"`; there is nothing to default or to land a cable on).
    expectArmHasNoTest(canvasElement, "case-1");
    armDot(canvasElement, "case-1", "y"); // throws if the capture's own dot does not exist
    expect(armDotState(canvasElement, "case-1", "y")).toBe("empty");
    // Patterns with nothing to bind own no dot at all.
    for (const armId of ["case-2", "case-_"]) {
      expect(armHeader(canvasElement, armId).querySelector('[data-slot="block-port-rail"]'), `arm \`${armId}\` binds nothing`).toBeNull();
    }

    // The claim that makes this a TAB and not a floating label: the
    // capture's centre sits strictly inside the frame, not out past it —
    // it rides the arm's own header box, not the block below it.
    const frame = required<HTMLElement>(canvasElement, '[data-slot="region"][data-region-id="match"] [data-slot="region-frame"]', "the frame").getBoundingClientRect();
    const dotRect = armDot(canvasElement, "case-1", "y").getBoundingClientRect();
    const centerX = (dotRect.left + dotRect.right) / 2;
    expect(centerX, "the capture's centre rides the tab, not the block").toBeLessThan(frame.right);

    // The capture is a real value, not decoration: it actually reaches
    // `north()`'s own input.
    await expectWirePainted(canvasElement, "e-capture");
    expectMemberInside(canvasElement, '[data-arm-id="case-1"] [data-slot="region-arm-body"]', "north");
  },
};

/* ------------------------------------------------------------------ */
/* 12 · A guard — the capture binds out, the guard reads back in        */
/* ------------------------------------------------------------------ */

export const Guard: Story = {
  name: "case Point(x=0, y=y) if y > 0: — the guard returns as the arm's own operand",
  render: () => <StatefulDomCanvas initial={MATCH_GUARD} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("north()");

    await expectRegionExpanded(canvasElement, "match");
    // The subject stays on the head — a guard is the ARM's own operand, it
    // never promotes back up to a second head port.
    expectCornerPorts(canvasElement, "match", { left: ["pt"] });
    await expectArmsStacked(canvasElement, "match", ["case-1", "case-2", "case-_"]);

    // `case-1` owns BOTH walls: `y` out (the pattern's capture, right),
    // `y > 0` back in (the guard, left) — the one arm in this file that
    // does. The guard rides `test`, so unlike the capture it DOES paint a
    // sibling `region-arm-test` span — the same mechanism an `if`/`elif`
    // arm's inline default uses (`ControlFlowBranch.stories.tsx`).
    armDot(canvasElement, "case-1", "y"); // the capture dot exists
    expect(armDotState(canvasElement, "case-1", "y")).toBe("empty");
    expect(armTestText(canvasElement, "case-1")).toBe("y > 0");
    expect(armDotState(canvasElement, "case-1", "guard")).toBe("valueSet");
    expectNoTextOverlap(canvasElement, "case-1");

    // Neither sibling arm carries either wall.
    for (const armId of ["case-2", "case-_"]) {
      expect(armHeader(canvasElement, armId).querySelector('[data-slot="block-port-rail"]'), `arm \`${armId}\` carries neither a capture nor a guard`).toBeNull();
    }

    await expectWirePainted(canvasElement, "e-subject");
    await expectWirePainted(canvasElement, "e-capture");
  },
};

/* ------------------------------------------------------------------ */
/* 13 · Nested — a match inside a case                                  */
/* ------------------------------------------------------------------ */

export const Nested: Story = {
  name: "Nested (a match inside a case)",
  render: () => <StatefulDomCanvas initial={MATCH_NESTED} width={900} height={700} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("ne()");

    await expectRegionExpanded(canvasElement, "inner");
    // The containment the scene declares is the containment the DOM shows:
    // the inner match's `parentId` is the outer arm `case-point`, so it
    // renders inside THAT arm's body.
    required(
      canvasElement,
      '[data-arm-id="case-point"] [data-slot="region"][data-region-id="inner"]',
      "the inner match inside the outer `case Point():` arm",
    );
    expectCornerPorts(canvasElement, "inner", { left: ["quadrant"] });
    await expectArmsStacked(canvasElement, "inner", ["inner-case-1", "inner-case-2", "inner-case-_"]);
    expectMemberInside(canvasElement, '[data-arm-id="inner-case-1"] [data-slot="region-arm-body"]', "ne");
    expectMemberInside(canvasElement, '[data-arm-id="inner-case-2"] [data-slot="region-arm-body"]', "nw");
  },
};

/* ------------------------------------------------------------------ */
/* 14 · Through a real host — the projection regression guard           */
/* ------------------------------------------------------------------ */

export const CaptureInAHostReactFlow: Story = {
  name: "A capture, in a host (React Flow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(MATCH_CAPTURE);
      return <ReactFlowHost scene={scene} onSceneChange={setScene} width={1040} height={560} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("north()");

    // Same regression guard as `ControlFlowBranch.stories.tsx`'s ladder
    // host stories: `hosts/nodeViews.tsx` has to project BOTH
    // `arm.data.arm.captures` and the subject's own port onto every canvas
    // host, not just a direct `<BlockRegion>` caller. Dot presence only —
    // `expectWirePainted` reads `DomCanvas`'s own `[data-slot="wire-layer"]`
    // cable renderer; `ReactFlowHost` paints cables through `Trace` instead
    // (confirmed by inspection — see `ControlFlowBranch.stories.tsx`'s
    // identical note), so the frozen helper does not apply to this host.
    await expectRegionExpanded(canvasElement, "match");
    expectCornerPorts(canvasElement, "match", { left: ["pt"] });
    await expectArmsStacked(canvasElement, "match", ["case-1", "case-2", "case-_"]);
    armDot(canvasElement, "case-1", "y"); // throws if the capture dot does not exist
  },
};

export const CaptureInAHostDom: Story = {
  name: "A capture, in a host (DOM canvas)",
  render: () => <StatefulDomCanvas initial={MATCH_CAPTURE} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("north()");

    await expectRegionExpanded(canvasElement, "match");
    expectCornerPorts(canvasElement, "match", { left: ["pt"] });
    await expectArmsStacked(canvasElement, "match", ["case-1", "case-2", "case-_"]);
    armDot(canvasElement, "case-1", "y");
    await expectWirePainted(canvasElement, "e-subject");
    await expectWirePainted(canvasElement, "e-capture");
  },
};
