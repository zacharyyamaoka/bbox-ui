import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import { ControlPanel } from "./controlPanel";
import { DEFAULT_GLYPH_FAMILIES, swatchGlyph, type GlyphFamilies } from "./controlGlyphs";
import { createControlRegistry, type ControlDefinition } from "./controlRegistry";

/**
 * `ControlPanel` (controlPanel.tsx), colocated — the popover BODY every
 * popover-bearing trigger opens, one renderer driven entirely by
 * `data-layout`, never by `control.kind`.
 *
 * WHY this file exists beside src/components/ControlStrip.stories.tsx, which
 * also renders it: that page is the STRIP's page — it opens real triggers
 * and galleries the five layouts side by side so their shapes can be
 * compared. This one is the panel's own rules, the ones a gallery cannot
 * show because they are relationships rather than pictures: the declared
 * `columns` beating the class list, `beside` vs `above` actually laying out
 * beside and above, the custom-colour cell appearing ONLY when the control
 * declares one, and the custom-px cell's revert-on-invalid contract. The
 * spatial ones are measured, not read off attributes.
 */

type PanelKind = "fill" | "fillMode" | "lineStyle" | "strokeWidth" | "fontSize";

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
  title: "Components/Menus & Bars/ControlPanel",
  tags: ["object:chrome"],
  component: ControlPanel,
  // WHY base `args`: `control`/`glyphs` have no sensible defaults, so CSF3's
  // typegen requires every story to satisfy them. Each story below builds
  // its own real `BoundControl` inside `render`; this fixture exists only to
  // make the required-args contract type-check — same device
  // src/components/ControlStrip.stories.tsx uses for the same reason.
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
