import { describe, expect, it } from "vitest";
import { controlNames, defaultArgs, presetArgs, toArgTypes } from "../src/storybook";
import type { FieldSpec } from "../src/field";
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

describe("presetArgs", () => {
  const WIRED_PRESET: PresetSpec = {
    id: "wired",
    label: "Wired",
    selector: "state",
    governs: ["count"],
    values: { count: 7 },
  };

  it("starts from defaultArgs, then sets the selector to the preset id", () => {
    expect(presetArgs(FIELDS, WIRED_PRESET)).toMatchObject({
      state: "wired",
      visible: true,
      label: "Port",
    });
  });

  it("spells out the preset's governed values explicitly, overriding the default", () => {
    expect(presetArgs(FIELDS, WIRED_PRESET).count).toBe(7);
  });

  it("leaves ungoverned fields at their plain component default", () => {
    const args = presetArgs(FIELDS, WIRED_PRESET);
    expect(args.visible).toBe(true);
    expect(args.label).toBe("Port");
  });

  it("a preset governing multiple fields sets all of them", () => {
    const multi: PresetSpec = {
      id: "wired",
      label: "Wired",
      selector: "state",
      governs: ["count", "visible"],
      values: { count: 3, visible: false },
    };
    expect(presetArgs(FIELDS, multi)).toEqual({
      state: "wired",
      count: 3,
      visible: false,
      label: "Port",
    });
  });
});
