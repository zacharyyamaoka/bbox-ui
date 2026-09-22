/**
 * Skin/RegionVariants — the region DRAWINGS over one region
 * component, switched by an attribute, measured per variant
 * (docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md, lane `regions`).
 *
 * Zach: "please make 5 proposals for how these regions could be drawn
 * differently (one is adding that line header for the branches)". The
 * DOM-canvas render is the target look (`Pasted image 20260919115249.png`,
 * `…115353.png`); the For Loop reading (`…115424.png`) is kept.
 *
 * ── ACCEPTANCE, COMMITTED BEFORE THE IMPLEMENTATION ─────────────────────
 * Every assertion below MEASURES (`getBoundingClientRect`,
 * `getComputedStyle`, `elementFromPoint`) rather than asserting DOM
 * presence. Per variant, on the SAME fixture (cf-C's nested Branch + cf-A's
 * For Loop with two members):
 *
 *   1. the corner block's card sits flush: its left/top within 1px of the
 *      frame's left/top — for the outer branch, the nested branch, the loop;
 *   2. the left-wall port dot's CENTRE is within ±1px of the frame's left x
 *      ("I want the port to be right on the edge"), and the dot is not cut
 *      off: a hit-test at its outboard half lands on the dot, not on
 *      whatever the frame's clip would otherwise expose;
 *   3. every arm header is exactly the variant's declared height
 *      (`REGION_VARIANTS[v].arms.headerPx`), so the TS spec and the paint
 *      cannot drift;
 *   4. the arms still stack under the corner block (`expectArmsStacked`,
 *      the lane-A helper, unchanged) and fold with the chevron;
 *   5. the variant's own paint claim reached the browser (v2's full-width
 *      header RULE, v3's tinted band, v4's open right/bottom, v5's arm cards
 *      and nested contrast, v6's UNFILLED inset outline, v7's side-stroke-free
 *      edge card) — each read back off computed style;
 *   6. across the gallery, the drawings are pairwise DISTINCT on a
 *      measured signature, and the opaque card is byte-identical in every
 *      one of them (its paint is the host's `Block`, deliberately not a
 *      variant axis).
 *
 * The switch is `data-bbox-region-variant` on ANY ancestor — the contract
 * names `document.documentElement.dataset.bboxRegionVariant` for an app
 * (`SwitchLive` proves that path re-paints with no re-render), and a
 * wrapper element for a gallery (`AllFive`).
 *
 * Added in the fix round (the auditor's reproduced major): a switch on a
 * NEARER ancestor than `<html>` must re-resolve too, or the CSS tokens
 * (keyed on the attribute) repaint while the two TS-driven values — the
 * arm header height and the chevron's reveal — keep the old drawing.
 * `SwitchOnAncestor` flips a wrapper through React state while the region
 * bails out of the re-render (the Storybook-global shape), and
 * `SwitchOnAncestorDom` writes the wrapper's attribute directly.
 * 2026-09-19, second round: Zach picked three of the five drawings in the
 * babble gallery (`reports/media/branch-arm-drawings-2026-09-19.html`) and
 * asked for them for real. They join the table as `v6`/`v7`/`v8` — the
 * gallery numbered them V1/V2/V3, so each keeps the gallery's NAME as its
 * title and `skin/regionVariants.ts` carries the mapping. Two new arm
 * `header` kinds came with them (`outline`, `edge`); the third pick needed
 * none, and why is worth reading in that file's `v8` note.
 *
 * `SwitchNeverHalfPainted` is the strict form: for all three switch paths,
 * the frame the switch lands in is measured in a ResizeObserver callback —
 * after style and layout, before paint — so a region that catches up one
 * task later (a half-switched frame on screen) is red, not "eventually
 * green".
 */
import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { BRANCH_NESTED } from "../scene/region.branch.fixtures";
import { REGION_NODE_TYPE } from "../scene/region";
import {
  DEFAULT_REGION_VARIANT,
  drawsHeaderRule,
  REGION_VARIANT_ATTR,
  REGION_VARIANT_IDS,
  REGION_VARIANTS,
  regionVariantAttrs,
  type RegionVariantId,
} from "./regionVariants";
import { expectArmsStacked, expectCornerPorts, expectRegionExpanded, expectRegionOpaque } from "../components/region.acceptance";

const meta = {
  title: "Skin/RegionVariants",
  tags: ["object:region", "host:dom", "lane:regions"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/* ------------------------------------------------------------------ */
/* The ONE fixture every variant is drawn on                            */
/* ------------------------------------------------------------------ */

/**
 * cf-A's `WithMembers` loop (`ControlFlowRegion.stories.tsx`'s `LOOP_SCENE`,
 * restated because that file keeps it private): `for other in others:`
 * with `merge`/`smooth` in its free body. Moved right so it sits beside
 * the nested branch rather than under it.
 */
const LOOP_AT_X = 690;
const LOOP_NODES: HostScene["nodes"] = [
  {
    id: "loop",
    type: REGION_NODE_TYPE,
    position: { x: LOOP_AT_X, y: 24 },
    data: {
      name: "For Loop",
      region: { kind: "loop", loop: "for" },
      ports: { left: ["Iterable"], right: ["Iter"] },
      w: 440,
      h: 250,
    },
  },
  { id: "merge", type: "block", parentId: "loop", position: { x: 40, y: 20 }, data: { name: "merge", view: "port", w: 120, h: 106, ports: { left: ["other", "pose"], right: ["Pose"] } } },
  { id: "smooth", type: "block", parentId: "loop", position: { x: 250, y: 20 }, data: { name: "smooth", view: "port", w: 120, h: 64, ports: { left: ["in"], right: ["out"] } } },
];

/** An opaque region — the P5 card — on the same board, so the gallery can
 *  measure that it reads the SAME in all five (item 6). */
const OPAQUE_NODE: HostScene["nodes"][number] = {
  id: "op",
  type: REGION_NODE_TYPE,
  position: { x: LOOP_AT_X, y: 330 },
  data: { name: "Collapsed", region: { kind: "group", view: "opaque" }, w: 300, h: 120 },
};

/**
 * cf-C's `Nested` (`BRANCH_NESTED`, imported — never retyped) beside
 * cf-A's loop and one opaque card.
 *
 * ONE patch, visible here rather than hidden in a copy: the outer `if`
 * arm's body grows from 360 to 372. The inner branch it holds is 16 (its
 * authored y) + 80 (corner) + 2 × (32 + 96) (two arms) + 12 (pad) = 364px
 * tall, so at 360 it hangs 4px past its own arm's body — visible in cf-C's
 * shipped `nested.png` too. A proposal capture must not carry a fixture's
 * 4px overlap as if it were the drawing's, and every variant's header
 * (26–32px) fits under 372 with slack.
 */
const OUTER_IF_ARM_BODY_PX = 372;
const FIXTURE: HostScene = {
  nodes: [
    ...BRANCH_NESTED.nodes.map((node) =>
      node.id === "if" ? { ...node, data: { ...node.data, arm: { ...node.data.arm, open: true, h: OUTER_IF_ARM_BODY_PX } } } : node,
    ),
    ...LOOP_NODES,
    OPAQUE_NODE,
  ],
  edges: [],
};

const CANVAS = { width: 1180, height: 700 } as const;

function Bench() {
  const [scene, setScene] = useState(FIXTURE);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={CANVAS.width} height={CANVAS.height} />;
}

/* ------------------------------------------------------------------ */
/* Measured helpers                                                    */
/* ------------------------------------------------------------------ */

const REGIONS_ON_THE_BOARD = ["br", "inner", "loop"] as const;
const LEFT_WALL_PORT: Record<(typeof REGIONS_ON_THE_BOARD)[number], string> = { br: "mode", inner: "gain", loop: "Iterable" };

function regionOf(root: ParentNode, id: string): HTMLElement {
  return required<HTMLElement>(root, `[data-slot="region"][data-region-id="${id}"]`, `region \`${id}\``);
}

function frameOf(region: HTMLElement): HTMLElement {
  return required<HTMLElement>(region, ':scope > [data-slot="region-frame"]', "the frame");
}

function cornerCardOf(region: HTMLElement, id: string): HTMLElement {
  return required<HTMLElement>(region, `:scope > [data-slot="region-frame"] > [data-slot="region-corner"] [data-block-id="${id}"] [data-slot="block"]`, "the corner card");
}

function centre(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Item 1 — the corner card is flush with the frame, within 1px. */
function expectCornerFlush(region: HTMLElement, id: string): void {
  const frame = frameOf(region).getBoundingClientRect();
  const card = cornerCardOf(region, id).getBoundingClientRect();
  expect(Math.abs(card.left - frame.left), `${id}: corner card left vs frame left`).toBeLessThanOrEqual(1);
  expect(Math.abs(card.top - frame.top), `${id}: corner card top vs frame top`).toBeLessThanOrEqual(1);
}

/** Item 2 — the left-wall port dot is ON the frame's left edge and not
 *  cut off by it. */
function expectPortOnTheEdge(region: HTMLElement, id: string, portId: string): void {
  const dot = required<HTMLElement>(
    region,
    `[data-slot="region-corner"] [data-block-id="${id}"] [data-slot="block-port-rail"][data-edge="left"] [data-port-id="${portId}"] [data-slot="port-dot"]`,
    `${id}'s ${portId} dot`,
  );
  // `elementFromPoint` answers only for points inside the VIEWPORT (it
  // returns null off-screen — a tall gallery would read as "clipped"), so
  // bring the dot on screen first and measure everything after the scroll.
  dot.scrollIntoView({ block: "center", inline: "nearest" });
  const frame = frameOf(region).getBoundingClientRect();
  const rect = dot.getBoundingClientRect();
  const c = centre(rect);
  expect(Math.abs(c.x - frame.left), `${id}/${portId}: dot centre x vs frame left x`).toBeLessThanOrEqual(1);
  // Straddles: half the dot hangs OUTSIDE the frame …
  expect(rect.left, `${id}/${portId}: the dot's outboard half is outside the frame`).toBeLessThan(frame.left - 1);
  // … and that half is really painted and hit-testable, i.e. nothing clips
  // it off at the frame's edge (`115050`'s cut-off `input 1` is the failure).
  const hit = document.elementFromPoint(rect.left + 1, c.y);
  expect(hit && dot.contains(hit), `${id}/${portId}: a hit at the dot's outboard edge lands on the dot`).toBe(true);
}

/** Item 3 — every arm header is the variant's declared height. */
function expectArmHeaderHeights(region: HTMLElement, variant: RegionVariantId): void {
  const headers = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-slot="region-frame"] > [data-slot="region-arm"] > [data-slot="region-arm-header"]'));
  expect(headers.length, "the region has arm headers to measure").toBeGreaterThan(0);
  for (const header of headers) {
    expect(Math.abs(header.getBoundingClientRect().height - REGION_VARIANTS[variant].arms.headerPx), `arm header height (${variant})`).toBeLessThanOrEqual(1);
  }
}

function transparent(color: string): boolean {
  return color === "rgba(0, 0, 0, 0)" || color === "transparent";
}

/** Item 5 — the variant's own paint claim, read back off computed style. */
function expectVariantPaint(root: ParentNode, variant: RegionVariantId): void {
  const outer = regionOf(root, "br");
  const frame = frameOf(outer);
  const frameStyle = getComputedStyle(frame);
  const spec = REGION_VARIANTS[variant];

  // Every variant keeps the top and left lines (the corner block's home);
  // only the bracket opens the right and bottom.
  expect(frameStyle.borderTopWidth, `${variant}: frame top stroke`).toBe("1px");
  expect(frameStyle.borderLeftWidth, `${variant}: frame left stroke`).toBe("1px");
  if (spec.frame.open === "right-bottom") {
    expect(frameStyle.borderRightWidth, `${variant}: open right`).toBe("0px");
    expect(frameStyle.borderBottomWidth, `${variant}: open bottom`).toBe("0px");
  } else {
    expect(frameStyle.borderRightWidth, `${variant}: closed right`).toBe("1px");
    expect(frameStyle.borderBottomWidth, `${variant}: closed bottom`).toBe("1px");
  }

  // The header RULE under the corner block — the line Zach pointed at in
  // `115353` — is v2's whole claim: full width, on the corner's bottom edge.
  const rule = frame.querySelector<HTMLElement>(':scope > [data-slot="region-header-rule"]');
  if (drawsHeaderRule(spec)) {
    expect(rule, `${variant}: the header rule exists`).not.toBeNull();
    expect(getComputedStyle(rule!).display, `${variant}: the header rule is drawn`).not.toBe("none");
    const ruleRect = rule!.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const card = cornerCardOf(outer, "br").getBoundingClientRect();
    expect(Math.abs(ruleRect.width - frameRect.width), `${variant}: the rule runs the full width`).toBeLessThanOrEqual(2);
    expect(Math.abs(ruleRect.bottom - card.bottom), `${variant}: the rule continues the corner's bottom edge`).toBeLessThanOrEqual(1);
  } else if (rule) {
    expect(getComputedStyle(rule).display, `${variant}: no header rule`).toBe("none");
  }

  const firstHeader = required<HTMLElement>(outer, ':scope > [data-slot="region-frame"] > [data-slot="region-arm"] > [data-slot="region-arm-header"]', "the first arm header");
  const headerBg = getComputedStyle(firstHeader).backgroundColor;
  if (spec.arms.header === "band") {
    expect(transparent(headerBg), `${variant}: the arm header is a tinted band`).toBe(false);
  } else {
    expect(transparent(headerBg), `${variant}: the arm header paints no band`).toBe(true);
  }

  const decor = outer.querySelector<HTMLElement>(':scope > [data-slot="region-frame"] > [data-slot="region-arm"] > [data-slot="region-arm-decor"]');
  if (spec.arms.header === "card" || spec.arms.header === "indent" || spec.arms.header === "outline" || spec.arms.header === "edge") {
    expect(decor, `${variant}: arm decor exists`).not.toBeNull();
    expect(getComputedStyle(decor!).display, `${variant}: arm decor is drawn`).not.toBe("none");
    const decorRect = decor!.getBoundingClientRect();
    const armRect = decor!.parentElement!.getBoundingClientRect();
    if (spec.arms.header === "outline") {
      // v6, Transparent card — the gallery's V1. An inset card with the
      // FILL TAKEN OUT: strictly inside its row on every side, rounded, a
      // stroke on all four sides, and you can see the board through it.
      // The last clause is the whole drawing, so it is asserted, not
      // implied: "control flow is not a card!" (Zach, 2026-09-19).
      const decorStyle = getComputedStyle(decor!);
      expect(decorRect.left, `${variant}: outline inset left`).toBeGreaterThan(armRect.left);
      expect(decorRect.right, `${variant}: outline inset right`).toBeLessThan(armRect.right);
      expect(decorRect.top, `${variant}: outline inset top`).toBeGreaterThan(armRect.top);
      expect(decorRect.bottom, `${variant}: outline inset bottom`).toBeLessThan(armRect.bottom);
      expect(decorRect.width, `${variant}: outline spans the row`).toBeGreaterThan(armRect.width * 0.8);
      expect(transparent(decorStyle.backgroundColor), `${variant}: the outline is UNFILLED`).toBe(true);
      expect(parseFloat(decorStyle.borderTopWidth), `${variant}: outline top stroke`).toBeGreaterThan(0);
      expect(parseFloat(decorStyle.borderLeftWidth), `${variant}: outline side stroke`).toBeGreaterThan(0);
      expect(parseFloat(decorStyle.borderTopLeftRadius), `${variant}: the outline is rounded`).toBeGreaterThan(0);
      // The title moves in with the outline, so it sits INSIDE it rather
      // than straddling the stroke.
      expect(parseFloat(getComputedStyle(firstHeader).paddingLeft), `${variant}: the header follows the outline in`).toBeGreaterThan(0);
    } else if (spec.arms.header === "edge") {
      // v7, Edge card — the gallery's V2. Edge to edge: the decor reaches
      // both side walls of its row (so nothing is "parked in a box"), and
      // it draws its TOP and BOTTOM only, so no side stroke can double
      // against the frame's own left/right border.
      const decorStyle = getComputedStyle(decor!);
      expect(Math.abs(decorRect.left - armRect.left), `${variant}: decor reaches the left wall`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(decorRect.right - armRect.right), `${variant}: decor reaches the right wall`).toBeLessThanOrEqual(0.5);
      expect(transparent(decorStyle.backgroundColor), `${variant}: the edge card is UNFILLED`).toBe(true);
      expect(parseFloat(decorStyle.borderTopWidth), `${variant}: edge top stroke`).toBeGreaterThan(0);
      expect(parseFloat(decorStyle.borderBottomWidth), `${variant}: edge bottom stroke`).toBeGreaterThan(0);
      expect(decorStyle.borderLeftWidth, `${variant}: no left stroke to double against the frame`).toBe("0px");
      expect(decorStyle.borderRightWidth, `${variant}: no right stroke to double against the frame`).toBe("0px");
      expect(parseFloat(decorStyle.borderTopLeftRadius), `${variant}: square, so the strokes meet the frame flat`).toBe(0);
    } else if (spec.arms.header === "card") {
      // An inset card: strictly inside its row on every side, wide, filled.
      expect(decorRect.left, `${variant}: card inset left`).toBeGreaterThan(armRect.left);
      expect(decorRect.right, `${variant}: card inset right`).toBeLessThan(armRect.right);
      expect(decorRect.width, `${variant}: card spans the row`).toBeGreaterThan(armRect.width * 0.8);
      expect(transparent(getComputedStyle(decor!).backgroundColor), `${variant}: card is filled`).toBe(false);
    } else {
      // An indent guide: a hairline hanging under the chevron, no fill.
      expect(decorRect.width, `${variant}: guide is a hairline`).toBeLessThanOrEqual(2);
      expect(decorRect.height, `${variant}: guide hangs down the arm`).toBeGreaterThan(20);
      expect(decorRect.left - armRect.left, `${variant}: guide sits in the gutter`).toBeGreaterThan(8);
      expect(decorRect.left - armRect.left, `${variant}: guide sits in the gutter`).toBeLessThan(48);
    }
  } else if (decor) {
    expect(getComputedStyle(decor).display, `${variant}: no arm decor`).toBe("none");
  }

  // Nested contrast: the inner frame's fill is one tone off the outer's
  // when the variant says so, and identical when it does not.
  const innerFrame = frameOf(regionOf(root, "inner"));
  const outerFill = frameStyle.backgroundColor;
  const innerFill = getComputedStyle(innerFrame).backgroundColor;
  if (spec.nested.contrast === "deepen") {
    expect(transparent(outerFill), `${variant}: the outer frame is filled`).toBe(false);
    expect(innerFill, `${variant}: the nested frame is one tone deeper`).not.toBe(outerFill);
  } else {
    expect(innerFill, `${variant}: nested frame matches the outer`).toBe(outerFill);
  }
}

/**
 * Item 4 for the OUTER branch — `expectArmsStacked`'s measurements
 * (same tolerances, same claims), scoped to a region's DIRECT arm rows.
 * The lane-A helper counts every `[data-slot="region-arm"]` under the
 * region, which on a nested fixture includes the inner branch's rows (the
 * shipped `Nested` story only ever calls it on the inner region for that
 * reason). The inner region is still measured through the helper itself.
 */
function expectOwnArmsStacked(region: HTMLElement, armIds: string[]): void {
  const rows = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-slot="region-frame"] > [data-slot="region-arm"]'));
  expect(rows.map((row) => row.getAttribute("data-arm-id"))).toEqual(armIds);
  const frame = frameOf(region).getBoundingClientRect();
  const corner = required<HTMLElement>(region, ':scope > [data-slot="region-frame"] > [data-slot="region-corner"]', "the corner").getBoundingClientRect();
  let previousBottom = corner.bottom;
  for (const row of rows) {
    const armId = row.getAttribute("data-arm-id");
    const rect = row.getBoundingClientRect();
    expect(rect.top, `arm ${armId} starts where the previous row ended`).toBeGreaterThanOrEqual(previousBottom - 2);
    expect(Math.abs(rect.left - frame.left), `arm ${armId} spans from the frame's left edge`).toBeLessThanOrEqual(4);
    expect(Math.abs(rect.width - frame.width), `arm ${armId} spans the frame's width`).toBeLessThanOrEqual(4);
    required(row, ':scope > [data-slot="region-arm-header"] [data-slot="folding-chevron"]', `arm ${armId}'s fold chevron`);
    const body = row.querySelector<HTMLElement>(':scope > [data-slot="region-arm-body"]');
    if (row.getAttribute("data-open") === "false") {
      expect(body === null || body.getBoundingClientRect().height <= 1, `folded arm ${armId} shows no body`).toBe(true);
    } else {
      expect(body, `open arm ${armId} has a body`).not.toBeNull();
      expect(body!.getBoundingClientRect().height).toBeGreaterThan(0);
    }
    previousBottom = rect.bottom;
  }
  expect(previousBottom).toBeLessThanOrEqual(frame.bottom + 2);
}

/** The whole per-variant contract, items 1–5. */
async function expectRegionVariant(root: ParentNode, variant: RegionVariantId): Promise<void> {
  for (const id of REGIONS_ON_THE_BOARD) await expectRegionExpanded(root, id);
  await expectArmsStacked(root, "inner", ["inner-if", "inner-else"]);
  await waitFor(() => expectOwnArmsStacked(regionOf(root, "br"), ["if", "else"]));
  expectCornerPorts(root, "loop", { left: ["Iterable"], right: ["Iter"] });

  await waitFor(() => {
    for (const id of REGIONS_ON_THE_BOARD) {
      const region = regionOf(root, id);
      expectCornerFlush(region, id);
      expectPortOnTheEdge(region, id, LEFT_WALL_PORT[id]);
    }
    expectArmHeaderHeights(regionOf(root, "br"), variant);
    expectArmHeaderHeights(regionOf(root, "inner"), variant);
    expectVariantPaint(root, variant);
  });
}

/** Item 6's ruler: what makes one drawing measurably different from another. */
function signatureOf(root: ParentNode): string {
  const outer = regionOf(root, "br");
  const frame = getComputedStyle(frameOf(outer));
  const header = required<HTMLElement>(outer, ':scope > [data-slot="region-frame"] > [data-slot="region-arm"] > [data-slot="region-arm-header"]', "the first arm header");
  const title = required<HTMLElement>(header, '[data-slot="region-arm-title"]', "the arm title");
  const rule = outer.querySelector<HTMLElement>(':scope > [data-slot="region-frame"] > [data-slot="region-header-rule"]');
  const decor = outer.querySelector<HTMLElement>(':scope > [data-slot="region-frame"] > [data-slot="region-arm"] > [data-slot="region-arm-decor"]');
  return [
    frame.borderColor,
    frame.backgroundColor,
    frame.borderRightWidth,
    frame.borderTopLeftRadius,
    getComputedStyle(header).backgroundColor,
    getComputedStyle(header).borderBottomWidth,
    String(Math.round(header.getBoundingClientRect().height)),
    getComputedStyle(title).fontFamily,
    getComputedStyle(title).fontSize,
    rule ? getComputedStyle(rule).display : "no-rule",
    decor ? getComputedStyle(decor).display : "no-decor",
    // ADDED with v6/v7 (2026-09-19): the decor box's own GEOMETRY. Without
    // it the Transparent card and the Edge card sign identically — same
    // frame, same header, both `decor: block` — while being two visibly
    // different drawings. The ruler has to be able to see what the drawing
    // changed, or "pairwise distinct" stops meaning anything. Strictly
    // additive: more fields can only split pairs apart, never merge them.
    decor ? getComputedStyle(decor).borderWidth : "no-decor",
    decor ? getComputedStyle(decor).borderRadius : "no-decor",
    decor ? String(Math.round(decor.getBoundingClientRect().left - decor.parentElement!.getBoundingClientRect().left)) : "no-decor",
    getComputedStyle(header).paddingLeft,
  ].join("|");
}

function opaqueCardPaintOf(root: ParentNode): string {
  const card = required<HTMLElement>(root, '[data-slot="region"][data-region-id="op"] [data-block-id="op"] [data-slot="block"]', "the opaque card");
  const style = getComputedStyle(card);
  return [style.borderColor, style.borderWidth, style.backgroundColor, style.borderRadius, style.boxShadow].join("|");
}

/* ------------------------------------------------------------------ */
/* One story per variant                                               */
/* ------------------------------------------------------------------ */

function variantStory(variant: RegionVariantId): Story {
  return {
    name: `${variant} — ${REGION_VARIANTS[variant].title}`,
    render: () => (
      <div {...regionVariantAttrs(variant)}>
        <Bench />
      </div>
    ),
    play: async ({ canvasElement }) => {
      await expectRegionVariant(canvasElement, variant);
    },
  };
}

export const V1: Story = variantStory("v1");
export const V2: Story = variantStory("v2");
export const V3: Story = variantStory("v3");
export const V4: Story = variantStory("v4");
export const V5: Story = variantStory("v5");
// The three Zach picked out of the 2026-09-19 babble gallery, where he
// called them V1/V2/V3 — see `skin/regionVariants.ts` for the mapping.
export const V6: Story = variantStory("v6");
export const V7: Story = variantStory("v7");
export const V8: Story = variantStory("v8");
// 2026-09-20, 00:45: v9 is v8 with the corner card's rule turned on, so the
// FIRST arm has a line above it too; v10 is the hand sketch — the same rule,
// square corners and a centred card title. Both ADD a drawing; v8 is
// untouched because he is still comparing it.
export const V9: Story = variantStory("v9");
export const V10: Story = variantStory("v10");

/* ------------------------------------------------------------------ */
/* The gallery — every drawing, one fixture, side by side for the report */
/* ------------------------------------------------------------------ */

export const AllFive: Story = {
  name: "every drawing on the same fixture",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 8 }}>
      {REGION_VARIANT_IDS.map((variant) => (
        <section key={variant} data-gallery-variant={variant} {...regionVariantAttrs(variant)}>
          <h2 style={{ margin: "0 0 4px 24px", font: "600 13px/1.2 ui-sans-serif, system-ui, sans-serif" }}>
            {variant} — {REGION_VARIANTS[variant].title}
            <span style={{ marginLeft: 12, fontWeight: 400, color: "var(--muted-foreground)" }}>{REGION_VARIANTS[variant].blurb}</span>
          </h2>
          <Bench />
        </section>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const signatures = new Map<RegionVariantId, string>();
    const cards = new Set<string>();
    for (const variant of REGION_VARIANT_IDS) {
      const section = required<HTMLElement>(canvasElement, `[data-gallery-variant="${variant}"]`, `the ${variant} row`);
      expect(section.getAttribute(REGION_VARIANT_ATTR)).toBe(variant);
      await expectRegionVariant(section, variant);
      await expectRegionOpaque(section, "op");
      signatures.set(variant, signatureOf(section));
      cards.add(opaqueCardPaintOf(section));
    }
    // Genuinely different drawings: pairwise distinct signatures.
    for (const a of REGION_VARIANT_IDS) {
      for (const b of REGION_VARIANT_IDS) {
        if (a < b) expect(signatures.get(a), `${a} and ${b} are the same drawing`).not.toBe(signatures.get(b));
      }
    }
    // And ONE opaque card: the P5 card is the host's Block, not a variant axis.
    expect(Array.from(cards), "the opaque card reads the same in every drawing").toHaveLength(1);
  },
};

/* ------------------------------------------------------------------ */
/* The app's switch — the html attribute, with no re-render              */
/* ------------------------------------------------------------------ */

export const SwitchLive: Story = {
  name: "switching via document.documentElement re-paints live",
  render: () => <Bench />,
  play: async ({ canvasElement }) => {
    const html = document.documentElement;
    const before = html.getAttribute(REGION_VARIANT_ATTR);
    try {
      html.removeAttribute(REGION_VARIANT_ATTR);
      await expectRegionVariant(canvasElement, DEFAULT_REGION_VARIANT);

      // No React state was touched between these two lines: the component
      // has to notice the attribute on its own.
      html.dataset.bboxRegionVariant = "v2";
      await expectRegionVariant(canvasElement, "v2");

      html.dataset.bboxRegionVariant = "v4";
      await expectRegionVariant(canvasElement, "v4");

      html.removeAttribute(REGION_VARIANT_ATTR);
      await expectRegionVariant(canvasElement, DEFAULT_REGION_VARIANT);
    } finally {
      if (before === null) html.removeAttribute(REGION_VARIANT_ATTR);
      else html.setAttribute(REGION_VARIANT_ATTR, before);
    }
  },
};

/* ------------------------------------------------------------------ */
/* A nearer ancestor's switch — the Storybook global, a board, a row    */
/* ------------------------------------------------------------------ */

/** Every region on the board resolved to `variant` (the TS side), read off
 *  its informational `data-region-variant` stamp. */
function expectResolvedVariant(root: ParentNode, variant: RegionVariantId): void {
  for (const id of [...REGIONS_ON_THE_BOARD, "op"]) {
    expect(regionOf(root, id).getAttribute("data-region-variant"), `${id} resolved variant`).toBe(variant);
  }
}

/** The whole contract AND the TS side agreeing with it. */
async function expectSwitchedTo(root: ParentNode, variant: RegionVariantId): Promise<void> {
  await expectRegionVariant(root, variant);
  await waitFor(() => expectResolvedVariant(root, variant));
}

/**
 * A wrapper whose attribute is React state, with the board handed in as
 * `children` — so a switch re-renders the wrapper and React BAILS OUT of
 * the board (same element, same props). That is the case the <html>-only
 * observer missed: nothing re-renders the region, and nothing on `<html>`
 * changes.
 */
function AncestorSwitch({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<RegionVariantId>(DEFAULT_REGION_VARIANT);
  return (
    <div>
      <div role="group" aria-label="region variant" style={{ display: "flex", gap: 4, padding: 4 }}>
        {REGION_VARIANT_IDS.map((id) => (
          <button key={id} type="button" data-set-variant={id} aria-pressed={id === variant} onClick={() => setVariant(id)}>
            {id}
          </button>
        ))}
      </div>
      <div data-switch-wrapper="" {...regionVariantAttrs(variant)}>
        {children}
      </div>
    </div>
  );
}

function withHtmlCleared<T>(run: () => Promise<T>): Promise<T> {
  const html = document.documentElement;
  const before = html.getAttribute(REGION_VARIANT_ATTR);
  html.removeAttribute(REGION_VARIANT_ATTR);
  return run().finally(() => {
    if (before === null) html.removeAttribute(REGION_VARIANT_ATTR);
    else html.setAttribute(REGION_VARIANT_ATTR, before);
  });
}

export const SwitchOnAncestor: Story = {
  name: "switching a nearer ancestor re-paints live (the region bails out of the re-render)",
  render: () => (
    <AncestorSwitch>
      <Bench />
    </AncestorSwitch>
  ),
  play: async ({ canvasElement }) =>
    withHtmlCleared(async () => {
      const wrapper = required<HTMLElement>(canvasElement, "[data-switch-wrapper]", "the switch wrapper");
      await expectSwitchedTo(wrapper, "v1");
      for (const variant of ["v4", "v2", "v5", "v3", "v1"] as const) {
        required<HTMLButtonElement>(canvasElement, `[data-set-variant="${variant}"]`, `the ${variant} button`).click();
        await waitFor(() => expect(wrapper.getAttribute(REGION_VARIANT_ATTR)).toBe(variant));
        await expectSwitchedTo(wrapper, variant);
      }
    }),
};

export const SwitchOnAncestorDom: Story = {
  name: "writing a nearer ancestor's attribute directly re-paints live",
  render: () => (
    <div data-switch-wrapper="" {...regionVariantAttrs("v1")}>
      <Bench />
    </div>
  ),
  play: async ({ canvasElement }) =>
    withHtmlCleared(async () => {
      const wrapper = required<HTMLElement>(canvasElement, "[data-switch-wrapper]", "the switch wrapper");
      await expectSwitchedTo(wrapper, "v1");
      for (const variant of ["v3", "v5", "v4"] as const) {
        wrapper.setAttribute(REGION_VARIANT_ATTR, variant);
        await expectSwitchedTo(wrapper, variant);
      }
      // Removing the nearer choice falls back to <html>'s (cleared) → v1.
      wrapper.removeAttribute(REGION_VARIANT_ATTR);
      await expectSwitchedTo(wrapper, DEFAULT_REGION_VARIANT);
    }),
};

/**
 * Runs `switchIt` at the start of a frame, then measures THAT frame in a
 * ResizeObserver callback — the browser runs those after style and layout
 * and before paint, so whatever `measure` sees is what this frame puts on
 * screen. Microtasks queued by the switch (React's sync work, the
 * MutationObserver) have all run by then; a render deferred to a later
 * TASK has not — which is exactly the one-frame half-switch this catches.
 */
function measureTheFrameOf(host: Element, switchIt: () => void, measure: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        switchIt();
      } catch (error) {
        reject(error);
        return;
      }
      const probe = document.createElement("div");
      host.appendChild(probe);
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        try {
          measure();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          probe.remove();
        }
      });
      observer.observe(probe);
    });
  });
}

/** The same-frame claim: the TS side (resolved stamp, header height) and
 *  the CSS side (the variant's paint) agree in the frame the switch lands. */
function expectConsistentNow(root: ParentNode, variant: RegionVariantId): void {
  expectResolvedVariant(root, variant);
  expectArmHeaderHeights(regionOf(root, "br"), variant);
  expectArmHeaderHeights(regionOf(root, "inner"), variant);
  expectVariantPaint(root, variant);
}

export const SwitchNeverHalfPainted: Story = {
  name: "no switch path ever paints a half-switched frame",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section data-path="html">
        <Bench />
      </section>
      <section data-path="react">
        <AncestorSwitch>
          <Bench />
        </AncestorSwitch>
      </section>
      <section data-path="dom">
        <div data-switch-wrapper="" {...regionVariantAttrs("v1")}>
          <Bench />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) =>
    withHtmlCleared(async () => {
      const html = document.documentElement;
      const htmlPath = required<HTMLElement>(canvasElement, '[data-path="html"]', "the html path");
      const reactPath = required<HTMLElement>(canvasElement, '[data-path="react"] [data-switch-wrapper]', "the react path");
      const domPath = required<HTMLElement>(canvasElement, '[data-path="dom"] [data-switch-wrapper]', "the dom path");
      for (const root of [htmlPath, reactPath, domPath]) await expectSwitchedTo(root, "v1");

      for (const variant of ["v4", "v2", "v1"] as const) {
        await measureTheFrameOf(
          canvasElement,
          () => {
            if (variant === DEFAULT_REGION_VARIANT) html.removeAttribute(REGION_VARIANT_ATTR);
            else html.setAttribute(REGION_VARIANT_ATTR, variant);
          },
          () => expectConsistentNow(htmlPath, variant),
        );
        await measureTheFrameOf(
          canvasElement,
          () => required<HTMLButtonElement>(canvasElement, `[data-path="react"] [data-set-variant="${variant}"]`, `the ${variant} button`).click(),
          () => expectConsistentNow(reactPath, variant),
        );
        await measureTheFrameOf(
          canvasElement,
          () => domPath.setAttribute(REGION_VARIANT_ATTR, variant),
          () => expectConsistentNow(domPath, variant),
        );
      }
    }),
};

/* ------------------------------------------------------------------ */
/* The fold still works in every variant                                */
/* ------------------------------------------------------------------ */

export const FoldInEveryVariant: Story = {
  name: "the chevron folds an arm in every variant",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {REGION_VARIANT_IDS.map((variant) => (
        <div key={variant} data-gallery-variant={variant} {...regionVariantAttrs(variant)}>
          <Bench />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const variant of REGION_VARIANT_IDS) {
      const section = required<HTMLElement>(canvasElement, `[data-gallery-variant="${variant}"]`, `the ${variant} row`);
      await waitFor(() => expectOwnArmsStacked(regionOf(section, "br"), ["if", "else"]));
      const elseRowBefore = required<HTMLElement>(section, '[data-arm-id="else"]', "the else row").getBoundingClientRect().top;
      required<HTMLElement>(section, '[data-arm-id="if"] > [data-slot="region-arm-header"] [data-slot="folding-chevron"]', `${variant}: the if chevron`).click();
      await waitFor(() => {
        expect(required<HTMLElement>(section, '[data-arm-id="if"]', "if").getAttribute("data-open")).toBe("false");
      });
      // Folding `if` removes its body, so `else` rises by that body — the
      // whole 360px arm minus nothing, measured rather than assumed.
      const elseRowAfter = required<HTMLElement>(section, '[data-arm-id="else"]', "the else row").getBoundingClientRect().top;
      expect(elseRowBefore - elseRowAfter, `${variant}: folding if lifts else`).toBeGreaterThan(300);
      // And the folded header is still exactly the variant's height.
      expectArmHeaderHeights(regionOf(section, "br"), variant);
    }
  },
};

/* ------------------------------------------------------------------ */
/* The two junctions are square — in all five drawings                  */
/* ------------------------------------------------------------------ */

/**
 * The corner card's four radii, off the browser rather than off our own
 * constant — a rule that never reached the paint would still pass a
 * presence check.
 */
function cornerRadiiOf(region: HTMLElement, id: string): { tl: string; tr: string; br: string; bl: string } {
  const style = getComputedStyle(cornerCardOf(region, id));
  return {
    tl: style.borderTopLeftRadius,
    tr: style.borderTopRightRadius,
    br: style.borderBottomRightRadius,
    bl: style.borderBottomLeftRadius,
  };
}

/**
 * Zach's 2026-09-19 ruling, as a measurement: where the corner card's own
 * edges CONTINUE the frame's border, the join is straight.
 *
 * The card's top edge becomes the frame's top rule (so its top-RIGHT is a
 * junction) and its left edge becomes the frame's left rule (so its
 * bottom-LEFT is one). A radius at either retracts the card's edge from the
 * frame's line and kinks the border — "I don't like how the edges where it
 * meets the region are still curve. they shuld be straight!"
 *
 * WHY the other two corners are asserted ROUND rather than left unmeasured:
 * "square the corners" is the over-correction sitting right next to the
 * right answer, and the For Loop he called done properly
 * (`Pasted image 20260919115424.png`) rounds both — the top-left because it
 * IS the frame's own corner (card and frame curve together, no junction),
 * the bottom-right because it touches no frame edge. Asserting them round
 * is what makes this case fail on the over-correction too, not only on the
 * regression.
 *
 * Not a variant axis (`regionVariants.ts`'s "what every variant keeps"), so
 * it sweeps all five through the live attribute switch — the same path an
 * app's dropdown takes.
 */
export const CornerMeetsFrameSquare: Story = {
  name: "the corner card's junctions with the frame are square (all five)",
  render: () => <Bench />,
  play: async ({ canvasElement }) => {
    const html = document.documentElement;
    const before = html.getAttribute(REGION_VARIANT_ATTR);
    try {
      for (const variant of REGION_VARIANT_IDS) {
        html.setAttribute(REGION_VARIANT_ATTR, variant);
        const spec = REGION_VARIANTS[variant];
        await waitFor(() => {
          for (const id of REGIONS_ON_THE_BOARD) {
            const region = regionOf(canvasElement, id);
            const radii = cornerRadiiOf(region, id);
            const shared = getComputedStyle(frameOf(region)).borderTopLeftRadius;

            // The two junctions: straight, exactly. Unconditional — this is
            // the 2026-09-19 rule itself and no drawing may opt out of it.
            expect(radii.tr, `${variant}/${id}: the card's top edge must leave the frame's top rule straight`).toBe("0px");
            expect(radii.bl, `${variant}/${id}: the card's left edge must leave the frame's left rule straight`).toBe("0px");

            // The shared corner curves WITH the frame — whatever the frame
            // does, including nothing.
            expect(radii.tl, `${variant}/${id}: the shared top-left follows the frame`).toBe(shared);

            // …and the frame really does what its SPEC says. This was
            // `not.toBe("0px")` for every variant, which was true of the eight
            // that existed and is a lie about `v10`, whose whole drawing is a
            // plain square rectangle (Zach's 2026-09-20 sketch). Reading
            // `frame.radius` makes the check stricter, not looser: a round
            // drawing must still be round, a square one must actually BE
            // square, and `regionVariants.ts`'s number — until now unverified
            // prose — is now pinned to the CSS that paints it.
            const square = spec.frame.radius === "0px";
            if (square) expect(shared, `${variant}: this drawing declares square corners`).toBe("0px");
            else expect(shared, `${variant}: the frame's own top-left is still round`).not.toBe("0px");

            // The one free corner: the variant's own call, declared rather
            // than named. `v2` and `v10` square it so a full-width header rule
            // leaves the card cleanly; the rest keep the frame's radius —
            // including `v9`, which is ruled and rounded, because that is what
            // `…20260920004250.png` draws.
            expect(radii.br, `${variant}/${id}: the free bottom-right corner`).toBe(
              spec.corner.freeCorner === "square" ? "0px" : shared,
            );
          }

          // Scoped to the CORNER card: an ordinary Block on the same board —
          // the opaque region's card — keeps all four of its own corners, so
          // this rule can never be mistaken for "Blocks are square now".
          const opaque = required<HTMLElement>(canvasElement, '[data-region-id="op"] [data-block-id="op"] [data-slot="block"]', "the opaque card");
          const card = getComputedStyle(opaque);
          for (const [corner, value] of Object.entries({
            tl: card.borderTopLeftRadius,
            tr: card.borderTopRightRadius,
            br: card.borderBottomRightRadius,
            bl: card.borderBottomLeftRadius,
          })) {
            expect(value, `${variant}: a free-standing card keeps its ${corner} radius`).not.toBe("0px");
          }
        });
      }
    } finally {
      if (before === null) html.removeAttribute(REGION_VARIANT_ATTR);
      else html.setAttribute(REGION_VARIANT_ATTR, before);
    }
  },
};
