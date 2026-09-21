import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Copy } from "lucide-react";

import { ControlPanel } from "./controlPanel";
import { ControlStrip } from "./controlStrip";
import {
  createControlRegistry,
  type ControlDefinition,
} from "./controlRegistry";
import { DEFAULT_GLYPH_FAMILIES, swatchGlyph, type GlyphFamilies } from "./controlGlyphs";

/**
 * `ControlStrip`/`ControlPanel` (`controlStrip.tsx`/`controlPanel.tsx`) are
 * the one renderer for every registered control, ported from SystemSketch's
 * `ContextualControls.tsx` — MENU-KIT-DESIGN.md §3.3. Every story here binds
 * the SAME demo vocabulary (`demoRegistry`, exported below and reused by
 * `ControlLab.stories.tsx` — "if a lever composes in the lab it composes
 * here" only holds if both stories build against one registry) into real
 * `BoundControl`s and feeds them to the real components; nothing on this
 * page is a redraw of the screenshots, it is the components producing them.
 *
 * docs/menus/screenshots/01-floating-toolbar-fill-popover.png is `FillPopover`
 * below; docs/menus/screenshots/03-font-size-popover.png is `FontSizeList`.
 */

// ---------------------------------------------------------------------------
// Demo vocabulary — one small registry standing in for a host's real one.
// A real host's vocabulary is app data (design decision #1, "the registry
// becomes a factory"); this is Storybook's own app, same as the demo palette
// FillPopover in Popover.stories.tsx already used ad hoc.
// ---------------------------------------------------------------------------

export type DemoKind =
  | "fillMode"
  | "fill"
  | "strokeWidth"
  | "lineStyle"
  | "bold"
  | "align"
  | "fontSize"
  | "shapeLibrary"
  | "duplicate";

/** 21 real swatches + the 22nd (custom) cell — an 11-column, 2-row grid,
    the exact shape docs/menus/screenshots/01 draws (`columns` on the
    `fill` definition below). */
export const DEMO_SWATCH_HEX: Record<string, string> = {
  c0: "#9ca3af",
  c1: "#6b7280",
  c2: "#ea580c",
  c3: "#f97316",
  c4: "#eab308",
  c5: "#22c55e",
  c6: "#14b8a6",
  c7: "#3b82f6",
  c8: "#8b5cf6",
  c9: "#ec4899",
  c10: "#ffffff",
  c11: "#d4d4d8",
  c12: "#e4e4e7",
  c13: "#fca5a5",
  c14: "#fed7aa",
  c15: "#fef08a",
  c16: "#bbf7d0",
  c17: "#99f6e4",
  c18: "#bfdbfe",
  c19: "#ddd6fe",
  c20: "#fbcfe8",
};

export const FONT_SIZE_PX: Readonly<Record<string, number>> = { s: 18, m: 24, l: 36, xl: 44 };

/** Exported so `ControlLab.stories.tsx` can read each kind's registered
    default layout/trigger and option list when building its lever rows —
    `createControlRegistry`'s own return value deliberately does not expose
    the raw definitions (a host has no reason to read its own vocabulary
    back out through the registry it built it from), so the lab reads the
    source map directly instead. */
export const demoDefinitions: Readonly<Record<DemoKind, ControlDefinition<DemoKind>>> = {
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
  fill: {
    kind: "fill",
    label: "Fill",
    trigger: "value",
    layout: "swatches",
    glyph: "swatch",
    columns: 11,
    custom: true,
    options: Object.keys(DEMO_SWATCH_HEX).map((value, index) => ({ value, label: `Color ${index + 1}` })),
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
  bold: {
    // Trigger 'toggle' ignores `layout`/`options`/`glyph` entirely
    // (`controlStrip.tsx`'s `ToggleTrigger`) — this is the donor's one
    // toggle-trigger control, kept as `bold` on purpose: its label "Bold"
    // is what makes the letter-fallback reproduce the exact donor "B".
    kind: "bold",
    label: "Bold",
    trigger: "toggle",
    layout: "row",
    options: [],
  },
  align: {
    kind: "align",
    label: "Align",
    trigger: "icon",
    layout: "row",
    glyph: "align",
    options: [
      { value: "start", label: "Left" },
      { value: "middle", label: "Center" },
      { value: "end", label: "Right" },
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
  shapeLibrary: {
    kind: "shapeLibrary",
    label: "Insert shape",
    trigger: "icon",
    layout: "library",
    glyph: "routing",
    options: Array.from({ length: 12 }, (_, index) => ({ value: `shape${index}`, label: `Shape ${index + 1}` })),
  },
  duplicate: {
    kind: "duplicate",
    label: "Duplicate",
    trigger: "action",
    layout: "row",
    glyph: "duplicate",
    options: [],
  },
};

export const demoRegistry = createControlRegistry<DemoKind>(demoDefinitions);

/** `swatch` isn't in `DEFAULT_GLYPH_FAMILIES` (it's the one editor-coupled
    family, injected — `controlGlyphs.tsx`'s own header). `duplicate` is a
    demo-only family that exists nowhere in the kit at all — proving the
    "hosts extend by spreading" contract, not just exercising it. */
export const demoGlyphs: GlyphFamilies = {
  ...DEFAULT_GLYPH_FAMILIES,
  swatch: swatchGlyph((name) => DEMO_SWATCH_HEX[name]),
  duplicate: () => <Copy aria-hidden="true" className="size-4" />,
};

const meta = {
  title: "Basics/ControlStrip",
  component: ControlStrip,
  // WHY: this file exports the demo vocabulary (`demoRegistry`, `demoGlyphs`,
  // `demoDefinitions`, `DEMO_SWATCH_HEX`, `FONT_SIZE_PX`) so `ControlLab
  // .stories.tsx` can build against the SAME registry — the repo's usual
  // fix (a sibling `*.fixture.tsx`, see `elbowDirections.fixture.tsx`) isn't
  // available here, this lane's write set is exactly four files. Without
  // `excludeStories`, Storybook's CSF indexer treats every other named
  // export as a story and tries to render `demoRegistry` (a plain object)
  // as one.
  excludeStories: /^(demo|DEMO_|FONT_SIZE_PX$)/,
  // WHY base `args`: `ControlStrip` has no optional `composition`/`glyphs`
  // (there's no sensible default for either), so CSF3's typegen requires
  // every story to satisfy them. Every story below supplies its own real
  // composition via `render`'s closure instead of reading `args` — this
  // fixture only exists to make the required-args contract type-check; it
  // is never rendered.
  args: {
    composition: { id: "meta-placeholder", groups: [] },
    glyphs: DEFAULT_GLYPH_FAMILIES,
  },
} satisfies Meta<typeof ControlStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * docs/menus/screenshots/01-floating-toolbar-fill-popover.png. `fillMode`
 * (chips: Solid/Hatched/Transparent/No fill) is stacked `above` `fill`
 * (swatches, 11 columns, the 22nd cell is the custom slot) — exactly the
 * `modeControl`/`modePlacement` chain `ContextualControls.tsx` uses for a
 * shape's Stroke popover, here reproducing the Fill popover instead. Neither
 * `fillMode` nor `fill` looks any different for being stacked versus
 * standalone — that IS the point of `stackModes` living in the model, not
 * the renderer.
 */
export const FillPopover: Story = {
  render: () => {
    const [fillMode, setFillMode] = useState("none");
    const [fill, setFill] = useState("c10");
    const [lineStyle, setLineStyle] = useState("solid");
    const [bold, setBold] = useState(false);
    const [align, setAlign] = useState("start");

    const fillModeBound = demoRegistry.bindControl("fillMode", {
      id: "fillMode",
      value: { type: "shared", value: fillMode },
      onSelect: (value) => value && setFillMode(value),
    });
    const fillBound = demoRegistry.bindControl("fill", {
      id: "fill",
      value: { type: "shared", value: fill },
      onSelect: (value) => value && setFill(value),
      modeControl: fillModeBound,
      modePlacement: "above",
    });
    const lineStyleBound = demoRegistry.bindControl("lineStyle", {
      id: "lineStyle",
      value: { type: "shared", value: lineStyle },
      onSelect: (value) => value && setLineStyle(value),
    });
    const boldBound = demoRegistry.bindControl("bold", {
      id: "bold",
      value: { type: "shared", value: bold ? "on" : "off" },
      onSelect: (value) => setBold(value === "on"),
    });
    const alignBound = demoRegistry.bindControl("align", {
      id: "align",
      value: { type: "shared", value: align },
      onSelect: (value) => value && setAlign(value),
    });

    // `fillMode` is deliberately ABSENT from every recipe group: a stacked
    // control never appears in its own right, it only ever rides in on the
    // control it is stacked onto (the same reason `strokeWidth` is
    // legitimately absent from the donor's real `SHAPE_CONTEXTUAL_RECIPE`
    // while the Shape preset still composes it — menuLabModel.ts:217-220).
    const composition = demoRegistry.composeControls(
      {
        id: "shape",
        groups: [
          { id: "fill", items: ["fill"] },
          { id: "style", items: ["lineStyle", "bold", "align"] },
        ],
      },
      [fillBound, lineStyleBound, boldBound, alignBound],
    );

    return <ControlStrip composition={composition} glyphs={demoGlyphs} aria-label="Shape style" />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Fill,/ });

    await userEvent.click(trigger);
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole("menuitemradio", { name: "No fill" })).toBeInTheDocument());

    // The stacked chips row rendered — proving `fillMode` really is folded
    // into `fill`'s own popover, not dropped by `composeControls` for
    // never appearing in a recipe group.
    await expect(body.getByRole("menuitemradio", { name: "Solid" })).toBeInTheDocument();
    await expect(body.getByRole("menuitemradio", { name: "Hatched" })).toBeInTheDocument();
    await expect(body.getByRole("menuitemradio", { name: "Transparent" })).toBeInTheDocument();

    const noFill = body.getByRole("menuitemradio", { name: "No fill" });
    await expect(noFill).toHaveAttribute("aria-checked", "true");

    // The swatch grid rendered at its declared 11 columns, plus the custom
    // cell — 21 real swatches, never a dead 22nd cell (this control DOES
    // supply one; see `FontSizePresetsOnly` below for the sibling case that
    // must NOT render one).
    await expect(body.getAllByRole("menuitemradio").length).toBeGreaterThan(20);
    await expect(document.body.querySelector('[data-slot="control-custom-color"]')).not.toBeNull();

    await userEvent.click(body.getByRole("menuitemradio", { name: "Solid" }));
    await waitFor(() => expect(body.getByRole("menuitemradio", { name: "Solid" })).toHaveAttribute("aria-checked", "true"));
  },
};

/**
 * docs/menus/screenshots/03-font-size-popover.png. `rungPxByValue` is what
 * lets the trigger print "Large 36" and each row its own px beside its
 * name — the truthful-Font-size rule ContextualControls.tsx's `ControlTrigger`
 * carried (donor :186-191), here as a plain lookup instead of a live thunk.
 */
export const FontSizeList: Story = {
  render: () => {
    const [value, setValue] = useState("l");
    const bound = demoRegistry.bindControl("fontSize", {
      id: "fontSize",
      value: { type: "shared", value },
      onSelect: (next) => next && setValue(next),
      rungPxByValue: FONT_SIZE_PX,
    });
    const composition = demoRegistry.composeControls(
      { id: "text", groups: [{ id: "size", items: ["fontSize"] }] },
      [bound],
    );
    return <ControlStrip composition={composition} glyphs={demoGlyphs} aria-label="Text formatting" />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Font size,/ });
    await expect(trigger.textContent).toContain("Large");
    await expect(trigger.textContent).toContain("36");

    await userEvent.click(trigger);
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole("menuitemradio", { name: "Extra large" })).toBeInTheDocument());
    await expect(body.getByText("44")).toBeInTheDocument();
    await expect(body.getByRole("menuitemradio", { name: "Large" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(body.getByRole("menuitemradio", { name: "Extra large" }));
    await waitFor(() => expect(trigger.textContent).toContain("Extra large"));
  },
};

/**
 * The load-bearing rule from the task brief, proved as a pair: `Presets`
 * binds NO `customSize` at all (a surface bound to an explicit target, e.g.
 * a block title, that never wires one) and renders no Custom row.
 * `WithCustomBinding` supplies one and gets the row — and every preset shows
 * unchecked, because a custom scale means none of them are truthfully
 * current (`forceUnchecked`, `controlPanel.tsx`).
 */
export const FontSizePresetsOnly: Story = {
  render: () => {
    const bound = demoRegistry.bindControl("fontSize", {
      id: "fontSize",
      value: { type: "shared", value: "m" },
      onSelect: () => {},
      rungPxByValue: FONT_SIZE_PX,
    });
    return (
      <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">
        <ControlPanel control={bound} glyphs={demoGlyphs} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("control-custom-size-input")).toBeNull();
  },
};

export const FontSizeWithCustomBinding: Story = {
  render: () => {
    const [px, setPx] = useState(30);
    const bound = demoRegistry.bindControl("fontSize", {
      id: "fontSize",
      value: { type: "shared", value: "m" },
      onSelect: () => {},
      rungPxByValue: FONT_SIZE_PX,
      customSize: { sharedPx: px, onPresetRungs: false, applyPx: setPx, minPx: 8, maxPx: 200 },
    });
    return (
      <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">
        <ControlPanel control={bound} glyphs={demoGlyphs} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByTestId("control-custom-size-input");
    await expect(input).toHaveValue(30);
    // `onPresetRungs: false` means no preset row is truthfully current.
    await expect(canvas.getByRole("menuitemradio", { name: "Medium" })).toHaveAttribute("aria-checked", "false");
  },
};

/**
 * All five `ControlLayout`s side by side, each panel forced open (bypassing
 * the trigger — these are the popover BODIES, `LayoutGallery` exists to
 * compare shapes, not to re-prove the disclosure mechanics `FillPopover`
 * and `FontSizeList` already cover with real clicks).
 */
export const LayoutGallery: Story = {
  render: () => {
    const panels: { label: string; node: ReactNode }[] = [
      {
        label: "swatches — screenshot 01",
        node: (
          <ControlPanel
            control={demoRegistry.bindControl("fill", { id: "fill", value: { type: "shared", value: "c2" }, onSelect: () => {} })}
            glyphs={demoGlyphs}
          />
        ),
      },
      {
        label: "row",
        node: (
          <ControlPanel
            control={demoRegistry.bindControl("lineStyle", { id: "lineStyle", value: { type: "shared", value: "dashed" }, onSelect: () => {} })}
            glyphs={demoGlyphs}
          />
        ),
      },
      {
        label: "chips",
        node: (
          <ControlPanel
            control={demoRegistry.bindControl("fillMode", { id: "fillMode", value: { type: "shared", value: "none" }, onSelect: () => {} })}
            glyphs={demoGlyphs}
          />
        ),
      },
      {
        label: "list — screenshot 03",
        node: (
          <ControlPanel
            control={demoRegistry.bindControl("fontSize", {
              id: "fontSize",
              value: { type: "shared", value: "l" },
              onSelect: () => {},
              rungPxByValue: FONT_SIZE_PX,
            })}
            glyphs={demoGlyphs}
          />
        ),
      },
      {
        label: "library",
        node: (
          <ControlPanel
            control={demoRegistry.bindControl("shapeLibrary", { id: "shapeLibrary", value: { type: "shared", value: "shape0" }, onSelect: () => {} })}
            glyphs={demoGlyphs}
          />
        ),
      },
    ];
    return (
      <div className="flex flex-wrap items-start gap-6">
        {panels.map((panel) => (
          <div key={panel.label} className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">{panel.label}</span>
            <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">{panel.node}</div>
          </div>
        ))}
      </div>
    );
  },
};

/**
 * All five `ControlTrigger` shapes, closed — the lookup in `controlStrip.tsx`
 * (`TRIGGER_SHAPES`) proved by variety rather than by reading the table.
 * `duplicate` (action) draws through a glyph family (`demoGlyphs.duplicate`)
 * that exists ONLY in this story file, nowhere in the kit — the
 * "hosts extend by spreading" contract (`controlGlyphs.tsx`) exercised, not
 * just documented.
 */
export const TriggerGallery: Story = {
  render: () => {
    const value = demoRegistry.bindControl("fill", { id: "fill", value: { type: "shared", value: "c2" }, onSelect: () => {} });
    const icon = demoRegistry.bindControl("lineStyle", { id: "lineStyle", value: { type: "shared", value: "dashed" }, onSelect: () => {} });
    const text = demoRegistry.bindControl("fontSize", {
      id: "fontSize",
      value: { type: "shared", value: "l" },
      onSelect: () => {},
      rungPxByValue: FONT_SIZE_PX,
    });
    const toggle = demoRegistry.bindControl("bold", { id: "bold", value: { type: "shared", value: "on" }, onSelect: () => {} });
    const action = demoRegistry.bindControl("duplicate", { id: "duplicate", value: null, onSelect: () => {} });

    const composition = demoRegistry.composeControls(
      { id: "triggers", groups: [{ id: "all", items: ["fill", "lineStyle", "fontSize", "bold", "duplicate"] }] },
      [value, icon, text, toggle, action],
    );
    return <ControlStrip composition={composition} glyphs={demoGlyphs} aria-label="Every trigger shape" />;
  },
};

/**
 * `modePlacement: 'beside'` — the connector Line-style row, thickness folded
 * in beside it rather than above (donor's Connector recipe,
 * menuLabModel.ts:146-157: "Same thickness control, labels off, beside the
 * line styles"). One divider, one panel, both sections visible without
 * opening two popovers.
 */
export const BesideMode: Story = {
  render: () => {
    const strokeWidthBound = demoRegistry.bindControl("strokeWidth", {
      id: "strokeWidth",
      value: { type: "shared", value: "medium" },
      onSelect: () => {},
    });
    const lineStyleBound = demoRegistry.bindControl("lineStyle", {
      id: "lineStyle",
      value: { type: "shared", value: "dashed" },
      onSelect: () => {},
      modeControl: strokeWidthBound,
      modePlacement: "beside",
    });
    return (
      <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">
        <ControlPanel control={lineStyleBound} glyphs={demoGlyphs} />
      </div>
    );
  },
};

/**
 * A mixed selection dims a `value` trigger's glyph (no one option's crisp
 * icon may claim to be "the" selection) but leaves an `icon` trigger solid —
 * its icon names the control, it never previewed a value to begin with.
 * The automatic-option control shows the "A" badge instead of either.
 */
export const MixedAndAutomaticStates: Story = {
  render: () => {
    const mixedValue = demoRegistry.bindControl("fill", { id: "fill-mixed", value: { type: "mixed" }, onSelect: () => {} });
    const mixedIcon = demoRegistry.bindControl("lineStyle", { id: "lineStyle-mixed", value: { type: "mixed" }, onSelect: () => {} });
    const automatic = demoRegistry.bindControl("align", {
      id: "align-auto",
      // WHY the automatic option's own value is "auto", not one already in
      // `align`'s option list: `isAutomaticSelection` only compares VALUES
      // (`controlRegistry.ts`'s own guard), so a value that happened to
      // collide with a real option would still show the "A" badge here, but
      // it would make `selectedControlOption` resolve the real option
      // first and mask which path actually fired. A distinct sentinel
      // keeps the demo honest about which rule is being shown.
      value: { type: "shared", value: "auto" },
      onSelect: () => {},
      automaticOption: { value: "auto", label: "Automatic" },
    });
    const composition = demoRegistry.composeControls(
      { id: "states", groups: [{ id: "all", items: ["fill", "lineStyle", "align"] }] },
      [mixedValue, mixedIcon, automatic],
    );
    return <ControlStrip composition={composition} glyphs={demoGlyphs} aria-label="Mixed and automatic states" />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const valueTrigger = canvas.getByRole("button", { name: /^Fill,/ });
    const iconTrigger = canvas.getByRole("button", { name: /^Line style,/ });
    const automaticTrigger = canvas.getByRole("button", { name: /^Align,/ });

    await expect(valueTrigger).toHaveAttribute("data-mixed", "true");
    await expect(iconTrigger).toHaveAttribute("data-mixed", "true");
    // The "A" badge, not a glyph, for the automatic selection.
    await expect(automaticTrigger.textContent).toContain("A");
  },
};
