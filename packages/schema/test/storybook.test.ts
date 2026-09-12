import { describe, expect, it } from "vitest";
import { controlNames, defaultArgs, presetArgs, toArgTypes } from "../src/storybook";
import type { FieldSpec } from "../src/field";
import { resolveField } from "../src/resolve";
import type { PresetSpec } from "../src/resolve";

/**
 * A faithful copy of Storybook 10.6.0's own `filterArgTypes`
 * (preview-api/modules/store/filterArgTypes.ts, minified in
 * storybook/dist/preview/runtime.js): `pickBy` keyed by `argType.name ||
 * key`, matched against the exclude list. Not imported from `storybook`
 * itself — this package stays Storybook-free — but reproduced verbatim so
 * the test fails the same way the real Controls panel would.
 */
function filterArgTypesLikeStorybook(
  argTypes: Record<string, { name: string }>,
  exclude: string[],
): Record<string, { name: string }> {
  const result: Record<string, { name: string }> = {};
  for (const [key, argType] of Object.entries(argTypes)) {
    const name = argType.name || key;
    if (!exclude.includes(name)) result[key] = argType;
  }
  return result;
}

const FIELDS: FieldSpec[] = [
  {
    id: "state",
    label: "State",
    kind: "segments",
    defaultValue: "empty",
    options: [
      { value: "empty", label: "Empty" },
      { value: "wired", label: "Wired" },
    ],
    hint: "test hint",
  },
  { id: "count", label: "Count", kind: "number", defaultValue: 1, min: 0, max: 10, step: 1 },
  { id: "visible", label: "Visible", kind: "toggle", defaultValue: true },
  { id: "label", label: "Label", kind: "text", defaultValue: "Port" },
];

describe("toArgTypes", () => {
  it("maps every FieldKind to the matching Storybook control", () => {
    const argTypes = toArgTypes(FIELDS);
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.count.control).toBe("number");
    expect(argTypes.visible.control).toBe("boolean");
    expect(argTypes.label.control).toBe("text");
  });

  // WHY a lone extra field rather than adding "body" to FIELDS above: FIELDS
  // is pinned exactly by the "keyed by field id, one entry per field" test
  // further down — growing it there would break a pin instead of proving
  // anything about "textarea". docs/TEXTBOX-EDITING-SPEC.md §2 asks for
  // `"textarea"` to map to Storybook's own "text" control (there is no
  // distinct multiline control), which this is the value-map half of.
  it('maps "textarea" to the "text" Storybook control, same as "text" — a value map, not identity', () => {
    const argTypes = toArgTypes([{ id: "body", label: "Body", kind: "textarea", defaultValue: "" }]);
    expect(argTypes.body.control).toBe("text");
  });

  it("carries options, min/max/step and the hint through", () => {
    const argTypes = toArgTypes(FIELDS);
    expect(argTypes.state.options).toEqual(["empty", "wired"]);
    expect(argTypes.state.description).toBe("test hint");
    expect(argTypes.count).toMatchObject({ min: 0, max: 10, step: 1 });
  });
});

describe("controlNames", () => {
  it("maps a field id to its display label", () => {
    expect(controlNames(FIELDS, ["state", "count"])).toEqual(["State", "Count"]);
  });

  it("falls back to the raw id for an id not in the field array", () => {
    expect(controlNames(FIELDS, ["nope"])).toEqual(["nope"]);
  });

  it("preserves order and duplicates of the input ids", () => {
    expect(controlNames(FIELDS, ["count", "state", "count"])).toEqual(["Count", "State", "Count"]);
  });

  it(
    "REGRESSION: raw field ids are a silent no-op against Storybook's real " +
      "filterArgTypes (it matches argType.name, which toArgTypes sets to " +
      "field.label) — controlNames is the required bridge",
    () => {
      const argTypes = toArgTypes(FIELDS);

      // The bug: excluding by raw id matches nothing, because every
      // argType.name is a human label ("State"), not the id ("state").
      const brokenlyFiltered = filterArgTypesLikeStorybook(argTypes, ["state"]);
      expect(brokenlyFiltered.state).toBeDefined();
      expect(Object.keys(brokenlyFiltered)).toHaveLength(Object.keys(argTypes).length);

      // The fix: excluding by controlNames(...) — the label — actually
      // removes the row, while an unrelated field stays present.
      const correctlyFiltered = filterArgTypesLikeStorybook(
        argTypes,
        controlNames(FIELDS, ["state"]),
      );
      expect(correctlyFiltered.state).toBeUndefined();
      expect(correctlyFiltered.count).toBeDefined();
    },
  );
});

describe("defaultArgs", () => {
  it("is keyed by field id, one entry per field", () => {
    expect(defaultArgs(FIELDS)).toEqual({
      state: "empty",
      count: 1,
      visible: true,
      label: "Port",
    });
  });
});

describe("defaultArgs with presets", () => {
  const WIRED: PresetSpec = {
    id: "wired",
    label: "Wired",
    selector: "state",
    governs: ["count"],
    values: { count: 7 },
  };

  // WHY these live here and not only under presetArgs: the shipped defect was
  // in `meta.args`, which every story builds with `defaultArgs`, and the whole
  // previous round's coverage sat under `presetArgs`. Moving the omission out
  // of this function and into that one re-ships the bug with the suite green.
  it("omits a governed field, so the preset layer can reach it", () => {
    const args = defaultArgs(FIELDS, [WIRED]);
    expect("count" in args).toBe(false);
  });

  it("keeps every ungoverned field at its component default", () => {
    const args = defaultArgs(FIELDS, [WIRED]);
    expect(args.label).toBe("Port");
    expect(args.visible).toBe(true);
  });

  it("with no presets it is exactly the old one-argument behaviour", () => {
    expect(defaultArgs(FIELDS, [])).toEqual(defaultArgs(FIELDS));
  });

  it("a field governed by ANY of several presets is omitted", () => {
    const other: PresetSpec = {
      id: "empty",
      label: "Empty",
      selector: "state",
      governs: ["visible"],
      values: { visible: false },
    };
    const args = defaultArgs(FIELDS, [WIRED, other]);
    expect("count" in args).toBe(false);
    expect("visible" in args).toBe(false);
    expect(args.label).toBe("Port");
  });

  it("what a story's meta.args actually produces resolves through the preset", () => {
    const metaArgs = defaultArgs(FIELDS, [WIRED]);
    const countField = FIELDS.find((f) => f.id === "count")!;
    const trace = resolveField(countField, { ...metaArgs, state: "wired" }, [WIRED]);
    expect(trace.resolved).toBe(7);
    expect(trace.winner).toBe("preset");
  });
});

describe("presetArgs", () => {
  const WIRED_PRESET: PresetSpec = {
    id: "wired",
    label: "Wired",
    selector: "state",
    governs: ["count"],
    values: { count: 7 },
  };

  it("starts from defaultArgs, then sets the selector to the preset id", () => {
    expect(presetArgs(FIELDS, [WIRED_PRESET], "wired")).toMatchObject({
      state: "wired",
      visible: true,
      label: "Port",
    });
  });

  // WHY this reverses what it used to assert: spelling the governed values
  // out stored them as instance OVERRIDES, which outrank the preset, so every
  // Presets row was painted by the override layer and deleting all presets
  // left the output byte-identical. The story must leave the governed field
  // ABSENT so the selector actually selects.
  it("leaves the preset's governed fields absent, so the preset layer resolves them", () => {
    const args = presetArgs(FIELDS, [WIRED_PRESET], "wired");
    expect("count" in args).toBe(false);
  });

  it("is not merely omitting everything — the selector and ungoverned fields survive", () => {
    const args = presetArgs(FIELDS, [WIRED_PRESET], "wired");
    expect(args.state).toBe("wired");
    expect(args.label).toBe("Port");
  });

  it("leaves ungoverned fields at their plain component default", () => {
    const args = presetArgs(FIELDS, [WIRED_PRESET], "wired");
    expect(args.visible).toBe(true);
    expect(args.label).toBe("Port");
  });

  it("a preset governing multiple fields leaves all of them to the cascade", () => {
    const multi: PresetSpec = {
      id: "wired",
      label: "Wired",
      selector: "state",
      governs: ["count", "visible"],
      values: { count: 3, visible: false },
    };
    expect(presetArgs(FIELDS, [multi], "wired")).toEqual({
      state: "wired",
      label: "Port",
    });
  });

  // The gate that would have caught the shipped defect: with the governed
  // field absent, resolution must actually reach the preset and return the
  // preset's value, tagged as coming from the preset layer rather than from
  // an override.
  it("a governed field left absent really resolves through the preset layer", () => {
    const args = presetArgs(FIELDS, [WIRED_PRESET], "wired");
    const countField = FIELDS.find((f) => f.id === "count")!;
    const trace = resolveField(countField, args, [WIRED_PRESET]);
    expect(trace.resolved).toBe(7);
    expect(trace.winner).toBe("preset");
  });

  // The shape that used to compile and quietly re-arm the bug: a component
  // with two preset families, where passing only one family's preset left the
  // OTHER family's governed fields materialised as explicit defaults, killing
  // its preset layer. Passing the whole array is now the only way to call it.
  it("a second preset family on another selector keeps its own preset layer", () => {
    const LOUD: PresetSpec = {
      id: "loud",
      label: "Loud",
      selector: "variant",
      governs: ["label"],
      values: { label: "LOUD" },
    };
    const all = [WIRED_PRESET, LOUD];
    const args = presetArgs(FIELDS, all, "wired");
    expect("label" in args).toBe(false);
    const labelField = FIELDS.find((f) => f.id === "label")!;
    const trace = resolveField(labelField, { ...args, variant: "loud" }, all);
    expect(trace.resolved).toBe("LOUD");
    expect(trace.winner).toBe("preset");
  });

  it("rejects an id that names no preset, instead of silently doing nothing", () => {
    expect(() => presetArgs(FIELDS, [WIRED_PRESET], "nope")).toThrow(/no preset with id "nope"/);
  });

  it("and an explicit arg still beats the preset, so the escape hatch survives", () => {
    const args = { ...presetArgs(FIELDS, [WIRED_PRESET], "wired"), count: 99 };
    const countField = FIELDS.find((f) => f.id === "count")!;
    const trace = resolveField(countField, args, [WIRED_PRESET]);
    expect(trace.resolved).toBe(99);
    expect(trace.winner).toBe("override");
  });
});
