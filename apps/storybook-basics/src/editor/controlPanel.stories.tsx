import type { CSSProperties, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import { cn } from "../lib/utils";
import { ControlPanel } from "./controlPanel";
import { DEFAULT_GLYPH_FAMILIES, swatchGlyph, type GlyphFamilies } from "./controlGlyphs";
import { createControlRegistry, type ControlDefinition } from "./controlRegistry";
import { PILL_POPOVER } from "./floatingToolbar";

/**
 * `ControlPanel` (controlPanel.tsx), colocated — the popover BODY every
 * popover-bearing trigger opens, one renderer driven entirely by
 * `data-layout`, never by `control.kind`.
 *
 * WHY this file exists beside src/editor/ControlStrip.stories.tsx, which
 * also renders it: that page is the STRIP's page — it opens real triggers
 * and galleries the five layouts side by side so their shapes can be
 * compared. This one is the panel's own rules, the ones a gallery cannot
 * show because they are relationships rather than pictures: the declared
 * `columns` beating the class list, `beside` vs `above` actually laying out
 * beside and above, the custom-colour cell appearing ONLY when the control
 * declares one, and the custom-px cell's revert-on-invalid contract. The
 * spatial ones are measured, not read off attributes.
 */

type PanelKind = "fill" | "fillMode" | "lineStyle" | "strokeWidth" | "fontSize" | "shape";

/** The Shape picker's twenty names — the panel Zach photographed unreadable
    (`ReadableOnASkinnedSurface` below). Labels only, no glyph family: the
    contrast under test is the word's. */
const SHAPE_NAMES = [
  "rectangle", "ellipse", "triangle", "diamond", "pentagon",
  "hexagon", "octagon", "star", "rhombus", "rhombus-2",
  "oval", "trapezoid", "arrow-right", "arrow-left", "arrow-up",
  "arrow-down", "x-box", "check-box", "cloud", "heart",
] as const;

/** Ten swatches in five columns — two clean rows, so a column count is a
 *  thing a play function can actually count. */
const SWATCH_HEX: Record<string, string> = {
  c0: "#9ca3af",
  c1: "#ea580c",
  c2: "#f97316",
  c3: "#eab308",
  c4: "#22c55e",
  c5: "#14b8a6",
  c6: "#3b82f6",
  c7: "#8b5cf6",
  c8: "#ec4899",
  c9: "#ffffff",
};

const SWATCH_VALUES = Object.keys(SWATCH_HEX);
const SWATCH_COLUMNS = 5;

/** `s` is deliberately fractional: `formatPx`'s one rounding rule (the only
 *  thing that ported out of the donor's `formatFontPx`) rounds 17.25 to one
 *  decimal place and leaves whole numbers bare. */
const RUNG_PX: Readonly<Record<string, number>> = { s: 17.25, m: 24, l: 36, xl: 44 };

const definitions: Readonly<Record<PanelKind, ControlDefinition<PanelKind>>> = {
  fill: {
    kind: "fill",
    label: "Fill",
    trigger: "value",
    layout: "swatches",
    glyph: "swatch",
    columns: SWATCH_COLUMNS,
    custom: true,
    options: SWATCH_VALUES.map((value, index) => ({ value, label: `Color ${index + 1}` })),
  },
  fillMode: {
    kind: "fillMode",
    label: "Fill mode",
    trigger: "value",
    layout: "chips",
    glyph: "fill",
    options: [
      { value: "solid", label: "Solid" },
      { value: "pattern", label: "Hatched" },
      { value: "semi", label: "Transparent" },
      { value: "none", label: "No fill" },
    ],
  },
  lineStyle: {
    kind: "lineStyle",
    label: "Line style",
    trigger: "icon",
    layout: "row",
    glyph: "dash",
    options: [
      { value: "solid", label: "Solid" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" },
    ],
  },
  strokeWidth: {
    kind: "strokeWidth",
    label: "Stroke width",
    trigger: "icon",
    layout: "row",
    glyph: "strokeWidth",
    options: [
      { value: "thin", label: "Thin" },
      { value: "medium", label: "Medium" },
      { value: "thick", label: "Thick" },
    ],
  },
  fontSize: {
    kind: "fontSize",
    label: "Font size",
    trigger: "text",
    layout: "list",
    options: [
      { value: "s", label: "Small" },
      { value: "m", label: "Medium" },
      { value: "l", label: "Large" },
      { value: "xl", label: "Extra large" },
    ],
  },
  shape: {
    kind: "shape",
    label: "Shape",
    trigger: "value",
    layout: "library",
    options: SHAPE_NAMES.map((name) => ({ value: name, label: name })),
  },
};

const registry = createControlRegistry<PanelKind>(definitions);

/** `swatch` is the one editor-coupled family, injected rather than baked in
 *  (controlGlyphs.tsx change 2) — a host wires its own palette resolver. */
const glyphs: GlyphFamilies = {
  ...DEFAULT_GLYPH_FAMILIES,
  swatch: swatchGlyph((name) => SWATCH_HEX[name]),
};

/** The popover surface the panel is always drawn on — the panel itself has
 *  no chrome of its own, on purpose. */
function Surface({ children }: { children: ReactNode }) {
  return <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">{children}</div>;
}

const applyPx = fn();

const meta = {
  title: "Editor/Menus & Bars/ControlPanel",
  tags: ["object:chrome"],
  component: ControlPanel,
  // WHY base `args`: `control`/`glyphs` have no sensible defaults, so CSF3's
  // typegen requires every story to satisfy them. Each story below builds
  // its own real `BoundControl` inside `render`; this fixture exists only to
  // make the required-args contract type-check — same device
  // src/editor/ControlStrip.stories.tsx uses for the same reason.
  args: {
    control: registry.bindControl("lineStyle", {
      id: "meta-placeholder",
      value: { type: "shared", value: "solid" },
      onSelect: () => {},
    }),
    glyphs,
  },
} satisfies Meta<typeof ControlPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function requireEl<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${selector}`);
  return found;
}

function options(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
}

function checked(root: ParentNode): HTMLElement[] {
  return options(root).filter((option) => option.getAttribute("aria-checked") === "true");
}

/** The options group is the one `role="group"` that is NOT a stacked mode
 *  section — the sections all publish `data-mode-control`. */
function optionsGroup(panel: ParentNode): HTMLElement {
  return requireEl(panel, '[role="group"]:not([data-mode-control])');
}

/**
 * The `list` layout — a font-size menu. One row is current and says so with
 * a check mark ALONE (filling its background would put it back on the
 * popover's own ink where a check has already said "selected"), and the
 * per-option px column renders through `formatPx`: whole numbers bare, a
 * fractional rung to one decimal place.
 */
export const ListMarksExactlyOneRow: Story = {
  render: () => (
    <Surface>
      <ControlPanel
        control={registry.bindControl("fontSize", {
          id: "fontSize",
          value: { type: "shared", value: "l" },
          onSelect: () => {},
          rungPxByValue: RUNG_PX,
        })}
        glyphs={glyphs}
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const panel = requireEl(canvasElement, '[data-slot="control-panel"]');
    await expect(panel.getAttribute("data-layout")).toBe("list");
    await expect(panel.getAttribute("data-testid")).toBe("bbox-control-panel-fontSize");
    await expect(panel.getAttribute("role")).toBe("menu");
    await expect(panel.getAttribute("aria-label")).toBe("Font size");

    const all = options(panel);
    await expect(all).toHaveLength(4);
    const marked = checked(panel);
    await expect(marked).toHaveLength(1);
    await expect(marked[0].getAttribute("aria-label")).toBe("Large");
    await expect(marked[0].getAttribute("data-value")).toBe("l");

    // The check mark is the selection: visible on the current row, and
    // occupying its layout box (opacity, not display) on every other, so
    // the rows do not shuffle sideways as the selection moves.
    for (const option of all) {
      const mark = requireEl<SVGSVGElement>(option, "svg");
      const wanted = option === marked[0] ? "1" : "0";
      await expect(getComputedStyle(mark).opacity).toBe(wanted);
    }

    // `formatPx`: 17.25 → "17.3", 24 → "24" (not "24.0").
    await expect(requireEl(panel, '[data-testid="control-option-rung-px-s"]').textContent).toBe("17.3");
    await expect(requireEl(panel, '[data-testid="control-option-rung-px-m"]').textContent).toBe("24");
    await expect(requireEl(panel, '[data-testid="control-option-rung-px-xl"]').textContent).toBe("44");

    // No `customSize` binding was supplied, so there is no Custom cell —
    // the rule controlPanel.tsx calls load-bearing.
    await expect(panel.querySelector('[data-testid="control-custom-size-input"]')).toBeNull();
  },
};

/**
 * A multi-selection that disagrees. `{ type: "mixed" }` is a THIRD state,
 * not "no value": nothing is checked, because claiming one of them would be
 * telling the reader the selection agrees when it does not.
 *
 * Doubles as the `testIdPrefix` check — a host renaming the hook renames
 * every panel it owns.
 */
export const MixedValueChecksNothing: Story = {
  render: () => (
    <Surface>
      <ControlPanel
        control={registry.bindControl("fontSize", {
          id: "fontSize",
          value: { type: "mixed" },
          onSelect: () => {},
          rungPxByValue: RUNG_PX,
        })}
        glyphs={glyphs}
        testIdPrefix="demo"
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const panel = requireEl(canvasElement, '[data-slot="control-panel"]');
    await expect(panel.getAttribute("data-testid")).toBe("demo-control-panel-fontSize");

    const all = options(panel);
    await expect(all).toHaveLength(4);
    await expect(all.map((option) => option.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "false"]);
    for (const option of all) {
      await expect(getComputedStyle(requireEl<SVGSVGElement>(option, "svg")).opacity).toBe("0");
    }
  },
};

/**
 * `swatches`. The registry's declared `columns` is applied as an inline
 * `grid-template-columns` over a class list that says `grid-cols-10` — so
 * "did the declared value win?" is a question only measurement can answer,
 * and the play function answers it by counting the distinct x positions the
 * swatches actually landed on.
 */
export const SwatchGridUsesDeclaredColumns: Story = {
  render: () => (
    <Surface>
      <ControlPanel
        control={registry.bindControl("fill", {
          id: "fill",
          value: { type: "shared", value: "c3" },
          onSelect: () => {},
        })}
        glyphs={glyphs}
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const panel = requireEl(canvasElement, '[data-slot="control-panel"]');
    await expect(panel.getAttribute("data-layout")).toBe("swatches");

    const group = optionsGroup(panel);
    const tracks = getComputedStyle(group).gridTemplateColumns.split(/\s+/).filter(Boolean);
    await expect(tracks).toHaveLength(SWATCH_COLUMNS);

    // Measured, not read off the style: ten swatches land on five distinct
    // columns and two distinct rows.
    const boxes = options(panel).map((option) => option.getBoundingClientRect());
    await expect(boxes).toHaveLength(SWATCH_VALUES.length);
    const columns = new Set(boxes.map((box) => Math.round(box.left)));
    const rows = new Set(boxes.map((box) => Math.round(box.top)));
    await expect(columns.size).toBe(SWATCH_COLUMNS);
    await expect(rows.size).toBe(SWATCH_VALUES.length / SWATCH_COLUMNS);

    const marked = checked(panel);
    await expect(marked).toHaveLength(1);
    await expect(marked[0].getAttribute("aria-label")).toBe("Color 4");
  },
};

/**
 * The 22nd cell. `custom: true` is what puts a custom-colour cell in the
 * grid at all — the same guard the custom-px cell applies — and
 * `customColorSlot` is where a host's real picker lands. Absent a slot the
 * cell still draws the decorative wheel, so the layout reads correctly with
 * nothing wired up yet; a control that never declared `custom` gets no cell
 * and no dead affordance.
 */
export const CustomColorCellOnlyWhenDeclared: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <Surface>
        <ControlPanel
          control={registry.bindControl("fill", { id: "fill-default", value: { type: "shared", value: "c1" }, onSelect: () => {} })}
          glyphs={glyphs}
        />
      </Surface>
      <Surface>
        <ControlPanel
          control={registry.bindControl("fill", { id: "fill-slot", value: { type: "shared", value: "c1" }, onSelect: () => {} })}
          glyphs={glyphs}
          customColorSlot={
            <button type="button" className="size-6 rounded-full border border-dashed">
              Pick
            </button>
          }
        />
      </Surface>
      <Surface>
        <ControlPanel
          control={registry.bindControl("fillMode", { id: "fill-mode", value: { type: "shared", value: "solid" }, onSelect: () => {} })}
          glyphs={glyphs}
        />
      </Surface>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const withDefault = requireEl(canvasElement, '[data-testid="bbox-control-panel-fill-default"]');
    const withSlot = requireEl(canvasElement, '[data-testid="bbox-control-panel-fill-slot"]');
    const noCustom = requireEl(canvasElement, '[data-testid="bbox-control-panel-fill-mode"]');

    // Declared, no slot → the decorative wheel stands in.
    const placeholderCell = requireEl(withDefault, '[data-slot="control-custom-color"]');
    const wheel = requireEl(placeholderCell, "span");
    await expect(getComputedStyle(wheel).backgroundImage).toContain("conic-gradient");

    // Declared, slot supplied → the host's node, and the wheel is gone.
    const slotCell = requireEl(withSlot, '[data-slot="control-custom-color"]');
    await expect(slotCell.textContent).toBe("Pick");
    await expect(slotCell.querySelector("button")).not.toBeNull();

    // Never declared → no cell at all.
    await expect(noCustom.querySelector('[data-slot="control-custom-color"]')).toBeNull();
  },
};

/**
 * `above` vs `beside` — the one pair of states whose whole difference IS
 * geometry, so both are measured in screen space rather than read back off
 * `data-mode`.
 *
 * The second half of the rule is typographic and travels with the
 * placement: a `beside` section is icons only, a stacked one carries its
 * option names (`withLabel={!beside && section.layout !== "row"}`, ported
 * verbatim) — which is what lets one registered control render as labelled
 * chips above a swatch grid and as a bare icon row beside a line-style row.
 */
export const ModePlacedAboveVsBeside: Story = {
  render: () => {
    const fillMode = registry.bindControl("fillMode", {
      id: "fillMode",
      value: { type: "shared", value: "solid" },
      onSelect: () => {},
    });
    const strokeWidth = registry.bindControl("strokeWidth", {
      id: "strokeWidth",
      value: { type: "shared", value: "medium" },
      onSelect: () => {},
    });
    return (
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">modePlacement: above</span>
          <Surface>
            <ControlPanel
              control={registry.bindControl("fill", {
                id: "fill",
                value: { type: "shared", value: "c4" },
                onSelect: () => {},
                modeControl: fillMode,
                modePlacement: "above",
              })}
              glyphs={glyphs}
            />
          </Surface>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">modePlacement: beside</span>
          <Surface>
            <ControlPanel
              control={registry.bindControl("lineStyle", {
                id: "lineStyle",
                value: { type: "shared", value: "dashed" },
                onSelect: () => {},
                modeControl: strokeWidth,
                modePlacement: "beside",
              })}
              glyphs={glyphs}
            />
          </Surface>
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const above = requireEl(canvasElement, '[data-testid="bbox-control-panel-fill"]');
    const beside = requireEl(canvasElement, '[data-testid="bbox-control-panel-lineStyle"]');

    await expect(above.getAttribute("data-mode")).toBe("above");
    await expect(beside.getAttribute("data-mode")).toBe("beside");
    await expect(getComputedStyle(above).flexDirection).toBe("column");
    await expect(getComputedStyle(beside).flexDirection).toBe("row");

    // Stacked: the mode section ends before the options begin, vertically,
    // and the two share the same horizontal band.
    const aboveMode = requireEl(above, '[data-mode-control="fillMode"]').getBoundingClientRect();
    const aboveOptions = optionsGroup(above).getBoundingClientRect();
    await expect(aboveMode.bottom).toBeLessThanOrEqual(aboveOptions.top + 1);
    await expect(aboveMode.left).toBeLessThan(aboveOptions.right);
    await expect(aboveOptions.left).toBeLessThan(aboveMode.right);

    // Beside: the mode section ends before the options begin, horizontally,
    // and the two share the same vertical band.
    const besideMode = requireEl(beside, '[data-mode-control="strokeWidth"]').getBoundingClientRect();
    const besideOptions = optionsGroup(beside).getBoundingClientRect();
    await expect(besideMode.right).toBeLessThanOrEqual(besideOptions.left + 1);
    await expect(besideMode.top).toBeLessThan(besideOptions.bottom);
    await expect(besideOptions.top).toBeLessThan(besideMode.bottom);

    // Labels follow the placement, not the control.
    const stackedChip = requireEl(above, '[data-mode-control="fillMode"] [role="menuitemradio"]');
    await expect(stackedChip.textContent).toContain("Solid");
    for (const icon of Array.from(
      beside.querySelectorAll<HTMLElement>('[data-mode-control="strokeWidth"] [role="menuitemradio"]'),
    )) {
      await expect(icon.textContent).toBe("");
      await expect(icon.getAttribute("aria-label")).not.toBe("");
    }
  },
};

/**
 * The custom px cell. Three ported rules in one story: a custom scale means
 * NO preset row is truthfully current (`forceUnchecked`), Enter commits
 * through `applyPx`, and an input that does not parse REVERTS to the shared
 * value rather than writing a `NaN` size to the target.
 */
export const CustomSizeCommitsAndReverts: Story = {
  render: () => (
    <Surface>
      <ControlPanel
        control={registry.bindControl("fontSize", {
          id: "fontSize",
          value: { type: "shared", value: "m" },
          onSelect: () => {},
          rungPxByValue: RUNG_PX,
          customSize: { sharedPx: 30, onPresetRungs: false, applyPx, minPx: 8, maxPx: 200 },
        })}
        glyphs={glyphs}
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const panel = requireEl(canvasElement, '[data-slot="control-panel"]');
    const input = requireEl<HTMLInputElement>(panel, '[data-testid="control-custom-size-input"]');

    await expect(input).toHaveValue(30);
    await expect(input.getAttribute("min")).toBe("8");
    await expect(input.getAttribute("max")).toBe("200");

    // A custom scale is applied elsewhere on this target, so the presets are
    // all unchecked even though the bound value is still `m`.
    await expect(checked(panel)).toHaveLength(0);

    await userEvent.clear(input);
    await userEvent.type(input, "42{Enter}");
    await expect(applyPx).toHaveBeenCalledWith(42);

    // Unparseable input reverts to the shared reading on blur; it never
    // reaches `applyPx`.
    await userEvent.clear(input);
    await userEvent.tab();
    await waitFor(async () => {
      await expect(input).toHaveValue(30);
    });
    await expect(applyPx).toHaveBeenCalledTimes(1);
  },
};

// ---------------------------------------------------------------------------
// Readable on a skinned surface — the light/dark gate
// ---------------------------------------------------------------------------

/**
 * The theme's own token values, from `globals.css` — the light `:root` block
 * and the `prefers-color-scheme: dark` block — forced onto a wrapper as inline
 * custom properties.
 *
 * WHY force them rather than trust the runner's colour scheme: the bug this
 * gate exists for (controlPanel.tsx, change 4) shows in ONE scheme — a page
 * token resolved to its light value on a fixed dark panel — and a test that
 * happens to run in the other scheme passes while the panel is unreadable.
 * Pinning both blocks makes the gate say the same thing on every machine, and
 * it makes the tempting fix (a class that is right in dark and wrong in
 * light, or the reverse) fail in whichever half it breaks.
 */
const THEME_TOKENS: Record<"light" | "dark", CSSProperties> = {
  light: {
    "--foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.205 0 0)",
    "--primary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
  } as CSSProperties,
  dark: {
    "--foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.922 0 0)",
    "--primary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
  } as CSSProperties,
};

/** The surface the pill hangs every panel on — the host's `panelClassName`
    (`selectionClusters.tsx` passes exactly `PILL_POPOVER`). */
function PillSurface({ children }: { children: ReactNode }) {
  return <div className={cn("w-fit p-2.5", PILL_POPOVER)}>{children}</div>;
}

function SkinnedPanels({ scheme }: { scheme: "light" | "dark" }) {
  return (
    <div
      data-testid={`scheme-${scheme}`}
      data-scheme={scheme}
      style={THEME_TOKENS[scheme]}
      className="flex flex-col gap-3"
    >
      <span className="text-xs opacity-60">page tokens forced to: {scheme}</span>
      <div className="flex flex-wrap items-start gap-4">
        <PillSurface>
          <ControlPanel
            control={registry.bindControl("shape", {
              id: `${scheme}-shape`,
              value: { type: "shared", value: "rectangle" },
              onSelect: () => {},
            })}
            glyphs={glyphs}
          />
        </PillSurface>
        <PillSurface>
          <ControlPanel
            control={registry.bindControl("fontSize", {
              id: `${scheme}-fontSize`,
              value: { type: "shared", value: "l" },
              onSelect: () => {},
              rungPxByValue: RUNG_PX,
              customSize: { sharedPx: 36, onPresetRungs: true, applyPx: () => {}, minPx: 8, maxPx: 200 },
            })}
            glyphs={glyphs}
          />
        </PillSurface>
        <PillSurface>
          <ControlPanel
            control={registry.bindControl("fill", {
              id: `${scheme}-fill`,
              value: { type: "shared", value: "c4" },
              onSelect: () => {},
              modeControl: registry.bindControl("fillMode", {
                id: `${scheme}-fillMode`,
                value: { type: "shared", value: "semi" },
                onSelect: () => {},
              }),
              modePlacement: "above",
            })}
            glyphs={glyphs}
          />
        </PillSurface>
      </div>
    </div>
  );
}

// --- the story's own ruler: what the browser painted. Computed `rgb()`
// strings in, WCAG ratios out; nothing here reads a class name.

type Rgb = [number, number, number, number];

function rgbOf(css: string): Rgb {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  // `color-mix(...)` and `oklab(...)` come back unresolved from some
  // properties; a 1x1 canvas resolves anything the browser can paint.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

function over(top: Rgb, under: Rgb): Rgb {
  const a = top[3] + under[3] * (1 - top[3]);
  const ch = (i: number) => (a === 0 ? 0 : (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a);
  return [ch(0), ch(1), ch(2), a];
}

/** The colour actually behind an element: its ancestors' backgrounds,
    composited from the element outward until opaque. */
function backdropOf(el: Element): Rgb {
  let acc: Rgb = [0, 0, 0, 0];
  for (let node: Element | null = el; node && acc[3] < 0.999; node = node.parentElement) {
    const bg = rgbOf(getComputedStyle(node).backgroundColor);
    if (bg[3] > 0) acc = over(acc, bg);
  }
  return acc[3] < 0.999 ? over(acc, [255, 255, 255, 1]) : acc;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Ink of `el` against the colour behind it. A translucent ink is composited
    onto that backdrop first, the way the eye sees it. */
function inkContrast(el: Element): number {
  const backdrop = backdropOf(el);
  const ink = rgbOf(getComputedStyle(el).color);
  return ratio(ink[3] < 1 ? over(ink, backdrop) : ink, backdrop);
}

/**
 * The colour of the ring Tailwind draws on `el` — read off the computed
 * `box-shadow`, where the browser has already resolved it, never off
 * `--tw-ring-color`, which computes to the literal word `currentcolor` and
 * measured 1.26:1 against the panel when a canvas was asked to paint it. A
 * ring is the layer with a spread and no offset; the other layers (an unset
 * ring-offset, the popover's own drop shadow) have none or are transparent.
 */
function ringColourOf(el: Element): Rgb | null {
  const shadow = getComputedStyle(el).boxShadow;
  const layer = /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g;
  for (let m = layer.exec(shadow); m; m = layer.exec(shadow)) {
    const colour = rgbOf(m[1]);
    const [dx, dy, blur, spread] = [m[2], m[3], m[4], m[5]].map(Number);
    if (dx === 0 && dy === 0 && blur === 0 && spread > 0 && colour[3] > 0) return colour;
  }
  return null;
}

/** WCAG 1.4.3 AA for text. */
const TEXT_MIN = 4.5;
/** WCAG 1.4.11 for a graphical mark or a state indicator. */
const MARK_MIN = 3;

/**
 * What the browser would paint behind `el` on hover — from the REAL
 * stylesheet, resolved by the REAL engine, without a pointer.
 *
 * WHY not `userEvent.hover`: measured 2026-09-25, `storybook/test`'s pointer
 * is synthetic — it dispatches the events and never sets `:hover`, so the
 * hovered background read back byte-identical to idle and a "hover is a
 * wash" assertion had nothing to be false about. A story cannot reach CDP
 * (it also has to run inside Storybook proper), so instead: walk every rule
 * in every sheet, keep the `:hover` rules whose selector matches this
 * element once `:hover` is stripped, and hand the LAST matching declared
 * `background-color` to a probe that sits where the element sits, so
 * `currentcolor` and `color-mix()` resolve exactly as they would on it. The
 * real pointer is exercised by the Playwright run against the live app
 * (scratchpad `contrast.mjs`, label on hover 12.28:1), which this cannot
 * replace and does not claim to.
 */
function hoverBackgroundOf(el: HTMLElement): Rgb | null {
  let declared: string | null = null;
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) visit((rule as CSSGroupingRule).cssRules);
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(":hover")) continue;
      const bg = rule.style.getPropertyValue("background-color");
      if (!bg) continue;
      const withoutHover = rule.selectorText.replace(/:hover/g, "");
      try {
        if (el.matches(withoutHover)) declared = bg;
      } catch {
        // A selector this browser cannot parse once `:hover` is gone — not ours.
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A cross-origin sheet; nothing of ours lives there.
    }
  }
  if (declared === null) return null;
  const probe = document.createElement("span");
  probe.style.backgroundColor = declared;
  el.appendChild(probe);
  const resolved = rgbOf(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return resolved;
}

function labelOf(option: HTMLElement): HTMLElement {
  const label = Array.from(option.querySelectorAll<HTMLElement>("span")).find(
    (span) => !span.hasAttribute("aria-hidden") && (span.textContent ?? "").trim() !== "",
  );
  if (!label) throw new Error(`option ${option.dataset.value} has no label`);
  return label;
}

/**
 * The gate. Every panel the pill opens, on the pill's own surface, with the
 * page's tokens forced to LIGHT and then to DARK — and every kind of ink the
 * panel paints measured against what is actually behind it:
 *
 *   • every option label ≥ 4.5:1 (the Shape picker Zach photographed at
 *     1.19:1 in light mode);
 *   • the chosen row's check mark ≥ 4.5:1 (1.19:1 before);
 *   • the rung-px readout and the Custom cell's words ≥ 4.5:1;
 *   • the chosen chip is VISIBLE — its fill ≥ 3:1 against the panel — and
 *     its label ≥ 4.5:1 on that fill (before: `oklch(0.205)` on #1e1e1e,
 *     1.19:1, a chip you could not find);
 *   • hover is a wash on the panel, not a chip cut out of it: the hover
 *     rule's background < 3:1 against the panel, and the label still ≥ 4.5:1
 *     on it (before: `oklch(0.97)`, 18:1 — a white slab under the cursor).
 *     Read from the stylesheet and resolved by the browser, not by a
 *     pointer — see `hoverBackgroundOf` for why.
 *
 * Mutation-tested 2026-09-25: restoring `text-foreground` on the option
 * button fails the light half at 1.19:1 on every label; restoring
 * `hover:bg-muted` fails the hover wash; restoring `bg-primary` fails the
 * chosen chip's visibility. Each one is a single class put back.
 */
export const ReadableOnASkinnedSurface: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <SkinnedPanels scheme="light" />
      <SkinnedPanels scheme="dark" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // WHY findBy first (CLAUDE.md): every assertion below is comparative,
    // and comparisons against an unmounted DOM are vacuously true.
    await waitFor(() => {
      if (!canvasElement.querySelector('[data-testid="bbox-control-panel-light-shape"]')) throw new Error("not mounted");
    });

    for (const scheme of ["light", "dark"] as const) {
      const scope = requireEl(canvasElement, `[data-testid="scheme-${scheme}"]`);
      const shape = requireEl(scope, `[data-testid="bbox-control-panel-${scheme}-shape"]`);
      const fontSize = requireEl(scope, `[data-testid="bbox-control-panel-${scheme}-fontSize"]`);
      const fill = requireEl(scope, `[data-testid="bbox-control-panel-${scheme}-fill"]`);
      const tag = (what: string) => `${scheme}: ${what}`;

      // ---- labels, everywhere a panel writes a word ----------------------
      for (const panel of [shape, fontSize, fill]) {
        for (const option of options(panel)) {
          const label = option.querySelector("span:not([aria-hidden])");
          if (!label || (label.textContent ?? "").trim() === "") continue;
          await expect(
            inkContrast(label),
            tag(`label "${label.textContent}" on ${panel.dataset.layout}`),
          ).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      }
      // The Shape picker specifically — Zach's photograph.
      await expect(options(shape)).toHaveLength(SHAPE_NAMES.length);

      // ---- the check mark on the chosen list row ------------------------
      const [chosenRow] = checked(fontSize);
      const check = requireEl<SVGSVGElement>(chosenRow, "svg");
      await expect(getComputedStyle(check).opacity).toBe("1");
      await expect(inkContrast(check), tag("check mark")).toBeGreaterThanOrEqual(TEXT_MIN);

      // ---- secondary text: rung px, the Custom cell ---------------------
      for (const px of Array.from(fontSize.querySelectorAll('[data-testid^="control-option-rung-px-"]'))) {
        await expect(inkContrast(px), tag(`rung px "${px.textContent}"`)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
      const custom = requireEl(fontSize, '[data-testid="control-custom-size-input"]').closest("label")!;
      for (const word of Array.from(custom.querySelectorAll("span"))) {
        await expect(inkContrast(word), tag(`custom cell "${word.textContent}"`)).toBeGreaterThanOrEqual(TEXT_MIN);
      }

      // ---- the chosen chip: visible, and readable on itself ---------------
      const [chosenChip] = checked(requireEl(fill, '[data-mode-control]'));
      const chipFill = rgbOf(getComputedStyle(chosenChip).backgroundColor);
      const panelSurface = backdropOf(fill);
      await expect(chipFill[3], tag("the chosen chip is filled")).toBeGreaterThan(0);
      await expect(ratio(over(chipFill, panelSurface), panelSurface), tag("chosen chip against the panel")).toBeGreaterThanOrEqual(MARK_MIN);
      await expect(inkContrast(labelOf(chosenChip)), tag("chosen chip's label")).toBeGreaterThanOrEqual(TEXT_MIN);
      // The chosen swatch's ring is drawn in the ink, so it is visible too.
      const [chosenSwatch] = checked(optionsGroup(fill));
      const ring = ringColourOf(chosenSwatch);
      await expect(ring, tag("the chosen swatch has a ring")).not.toBeNull();
      await expect(ratio(over(ring!, panelSurface), panelSurface), tag("chosen swatch ring")).toBeGreaterThanOrEqual(MARK_MIN);

      // ---- hover: a wash, never a slab ---------------------------------
      const idle = options(shape).find((option) => option.getAttribute("aria-checked") !== "true")!;
      const hoverBg = hoverBackgroundOf(idle);
      await expect(hoverBg, tag("an idle option has a hover rule at all")).not.toBeNull();
      const hovered = over(hoverBg!, panelSurface);
      await expect(ratio(hovered, panelSurface), tag("hovered background against the panel")).toBeLessThan(MARK_MIN);
      // …and it is a change, not a no-op: the wash is visibly there.
      await expect(hoverBg![3], tag("the hover wash has some opacity")).toBeGreaterThan(0);
      const labelInk = rgbOf(getComputedStyle(labelOf(idle)).color);
      await expect(
        ratio(labelInk[3] < 1 ? over(labelInk, hovered) : labelInk, hovered),
        tag("label on the hovered background"),
      ).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  },
};
