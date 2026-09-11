import { describe, expect, it } from "vitest";
import { defaultArgs, presetArgs, toArgTypes } from "../src/storybook";
import type { FieldSpec } from "../src/field";
import type { PresetSpec } from "../src/resolve";

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
