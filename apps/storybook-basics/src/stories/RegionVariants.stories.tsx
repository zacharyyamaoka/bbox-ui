/**
 * Control Flow/Region Variants — five region DRAWINGS over one region
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
 *      and nested contrast) — each read back off computed style;
 *   6. across the gallery, the five drawings are pairwise DISTINCT on a
 *      measured signature, and the opaque card is byte-identical in all
 *      five (its paint is the host's `Block`, deliberately not a variant
 *      axis).
 *
 * The switch is `data-bbox-region-variant` on ANY ancestor — the contract
 * names `document.documentElement.dataset.bboxRegionVariant` for an app
 * (`SwitchLive` proves that path re-paints with no re-render), and a
 * wrapper element for a gallery (`AllFive`).
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { BRANCH_NESTED } from "../presets/branch/branch.fixtures";
import { REGION_NODE_TYPE } from "../scene/region";
import {
  DEFAULT_REGION_VARIANT,
  REGION_VARIANT_ATTR,
  REGION_VARIANT_IDS,
  REGION_VARIANTS,
  regionVariantAttrs,
  type RegionVariantId,
} from "../skin/regionVariants";
import { expectArmsStacked, expectCornerPorts, expectRegionExpanded, expectRegionOpaque } from "./controlFlow.acceptance";

const meta = {
  title: "Control Flow/Region Variants",
  tags: ["area:control-flow", "lane:regions"],
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

/** cf-C's `Nested` (`BRANCH_NESTED`, imported — never retyped) beside
 *  cf-A's loop and one opaque card. */
const FIXTURE: HostScene = {
  nodes: [...BRANCH_NESTED.nodes, ...LOOP_NODES, OPAQUE_NODE],
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
  const frame = frameOf(region).getBoundingClientRect();
  const dot = required<HTMLElement>(
    region,
    `[data-slot="region-corner"] [data-block-id="${id}"] [data-slot="block-port-rail"][data-edge="left"] [data-port-id="${portId}"] [data-slot="port-dot"]`,
    `${id}'s ${portId} dot`,
  );
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
  if (spec.corner.integration === "ruled") {
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
  if (spec.arms.header === "card" || spec.arms.header === "indent") {
    expect(decor, `${variant}: arm decor exists`).not.toBeNull();
    expect(getComputedStyle(decor!).display, `${variant}: arm decor is drawn`).not.toBe("none");
    const decorRect = decor!.getBoundingClientRect();
    const armRect = decor!.parentElement!.getBoundingClientRect();
    if (spec.arms.header === "card") {
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

/** The whole per-variant contract, items 1–5. */
async function expectRegionVariant(root: ParentNode, variant: RegionVariantId): Promise<void> {
  for (const id of REGIONS_ON_THE_BOARD) await expectRegionExpanded(root, id);
  await expectArmsStacked(root, "br", ["if", "else"]);
  await expectArmsStacked(root, "inner", ["inner-if", "inner-else"]);
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

/* ------------------------------------------------------------------ */
/* The gallery — all five, one fixture, side by side for the report     */
/* ------------------------------------------------------------------ */

export const AllFive: Story = {
  name: "all five on the same fixture",
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
    // Five genuinely different drawings: pairwise distinct signatures.
    for (const a of REGION_VARIANT_IDS) {
      for (const b of REGION_VARIANT_IDS) {
        if (a < b) expect(signatures.get(a), `${a} and ${b} are the same drawing`).not.toBe(signatures.get(b));
      }
    }
    // And ONE opaque card: the P5 card is the host's Block, not a variant axis.
    expect(Array.from(cards), "the opaque card reads the same in all five").toHaveLength(1);
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
      await expectArmsStacked(section, "br", ["if", "else"]);
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
