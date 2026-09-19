// src/components/controlRegistry.test.ts — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/contextualControlRegistry.test.ts:1-129` — every
//     case, adapted to call through a `createControlRegistry` instance built
//     from a small fixture vocabulary rather than the donor's module-level
//     `CONTEXTUAL_CONTROL_REGISTRY` (the port's whole point — see
//     `controlRegistry.ts`'s header, change (1)). No case was dropped and no
//     new product behaviour is asserted here beyond it; the fixture below
//     reproduces the donor's `SHAPE_CONTEXTUAL_RECIPE` /
//     `CONNECTOR_CONTEXTUAL_RECIPE` / `BLOCK_TITLE_CONTEXTUAL_RECIPE` shapes
//     and vocabulary entries closely enough that every assertion still pins
//     the same behaviour, plus new cases for `danglingControls`/`onDangling`
//     (design decision #7 — not present in the donor at all).
import { describe, expect, it, vi } from "vitest";

import {
  CUSTOM_LABEL,
  type ControlDefinition,
  type ControlRecipe,
  createControlRegistry,
  isAutomaticSelection,
  selectedControlOption,
  stackModes,
} from "./controlRegistry";

// A fixture vocabulary standing in for the donor's
// `CONTEXTUAL_CONTROL_REGISTRY` — narrow, but wide enough to carry every
// donor test case: two colour-shaped controls, the thickness control (donor's
// "one thickness vocabulary" case), the line-shape control (donor's "one Line
// shape vocabulary" case), plus font/align/bold/size/addText for composition.
type Kind =
  | "geo"
  | "color"
  | "lineStyle"
  | "strokeWidth"
  | "size"
  | "font"
  | "align"
  | "verticalAlign"
  | "lineShape"
  | "bold"
  | "addText";

const option = (value: string, label: string) => ({ value, label });

const DEFINITIONS: Readonly<Record<Kind, ControlDefinition<Kind>>> = {
  geo: { kind: "geo", label: "Shape", options: [option("rectangle", "Rectangle")], layout: "library", trigger: "icon" },
  color: {
    kind: "color",
    label: "Color",
    options: [option("blue", "blue"), option("black", "black")],
    layout: "swatches",
    trigger: "value",
    glyph: "swatch",
  },
  // Registered once, exactly like the donor's `strokeWidth` — the shape row
  // and the connector row are the SAME control, never two.
  lineStyle: {
    kind: "lineStyle",
    label: "Line style",
    options: [option("solid", "Solid"), option("dashed", "Dashed")],
    layout: "chips",
    trigger: "icon",
  },
  strokeWidth: {
    kind: "strokeWidth",
    label: "Line thickness",
    options: [option("thin", "Thin"), option("medium", "Medium"), option("thick", "Thick")],
    layout: "row",
    trigger: "value",
    hostTag: "width",
  },
  size: {
    kind: "size",
    label: "Font size",
    options: [option("s", "Small"), option("m", "Medium")],
    layout: "list",
    trigger: "text",
  },
  font: {
    kind: "font",
    label: "Typeface",
    options: [option("sans", "Simple"), option("serif", "Bookish")],
    layout: "list",
    trigger: "icon",
  },
  align: {
    kind: "align",
    label: "Text alignment",
    options: [option("start", "Left"), option("middle", "Center"), option("end", "Right")],
    layout: "row",
    trigger: "value",
  },
  verticalAlign: {
    kind: "verticalAlign",
    label: "Vertical alignment",
    options: [option("start", "Top"), option("middle", "Middle"), option("end", "Bottom")],
    layout: "row",
    trigger: "value",
  },
  lineShape: {
    kind: "lineShape",
    label: "Line shape",
    options: [option("elbow", "Elbowed"), option("curve", "Curved"), option("straight", "Straight")],
    layout: "row",
    trigger: "value",
  },
  bold: { kind: "bold", label: "Bold", options: [], layout: "row", trigger: "toggle" },
  addText: { kind: "addText", label: "Add text", options: [], layout: "row", trigger: "action" },
};

const registry = createControlRegistry(DEFINITIONS);
const { bindControl, composeControls, controlIds, danglingControls } = registry;

const shared = (value: string) => ({ type: "shared" as const, value });

const SHAPE_RECIPE: ControlRecipe<Kind> = {
  id: "shape",
  groups: [
    { id: "identity", items: ["geo"] },
    { id: "paint", items: ["color", "lineStyle"] },
    { id: "type", items: ["font", "size"] },
    { id: "alignment", items: ["align", "verticalAlign"] },
  ],
};

const CONNECTOR_RECIPE: ControlRecipe<Kind> = {
  id: "connector",
  groups: [
    { id: "identity", items: ["geo"] },
    { id: "paint", items: ["color", "lineStyle", "addText"] },
    { id: "type", items: ["size", "font"] },
    { id: "alignment", items: ["align", "verticalAlign"] },
    { id: "flow", items: ["lineShape"] },
  ],
};

const BLOCK_TITLE_RECIPE: ControlRecipe<Kind> = {
  id: "block-title",
  groups: [
    { id: "type", items: ["font", "size"] },
    { id: "emphasis", items: ["bold"] },
    { id: "ink", items: ["color"] },
    { id: "alignment", items: ["align"] },
  ],
};

describe("contextual control composition", () => {
  it("registers thickness once: the shape row and the connector row are one control", () => {
    // The connector used to own a `weight` kind of its own — two rungs
    // writing the stock `size` style — beside a shape that had no thickness
    // control at all. Zach's rule: "all the icons by construction must be
    // the same", so there is ONE registered vocabulary and the surfaces
    // differ only in how they compose it.
    const thicknessLabelled = Object.values<ControlDefinition<Kind>>(DEFINITIONS).filter(
      (definition) => definition.label === "Line thickness",
    );
    expect(thicknessLabelled).toHaveLength(1);
    expect(thicknessLabelled[0].options.map((option) => option.value)).toEqual(["thin", "medium", "thick"]);
    expect(thicknessLabelled[0].hostTag).toBe("width");
  });

  it("registers Line shape once: one concept, one label, one vocabulary", () => {
    // The reported duplicate-dropdown bug was three sibling kinds (arrow
    // kind, line spline, cable routing) all labelled "Line shape". The
    // registry structurally cannot compose two of them into one group.
    const lineShapeLabelled = Object.values<ControlDefinition<Kind>>(DEFINITIONS).filter(
      (definition) => definition.label === "Line shape",
    );
    expect(lineShapeLabelled).toHaveLength(1);
    expect(lineShapeLabelled[0].options.map((option) => option.value)).toEqual(["elbow", "curve", "straight"]);
  });

  it("composes Block title controls only by recipe and preserves group order", () => {
    const controls = [
      bindControl("align", { id: "titleAlign", value: shared("start"), onSelect: vi.fn() }),
      bindControl("font", { id: "titleFont", value: shared("sans"), onSelect: vi.fn() }),
      bindControl("color", { id: "titleColor", value: shared("blue"), onSelect: vi.fn() }),
      bindControl("bold", { id: "titleBold", value: shared("off"), onSelect: vi.fn() }),
      bindControl("size", { id: "titleSize", value: shared("m"), onSelect: vi.fn() }),
    ];
    const composition = composeControls(BLOCK_TITLE_RECIPE, controls);
    expect(controlIds(composition)).toEqual(["titleFont", "titleSize", "titleBold", "titleColor", "titleAlign"]);
    expect(composition.groups.map((group) => group.id)).toEqual(["type", "emphasis", "ink", "alignment"]);
  });

  it("drops unavailable items and empty groups without leaving separator gaps", () => {
    const composition = composeControls(SHAPE_RECIPE, [
      bindControl("font", { id: "font", value: shared("sans"), onSelect: vi.fn() }),
      bindControl("align", { id: "align", value: shared("middle"), onSelect: vi.fn() }),
    ]);
    expect(composition.groups.map((group) => group.id)).toEqual(["type", "alignment"]);
    expect(controlIds(composition)).toEqual(["font", "align"]);
  });

  it("puts connector text insertion in the paint group by recipe", () => {
    const composition = composeControls(CONNECTOR_RECIPE, [
      bindControl("addText", { id: "addText", value: null, onSelect: vi.fn() }),
      bindControl("lineStyle", { id: "lineStyle", value: shared("solid"), onSelect: vi.fn() }),
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
    ]);
    expect(composition.groups).toHaveLength(1);
    expect(composition.groups[0].id).toBe("paint");
    expect(controlIds(composition)).toEqual(["color", "lineStyle", "addText"]);
  });

  it("keeps a freehand stroke's bare Line style chips in the shape paint group", () => {
    // A draw shape emits `lineStyle` instead of a separate stroke-colour
    // control (a dash but no separately paintable edge). The shape recipe
    // must list that slot, or the candidate is built and then silently
    // never rendered — which is exactly what happened before this test
    // existed.
    const composition = composeControls(SHAPE_RECIPE, [
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
      bindControl("lineStyle", { id: "lineStyle", value: shared("solid"), onSelect: vi.fn() }),
    ]);
    expect(composition.groups.map((group) => group.id)).toEqual(["paint"]);
    expect(controlIds(composition)).toEqual(["color", "lineStyle"]);
  });
});

describe("bindControl never lets a binding overwrite its own kind", () => {
  it("re-pins `kind` last even if the binding object carries a stray one", () => {
    const stray = { id: "x", value: null, onSelect: vi.fn(), kind: "font" as const };
    const bound = bindControl("color", stray);
    expect(bound.kind).toBe("color");
    expect(bound.label).toBe("Color");
  });
});

describe("the Automatic badge predicate", () => {
  it("claims Automatic only for a declared option the value actually matches", () => {
    const automaticOption = { value: "automatic", label: "Automatic" };
    const automatic = bindControl("color", {
      id: "titleColor",
      value: shared("automatic"),
      automaticOption,
      onSelect: vi.fn(),
    });
    expect(isAutomaticSelection(automatic)).toBe(true);
    const chosen = bindControl("color", {
      id: "titleColor",
      value: shared("blue"),
      automaticOption,
      onSelect: vi.fn(),
    });
    expect(isAutomaticSelection(chosen)).toBe(false);
  });

  it("never claims Automatic for a control without the concept, however unresolved", () => {
    // The regression this guards: `automaticOption?.value === current?.value`
    // is true (`undefined === undefined`) for any automatic-less control
    // whose value is mixed or unoffered, which painted an "A" badge over the
    // trigger of every disagreeing selection.
    const mixed = bindControl("color", { id: "color", value: { type: "mixed" }, onSelect: vi.fn() });
    expect(isAutomaticSelection(mixed)).toBe(false);
    const unoffered = bindControl("lineStyle", { id: "lineStyle", value: shared("draw"), onSelect: vi.fn() });
    expect(isAutomaticSelection(unoffered)).toBe(false);
  });
});

describe("danglingControls / onDangling (design decision #7, new relative to the donor)", () => {
  it("finds no dangling controls when every candidate's kind is named somewhere in the recipe", () => {
    const controls = [
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
      bindControl("lineStyle", { id: "lineStyle", value: shared("solid"), onSelect: vi.fn() }),
    ];
    expect(danglingControls(SHAPE_RECIPE, controls)).toEqual([]);
  });

  it("names a bound control's kind when no recipe group lists it at all", () => {
    // The shape of the real regression: a `lineShape` control was bound as a
    // candidate every time, but a recipe (the V1-compact recipe in the
    // donor) forgot to list `lineShape` in ANY group, so it silently never
    // rendered. `danglingControls` is what lets a dev build catch that
    // instead of noticing a missing dropdown by eye.
    const controls = [
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
      bindControl("lineShape", { id: "lineShape", value: shared("elbow"), onSelect: vi.fn() }),
    ];
    // SHAPE_RECIPE never lists `lineShape`.
    expect(danglingControls(SHAPE_RECIPE, controls)).toEqual(["lineShape"]);
  });

  it("composeControls still silently drops dangling controls by default (no onDangling)", () => {
    const controls = [
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
      bindControl("lineShape", { id: "lineShape", value: shared("elbow"), onSelect: vi.fn() }),
    ];
    const composition = composeControls(SHAPE_RECIPE, controls);
    expect(controlIds(composition)).toEqual(["color"]);
  });

  it("fires onDangling with every dangling kind exactly once, but still composes the same result", () => {
    const controls = [
      bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() }),
      bindControl("lineShape", { id: "lineShape", value: shared("elbow"), onSelect: vi.fn() }),
    ];
    const onDangling = vi.fn();
    const composition = composeControls(SHAPE_RECIPE, controls, { onDangling });
    expect(onDangling).toHaveBeenCalledTimes(1);
    expect(onDangling).toHaveBeenCalledWith(["lineShape"]);
    expect(controlIds(composition)).toEqual(["color"]);
  });

  it("does not fire onDangling when nothing is dangling", () => {
    const controls = [bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() })];
    const onDangling = vi.fn();
    composeControls(SHAPE_RECIPE, controls, { onDangling });
    expect(onDangling).not.toHaveBeenCalled();
  });

  it("recipe items with no matching candidate are NOT dangling — that drop stays load-bearing for optional slots", () => {
    // `verticalAlign` is named in SHAPE_RECIPE but no candidate is bound for
    // it here — an ordinary "this slot has nothing to show" case, not a
    // vocabulary mistake, and `onDangling` must stay silent about it.
    const controls = [bindControl("align", { id: "align", value: shared("start"), onSelect: vi.fn() })];
    const onDangling = vi.fn();
    composeControls(SHAPE_RECIPE, controls, { onDangling });
    expect(onDangling).not.toHaveBeenCalled();
  });
});

describe("stackModes", () => {
  it("walks a chain of `above`-placed modes, outermost last", () => {
    const strokeWidth = bindControl("strokeWidth", { id: "strokeWidth", value: shared("thin"), onSelect: vi.fn() });
    const lineStyle = bindControl("lineStyle", {
      id: "lineStyle",
      value: shared("solid"),
      onSelect: vi.fn(),
      modeControl: strokeWidth,
      modePlacement: "above",
    });
    const color = bindControl("color", {
      id: "color",
      value: shared("black"),
      onSelect: vi.fn(),
      modeControl: lineStyle,
      modePlacement: "above",
    });
    expect(stackModes(color).map((c) => c.id)).toEqual(["strokeWidth", "lineStyle"]);
  });

  it("stops at the first `beside`-placed link — beside is not part of the stack", () => {
    const strokeWidth = bindControl("strokeWidth", { id: "strokeWidth", value: shared("thin"), onSelect: vi.fn() });
    const color = bindControl("color", {
      id: "color",
      value: shared("black"),
      onSelect: vi.fn(),
      modeControl: strokeWidth,
      modePlacement: "beside",
    });
    expect(stackModes(color)).toEqual([]);
  });

  it("an unmoded control stacks nothing", () => {
    const color = bindControl("color", { id: "color", value: shared("black"), onSelect: vi.fn() });
    expect(color.modeControl).toBeUndefined();
  });
});

describe("selectedControlOption / customValueLabel (design change (3): generalized isCustomColor)", () => {
  it("returns null, never undefined, when nothing matches", () => {
    const mixed = bindControl("color", { id: "color", value: { type: "mixed" }, onSelect: vi.fn() });
    expect(selectedControlOption(mixed)).toBeNull();
  });

  it("falls back to a declared isCustomValue/customValueLabel escape hatch", () => {
    const customAware: ControlDefinition<Kind> = {
      ...DEFINITIONS.color,
      isCustomValue: (value) => value.startsWith("#"),
    };
    const registryWithCustom = createControlRegistry({ ...DEFINITIONS, color: customAware });
    const bound = registryWithCustom.bindControl("color", {
      id: "color",
      value: shared("#ff00ff"),
      onSelect: vi.fn(),
    });
    expect(selectedControlOption(bound)).toEqual({ value: "#ff00ff", label: CUSTOM_LABEL });
  });

  it("prefers a declared customValueLabel over the default CUSTOM_LABEL", () => {
    const customAware: ControlDefinition<Kind> = {
      ...DEFINITIONS.color,
      isCustomValue: (value) => value.startsWith("#"),
      customValueLabel: (value) => `Custom (${value})`,
    };
    const registryWithCustom = createControlRegistry({ ...DEFINITIONS, color: customAware });
    const bound = registryWithCustom.bindControl("color", {
      id: "color",
      value: shared("#123456"),
      onSelect: vi.fn(),
    });
    expect(selectedControlOption(bound)?.label).toBe("Custom (#123456)");
  });
});
