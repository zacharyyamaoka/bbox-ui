import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import { LabeledPort } from "../components/labeledPort";
import { PORT_TEXT_SIZES } from "../components/port.layout";
import type { PortEdgeItem } from "../components/portEdge";
import {
  DEFAULT_PORT_VARIANT_ID,
  PORT_VARIANTS,
  PORT_VARIANT_ATTR,
  PORT_VARIANT_IDS,
  portVariantRingOverhangPx,
  readPortVariantId,
  type PortVariantId,
} from "../skin/portVariants";

/**
 * ACCEPTANCE for lane `ports` (docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-
 * FEEDBACK.md, "PROPOSALS — Lane ports"). Committed BEFORE the
 * implementation and never weakened afterwards; the auditor diffs this
 * commit. Everything here is MEASURED (`getBoundingClientRect`,
 * `getComputedStyle`) — DOM presence alone proves nothing.
 *
 * Zach, 2026-09-19: "the ports look way too big right now and the port text
 * size also seems too big … I want the port text to be 'small' by default …
 * I only want to see proposals that explore circular ports … proposals
 * where the ports are on the edge, not where they are inset."
 *
 * The contract every variant must satisfy, per story:
 *   1. the dot is a CIRCLE — its box is square and its radius ≥ half of it;
 *   2. the dot's box diameter is the variant's own `dot.diameter`;
 *   3. the dot's centre sits ON the block wall, within ±1px of the wall's x
 *      (half outside — never inset, never clipped);
 *   4. the label's computed font-size is the variant's `text` rung;
 *   5. the type run (secondary) is the variant's `type.size` rung;
 *   6. `producers: 3` renders exactly one count circle, riding that dot.
 * Plus, once for the set: the DEFAULT (no attribute, no prop) is `v1`,
 * `v1.text` is `xs`, and `xs` is ≈12–13px — the one ruling Zach gave
 * outright. And the `<html data-bbox-port-variant>` switch is LIVE: flipping
 * the attribute re-measures to the new variant with no remount.
 */

/* ------------------------------------------------------------------ */
/* Fixture — one port-view block, three ports a side, one with fan-in   */
/* ------------------------------------------------------------------ */

const LEFT: PortEdgeItem[] = [
  { id: "pose", label: "pose", type: "Pose", state: "wired", producers: 3 },
  { id: "gain", label: "gain", type: "float", state: "valueSet" },
  { id: "reset", label: "reset", type: "bool", state: "empty" },
];

const RIGHT: PortEdgeItem[] = [
  { id: "cmd", label: "cmd", type: "Twist", state: "wired" },
  { id: "status", label: "status", type: "str", state: "empty" },
  { id: "done", label: "done", type: "bool", state: "received" },
];

const BLOCK_W = 240;
const BLOCK_H = 150;

/** The SAME fixture for every variant — only `variant` changes. */
function Fixture({ variant, caption }: { variant?: PortVariantId; caption?: string }) {
  return (
    <div data-slot="port-variant-fixture" data-variant={variant ?? "auto"} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "28px 56px" }}>
      {caption ? <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: BLOCK_W + 80 }}>{caption}</span> : null}
      <BlockPort id={`estimate-${variant ?? "auto"}`} view="port" variant={variant} edges={{ left: { items: LEFT }, right: { items: RIGHT } }}>
        <Block header="estimate()" body={null} width={BLOCK_W} height={BLOCK_H} />
      </BlockPort>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`expected ${what} (${selector})`);
  return el;
}

function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function radiusPx(el: Element): number {
  // Tailwind v4's `rounded-full` computes to a huge px value; a plain 50%
  // computes to "50%". Either way a circle's radius is at least half its box.
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const w = el.getBoundingClientRect().width;
  if (raw.endsWith("%")) return (parseFloat(raw) / 100) * w;
  return parseFloat(raw);
}

/**
 * The per-variant contract, measured on one rendered fixture. `fixture` is
 * the `[data-slot="port-variant-fixture"]` wrapper; `id` is the variant it
 * is expected to be rendering.
 */
async function expectVariantContract(fixture: HTMLElement, id: PortVariantId): Promise<void> {
  const variant = PORT_VARIANTS[id];
  const block = required<HTMLElement>(fixture, '[data-slot="block"]', "the Block").getBoundingClientRect();

  // Every rendered port root is stamped with the variant in force.
  const roots = Array.from(fixture.querySelectorAll<HTMLElement>('[data-slot="port"]'));
  await expect(roots.length).toBe(LEFT.length + RIGHT.length);
  for (const root of roots) await expect(root.getAttribute(PORT_VARIANT_ATTR)).toBe(id);

  for (const side of ["left", "right"] as const) {
    const rail = required<HTMLElement>(fixture, `[data-slot="block-port-rail"][data-edge="${side}"]`, `the ${side} rail`);
    const dots = Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
    await expect(dots.length).toBe(3);
    const wallX = side === "left" ? block.left : block.right;
    for (const dot of dots) {
      const rect = dot.getBoundingClientRect();
      // 1. circular: square box, radius ≥ half the box.
      await expect(Math.abs(rect.width - rect.height)).toBeLessThanOrEqual(0.5);
      await expect(radiusPx(dot)).toBeGreaterThanOrEqual(rect.width / 2 - 0.5);
      // 2. the variant's own diameter.
      await expect(rect.width).toBeCloseTo(variant.dot.diameter, 0);
      // 3. ON the wall — centre within ±1px of the wall's x. Half outside.
      await expect(Math.abs(centre(dot).x - wallX)).toBeLessThanOrEqual(1);
    }
  }

  // 4./5. text rungs — the LABEL is the variant's `text`, the TYPE run its
  // `type.size`, read back as computed font-size, not as a prop.
  const labels = Array.from(fixture.querySelectorAll<HTMLElement>('[data-slot="port-label-display"]'));
  await expect(labels.length).toBe(LEFT.length + RIGHT.length);
  for (const label of labels) await expect(getComputedStyle(label).fontSize).toBe(`${PORT_TEXT_SIZES[variant.text]}px`);
  const types = Array.from(fixture.querySelectorAll<HTMLElement>('[data-slot="port-label-type"]'));
  await expect(types.length).toBe(LEFT.length + RIGHT.length);
  for (const type of types) await expect(getComputedStyle(type).fontSize).toBe(`${PORT_TEXT_SIZES[variant.type.size]}px`);

  // 6. producers: exactly ONE count circle on the whole fixture, on `pose`,
  //    reading "3", circular, and riding the dot (its centre no further from
  //    the dot's centre than dot radius + ring overhang + its own radius).
  const badges = Array.from(fixture.querySelectorAll<HTMLElement>('[data-slot="port-producers"]'));
  await expect(badges.length).toBe(1);
  const badge = badges[0];
  await expect(badge.textContent?.trim()).toBe("3");
  await expect(badge.closest('[data-port-id="pose"]')).not.toBeNull();
  const badgeRect = badge.getBoundingClientRect();
  await expect(Math.abs(badgeRect.width - badgeRect.height)).toBeLessThanOrEqual(0.5);
  await expect(badgeRect.width).toBeCloseTo(variant.producers.diameter, 0);
  const poseDot = required<HTMLElement>(fixture, '[data-port-id="pose"] [data-slot="port-dot"]', "pose's dot");
  const poseC = centre(poseDot);
  const badgeC = centre(badge);
  const reach = variant.dot.diameter / 2 + portVariantRingOverhangPx(variant) + badgeRect.width / 2;
  await expect(Math.hypot(badgeC.x - poseC.x, badgeC.y - poseC.y)).toBeLessThanOrEqual(reach + 0.5);
}

function fixtureFor(canvasElement: HTMLElement, variant: PortVariantId | "auto"): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="port-variant-fixture"][data-variant="${variant}"]`, `the ${variant} fixture`);
}

function clearHtmlVariant(): void {
  document.documentElement.removeAttribute(PORT_VARIANT_ATTR);
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

const meta = {
  title: "Ports/PortVariants",
  tags: ["area:ports", "lane:prf-ports-2026-09-19"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The default — no attribute, no prop — is v1, and v1 is `xs`         */
/* ------------------------------------------------------------------ */

/**
 * Zach's one outright ruling: small text by default. With NOTHING set —
 * no `<html>` attribute, no `variant` prop — the resolved variant is `v1`,
 * `v1.text` is the new `xs` rung, and `xs` is ≈12–13px on screen.
 */
export const Default: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => {
    clearHtmlVariant();
    await expect(readPortVariantId()).toBe("v1");
    await expect(DEFAULT_PORT_VARIANT_ID).toBe("v1");
    await expect(PORT_VARIANTS.v1.text).toBe("xs");
    await expect(PORT_TEXT_SIZES.xs).toBeGreaterThanOrEqual(12);
    await expect(PORT_TEXT_SIZES.xs).toBeLessThanOrEqual(13);
    await waitFor(() => expectVariantContract(fixtureFor(canvasElement, "auto"), "v1"));
  },
};

/* ------------------------------------------------------------------ */
/* One story per variant, on the SAME fixture                          */
/* ------------------------------------------------------------------ */

function variantStory(id: PortVariantId): Story {
  return {
    render: () => <Fixture variant={id} caption={`${PORT_VARIANTS[id].title} — ${PORT_VARIANTS[id].basedOn}`} />,
    play: async ({ canvasElement }) => {
      await waitFor(() => expectVariantContract(fixtureFor(canvasElement, id), id));
    },
  };
}

export const V1: Story = variantStory("v1");
export const V2: Story = variantStory("v2");
export const V3: Story = variantStory("v3");
export const V4: Story = variantStory("v4");
export const V5: Story = variantStory("v5");

/* ------------------------------------------------------------------ */
/* All five side by side — the report's capture                        */
/* ------------------------------------------------------------------ */

export const AllFive: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start" }}>
      {PORT_VARIANT_IDS.map((id) => (
        <Fixture key={id} variant={id} caption={`${id} · ${PORT_VARIANTS[id].title} — ${PORT_VARIANTS[id].basedOn}`} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(PORT_VARIANT_IDS).toEqual(["v1", "v2", "v3", "v4", "v5"]);
    for (const id of PORT_VARIANT_IDS) {
      await waitFor(() => expectVariantContract(fixtureFor(canvasElement, id), id));
    }
    // Five genuinely DISTINCT proposals: no two share the same dot geometry
    // AND the same text rung — a duplicate would be one proposal twice.
    const seen = new Set<string>();
    for (const id of PORT_VARIANT_IDS) {
      const v = PORT_VARIANTS[id];
      const key = `${v.dot.diameter}/${v.dot.gap}/${v.dot.ring}/${v.dot.fill}/${v.text}`;
      await expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  },
};

/* ------------------------------------------------------------------ */
/* The <html> attribute switch is live                                 */
/* ------------------------------------------------------------------ */

/**
 * The host contract (ASK doc, "Contracts"): the variant in force is read
 * from `document.documentElement.dataset.bboxPortVariant`, defaulting to
 * `v1`, so an app switch or a Storybook global is three lines. Flipping the
 * attribute at runtime re-measures to the new variant — no remount, no
 * prop — and clearing it returns to `v1`.
 */
export const HtmlAttributeSwitch: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => {
    clearHtmlVariant();
    const fixture = fixtureFor(canvasElement, "auto");
    try {
      await waitFor(() => expectVariantContract(fixture, "v1"));
      for (const id of ["v3", "v5", "v2"] as const) {
        document.documentElement.setAttribute(PORT_VARIANT_ATTR, id);
        await expect(readPortVariantId()).toBe(id);
        await waitFor(() => expectVariantContract(fixture, id));
      }
      // An unknown value is not a variant: it falls back to the default
      // rather than rendering nothing or throwing.
      document.documentElement.setAttribute(PORT_VARIANT_ATTR, "v99");
      await expect(readPortVariantId()).toBe("v1");
      await waitFor(() => expectVariantContract(fixture, "v1"));
    } finally {
      clearHtmlVariant();
    }
    await waitFor(() => expectVariantContract(fixture, "v1"));
  },
};

/**
 * The CSS mirror agrees with the TypeScript registry. `portVariants.css`
 * declares the same custom properties per `[data-bbox-port-variant]` so a
 * CSS-only consumer (the regions lane's frame inset, the app's own chrome)
 * follows the switch without touching React; this pins the two sources
 * together the way `skin.test.ts` pins skin.css to skin.ts.
 */
export const CssMirrorAgrees: Story = {
  render: () => <Fixture />,
  play: async () => {
    clearHtmlVariant();
    const rootStyle = () => getComputedStyle(document.documentElement);
    try {
      for (const id of PORT_VARIANT_IDS) {
        document.documentElement.setAttribute(PORT_VARIANT_ATTR, id);
        const v = PORT_VARIANTS[id];
        await waitFor(async () => {
          await expect(rootStyle().getPropertyValue("--bbox-port-dot-diameter").trim()).toBe(`${v.dot.diameter}px`);
          await expect(rootStyle().getPropertyValue("--bbox-port-dot-ring").trim()).toBe(`${v.dot.ring}px`);
          await expect(rootStyle().getPropertyValue("--bbox-port-dot-gap").trim()).toBe(`${v.dot.gap}px`);
          await expect(rootStyle().getPropertyValue("--bbox-port-label-size").trim()).toBe(`${PORT_TEXT_SIZES[v.text]}px`);
          await expect(rootStyle().getPropertyValue("--bbox-port-type-size").trim()).toBe(`${PORT_TEXT_SIZES[v.type.size]}px`);
          await expect(rootStyle().getPropertyValue("--bbox-port-producers-size").trim()).toBe(`${v.producers.diameter}px`);
        });
      }
    } finally {
      clearHtmlVariant();
    }
    // With the attribute gone, `:root` still carries v1 — the default is a
    // real declaration, not the absence of one.
    await waitFor(async () => {
      await expect(rootStyle().getPropertyValue("--bbox-port-dot-diameter").trim()).toBe(`${PORT_VARIANTS.v1.dot.diameter}px`);
      await expect(rootStyle().getPropertyValue("--bbox-port-label-size").trim()).toBe(`${PORT_TEXT_SIZES[PORT_VARIANTS.v1.text]}px`);
    });
  },
};

/* ------------------------------------------------------------------ */
/* v1's states — empty · wired · selected · hover · producers           */
/* ------------------------------------------------------------------ */

function StateSwatch({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div data-slot="state-swatch" data-caption={caption} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, width: 150 }}>
      <div style={{ display: "flex", alignItems: "center", height: 32, paddingLeft: 8 }}>{children}</div>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
    </div>
  );
}

/**
 * The state language every variant must define (hover / selected / wired),
 * shown on v1. `selected` is a prop (host-set, like `dimmed`); `wired` is the
 * value-axis state; hover is a real CSS `:hover` — a synthetic event cannot
 * flip it, so the hover assertion here reads the variable the rule consumes
 * (`--bbox-port-hover-scale`) off the dot, and the visual hover is captured
 * with a real Playwright pointer for the report (v1-hover.png).
 */
export const StatesV1: Story = {
  render: () => (
    <div data-slot="states-row" style={{ display: "flex", gap: 12, padding: "28px 40px" }}>
      <StateSwatch caption="empty">
        <LabeledPort variant="v1" type="float">gain</LabeledPort>
      </StateSwatch>
      <StateSwatch caption="wired">
        <LabeledPort variant="v1" state="wired" type="Pose">pose</LabeledPort>
      </StateSwatch>
      <StateSwatch caption="selected">
        <LabeledPort variant="v1" state="wired" selected type="Pose">pose</LabeledPort>
      </StateSwatch>
      <StateSwatch caption="hover (real pointer)">
        <LabeledPort variant="v1" state="empty" type="bool">reset</LabeledPort>
      </StateSwatch>
      <StateSwatch caption="producers = 3">
        <LabeledPort variant="v1" state="wired" producers={3} type="Pose">pose</LabeledPort>
      </StateSwatch>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const v1 = PORT_VARIANTS.v1;
    const dotIn = (caption: string) => required<HTMLElement>(canvasElement, `[data-slot="state-swatch"][data-caption="${caption}"] [data-slot="port-dot"]`, `${caption}'s dot`);

    const empty = dotIn("empty");
    const wired = dotIn("wired");
    const selected = dotIn("selected");
    const hover = dotIn("hover (real pointer)");
    const fanned = dotIn("producers = 3");

    // Every state is the same circle — states never change the geometry.
    for (const dot of [empty, wired, selected, hover, fanned]) {
      const rect = dot.getBoundingClientRect();
      await expect(rect.width).toBeCloseTo(v1.dot.diameter, 0);
      await expect(rect.height).toBeCloseTo(v1.dot.diameter, 0);
    }

    // wired ≠ empty: the ring colour the state cascade publishes differs.
    const ink = (dot: HTMLElement) => getComputedStyle(dot).getPropertyValue("--bbox-ink-state").trim();
    await expect(ink(empty)).not.toBe("");
    await expect(ink(wired)).not.toBe("");
    await expect(ink(wired)).not.toBe(ink(empty));

    // selected: a real outline of the variant's width, on the dot itself.
    await expect(selected.getAttribute("data-selected")).toBe("true");
    await expect(parseFloat(getComputedStyle(selected).outlineWidth)).toBeCloseTo(v1.selected.ring, 0);
    await expect(getComputedStyle(selected).outlineStyle).not.toBe("none");
    await expect(getComputedStyle(wired).outlineStyle).toBe("none");

    // hover: the rule reads this variable off the dot; the value is v1's.
    await expect(parseFloat(getComputedStyle(hover).getPropertyValue("--bbox-port-hover-scale"))).toBeCloseTo(v1.hover.scale, 2);
    await expect(v1.hover.scale).toBeGreaterThan(1);

    // producers: present here, absent on every other swatch.
    await expect(canvasElement.querySelectorAll('[data-slot="port-producers"]').length).toBe(1);
    await expect(fanned.parentElement?.querySelector('[data-slot="port-producers"]')?.textContent?.trim()).toBe("3");
  },
};
