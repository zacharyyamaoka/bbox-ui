import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { DEFAULT_GLYPH_FAMILIES, swatchGlyph, type GlyphFamilies } from "./controlGlyphs";

/**
 * src/components/controlGlyphs.stories.tsx — every drawn preview in
 * `DEFAULT_GLYPH_FAMILIES`, each family on its own row, one cell per value.
 *
 * WHY a story for a file that exports no component: a `GlyphRenderer` is
 * `(value) => ReactNode` — the table's ENTRIES are the renderable surface,
 * and they need no host to draw (that is the whole point of the port:
 * "already editor-free except swatch"). `ControlStrip.stories.tsx` shows
 * them doing their job inside real trigger/popover chrome, which is the
 * right place for the wiring but the wrong place to SEE the drawings: only
 * a handful of families ever appear there, each at whatever value the demo
 * registry happens to select. This page is the contact sheet.
 *
 * `swatch` is not in the table by design — it is the one editor-coupled
 * family, injected as `swatchGlyph(hexFor)` — so the last story below is
 * the host-merge shape the port's own header prescribes
 * (`{ ...DEFAULT_GLYPH_FAMILIES, swatch: swatchGlyph(...) }`).
 */

/**
 * Demo values per family — a HOST's vocabulary, not the module's, which is
 * exactly why they live here: `GlyphFamilies` is keyed by an open string
 * and every renderer takes a raw `string | undefined`, so the kit itself
 * never enumerates a family's values. (The `undefined` cell in each row is
 * the "no value / mixed selection" case a real control strip hits whenever
 * two selected shapes disagree.)
 */
const DEMO_VALUES: Record<string, (string | undefined)[]> = {
  fill: ["none", "semi", "solid", "pattern", "lined-fill"],
  dash: ["solid", "dashed", "dotted", "async", "draw", "none"],
  size: ["s", "m", "l", "xl"],
  strokeWidth: ["thin", "medium", "thick"],
  font: ["sans", "serif", "mono", "draw"],
  align: ["start", "middle", "end"],
  verticalAlign: ["start", "middle", "end"],
  routing: ["straight", "elbow", "curved"],
  arrowheadStart: ["none", "arrow", "triangle", "inverted", "square", "dot", "diamond", "bar"],
  arrowheadEnd: ["none", "arrow", "triangle", "inverted", "square", "dot", "diamond", "bar"],
};

function Cell({ testId, label, children }: { testId: string; label: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 52 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 6,
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
      <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{label}</span>
    </div>
  );
}

function FamilyRow({ family, families }: { family: string; families: GlyphFamilies }) {
  const render = families[family];
  const values = DEMO_VALUES[family] ?? [undefined];
  return (
    <div data-testid={`family-${family}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600 }}>{family}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[...values, undefined].map((value, index) => (
          <Cell key={`${family}-${index}`} testId={`cell-${family}-${value ?? "undefined"}`} label={value ?? "undefined"}>
            {render(value)}
          </Cell>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Basics/ControlGlyphs",
  tags: ["area:basics", "lane:floating-toolbars-2026-09-20"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every family in the shipped table, drawn across its own values. The row
 * list is `Object.keys(DEFAULT_GLYPH_FAMILIES)`, so a family a host adds to
 * the kit shows up here without this file being touched — and one that
 * disappears fails the play function rather than silently vanishing from
 * the page.
 */
export const AllFamilies: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {Object.keys(DEFAULT_GLYPH_FAMILIES).map((family) => (
        <FamilyRow key={family} family={family} families={DEFAULT_GLYPH_FAMILIES} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const families = Object.keys(DEFAULT_GLYPH_FAMILIES);

    // The table is the oracle for what must be on the page, including the
    // two families the port deliberately SPLIT in two so each can close
    // over its own `atStart` (change 3 in controlGlyphs.tsx's header).
    await expect(families).toContain("arrowheadStart");
    await expect(families).toContain("arrowheadEnd");
    // …and the two it deliberately leaves out: `swatch` needs a host
    // resolver, `geo` needs canvas-engine icon data.
    await expect(families).not.toContain("swatch");
    await expect(families).not.toContain("geo");

    for (const family of families) {
      const row = canvas.getByTestId(`family-${family}`);
      const cells = row.querySelectorAll(`[data-testid^="cell-${family}-"]`);
      // Every declared value plus the trailing `undefined` cell.
      await expect(cells).toHaveLength((DEMO_VALUES[family]?.length ?? 1) + 1);
      for (const cell of cells) {
        // A renderer that returned nothing would leave an empty box — every
        // family must draw something even for a value it does not know,
        // which is what the `undefined` cell is there to prove.
        await expect(cell.querySelector("svg, span.bbox-control-glyph-font")).not.toBeNull();
      }
    }
  },
};

/**
 * The two families whose drawing is a QUANTITY, not a shape: `size` and
 * `strokeWidth` both draw a bar whose height IS the value. Their own tables
 * are private to the module, so the assertion is the invariant rather than
 * the numbers — each rung strictly taller than the one before it, which is
 * the only thing a reader of the glyph can actually read off it.
 */
export const MonotonicRungs: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FamilyRow family="size" families={DEFAULT_GLYPH_FAMILIES} />
      <FamilyRow family="strokeWidth" families={DEFAULT_GLYPH_FAMILIES} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    function barHeights(family: string): number[] {
      const row = within(canvas.getByTestId(`family-${family}`));
      return (DEMO_VALUES[family] ?? []).map((value) => {
        const rect = row.getByTestId(`cell-${family}-${value}`).querySelector("rect");
        if (!rect) throw new Error(`expected a drawn bar for ${family}=${value}`);
        return Number(rect.getAttribute("height"));
      });
    }

    for (const family of ["size", "strokeWidth"]) {
      const heights = barHeights(family);
      await expect(heights.length).toBeGreaterThan(1);
      for (const height of heights) await expect(height).toBeGreaterThan(0);
      for (let i = 1; i < heights.length; i += 1) {
        // Strictly increasing: a rung drawn at or below its predecessor is
        // unreadable as a rung, whatever the underlying px table says.
        await expect(heights[i]).toBeGreaterThan(heights[i - 1]);
      }
    }
  },
};

/** A tiny host palette — the `hexFor` resolver `swatchGlyph` closes over. */
const DEMO_PALETTE: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
};

/**
 * The host-merge shape: `swatch` is injected, not baked in, so the kit
 * imports no theme and the host keeps its own palette. `mixed` below is a
 * name the resolver cannot resolve — the donor's own empty `data-mixed`
 * swatch, which is what a multi-selection with disagreeing colours draws.
 */
export const InjectedSwatchFamily: Story = {
  render: () => {
    const families: GlyphFamilies = {
      ...DEFAULT_GLYPH_FAMILIES,
      swatch: swatchGlyph((name) => DEMO_PALETTE[name]),
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div data-testid="family-swatch" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>swatch (host-injected)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {["red", "blue", "green", "mixed", undefined].map((value, index) => (
              <Cell key={index} testId={`cell-swatch-${value ?? "undefined"}`} label={value ?? "undefined"}>
                {families.swatch(value)}
              </Cell>
            ))}
          </div>
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = within(canvas.getByTestId("family-swatch"));

    // Merging must not mutate the shipped table — a host that spreads it
    // and a host that does not have to see the same `DEFAULT_GLYPH_FAMILIES`.
    await expect(Object.keys(DEFAULT_GLYPH_FAMILIES)).not.toContain("swatch");

    function swatchIn(label: string): HTMLElement {
      const cell = row.getByTestId(`cell-swatch-${label}`);
      const swatch = cell.querySelector(".bbox-control-glyph-swatch");
      if (!(swatch instanceof HTMLElement)) throw new Error(`expected a swatch for ${label}`);
      return swatch;
    }

    // A resolved name paints the host's own hex…
    for (const name of ["red", "blue", "green"]) {
      const swatch = swatchIn(name);
      await expect(swatch.getAttribute("data-mixed")).toBeNull();
      await expect(getComputedStyle(swatch).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    }
    // …and three different names paint three different colours, so the
    // resolver is genuinely being consulted per value.
    const painted = new Set(
      ["red", "blue", "green"].map((name) => getComputedStyle(swatchIn(name)).backgroundColor),
    );
    await expect(painted.size).toBe(3);

    // An unresolvable name, and no value at all, both draw the empty
    // `data-mixed` swatch rather than an arbitrary colour.
    for (const label of ["mixed", "undefined"]) {
      const swatch = swatchIn(label);
      await expect(swatch.getAttribute("data-mixed")).toBe("true");
      await expect(swatch.style.background).toBe("");
    }
  },
};
