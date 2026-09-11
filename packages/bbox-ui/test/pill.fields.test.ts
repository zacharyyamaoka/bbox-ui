import { describe, expect, it } from "vitest";
import {
  assertDisjointPresets,
  defaultArgs,
  governedFieldIds,
  resolveField,
  toArgTypes,
} from "@bbox-ui/schema";
import {
  PAINT_TOKENS,
  PILL_CHILDREN_FIELD,
  PILL_FIELDS,
  PILL_FILL_STYLES,
  PILL_LINE_STYLES,
  PILL_LINE_THICKNESSES,
  PILL_PAINT_FIELDS,
} from "../src/pill.fields";
import { PILL_PRESETS } from "../src/pill.presets";
import { Pill } from "../src/pill";
import { APPEARANCE_STATES, LENSES, TONES } from "../src/appearance";

/**
 * `Pill` uses no hooks — calling it directly, as a plain function, returns
 * the exact React element tree it would render, with every real default
 * already applied. No DOM/jsdom needed: this is a plain element object,
 * never rendered or mounted. Same T0 `port.fields.test.ts` pattern.
 */
function pillElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Pill as any)(props);
}

function field(id: string) {
  const found = PILL_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no PILL_FIELDS entry for "${id}"`);
  return found;
}

const bare = pillElement();

describe("PILL_FIELDS", () => {
  it("is the shared APPEARANCE_FIELDS bundle, then Pill's own paint fields, then children — in panel order", () => {
    expect(PILL_FIELDS.map((f) => f.id)).toEqual([
      "state",
      "tone",
      "lens",
      "lensBefore",
      "lineStyle",
      "lineColor",
      "lineThickness",
      "lineOpacity",
      "fillStyle",
      "fillColor",
      "fillOpacity",
      "children",
    ]);
  });

  it("is a flat property space — the bundle is spread in, never nested under an `appearance` key", () => {
    // Zach's ruling (T1-SPEC.md §2.1's own framing): "state"/"tone"/"lens"
    // sit directly alongside Pill's own fields, not under `appearance.*`.
    expect(PILL_FIELDS.every((f) => !f.id.startsWith("appearance"))).toBe(true);
  });

  it("PILL_PAINT_FIELDS + PILL_CHILDREN_FIELD are exactly the non-bundle tail of PILL_FIELDS", () => {
    expect(PILL_FIELDS.slice(4)).toEqual([...PILL_PAINT_FIELDS, PILL_CHILDREN_FIELD]);
  });
});

describe("PILL_FIELDS — bundle fields (state/tone/lens/lensBefore)", () => {
  it("state's declared default equals Pill's real default", () => {
    expect(field("state").defaultValue).toBe("empty");
    expect(bare.props["data-state"]).toBe(field("state").defaultValue);
  });

  it("state's options are exactly the real AppearanceState union (appearance.ts's own APPEARANCE_STATES)", () => {
    expect(field("state").options?.map((o) => o.value)).toEqual(APPEARANCE_STATES);
  });

  it("tone's declared default equals Pill's real default", () => {
    expect(field("tone").defaultValue).toBe("neutral");
    expect(bare.props["data-tone"]).toBe(field("tone").defaultValue);
  });

  it("tone's options are exactly the real Tone union (appearance.ts's own TONES)", () => {
    expect(field("tone").options?.map((o) => o.value)).toEqual(TONES);
  });

  it("lens's declared default equals Pill's real default", () => {
    expect(field("lens").defaultValue).toBe("normal");
    expect(bare.props["data-lens"]).toBe(field("lens").defaultValue);
  });

  it("lens's options are exactly the real Lens union (appearance.ts's own LENSES)", () => {
    expect(field("lens").options?.map((o) => o.value)).toEqual(LENSES);
  });
});

describe("PILL_FIELDS — Pill's own paint fields", () => {
  it("lineColor's/fillColor's options are exactly the real PaintToken union (pill.fields.ts's own PAINT_TOKENS), including the literal `transparent` 9th option", () => {
    expect(field("lineColor").options?.map((o) => o.value)).toEqual(PAINT_TOKENS);
    expect(field("fillColor").options?.map((o) => o.value)).toEqual(PAINT_TOKENS);
    expect(PAINT_TOKENS).toHaveLength(9);
    expect(PAINT_TOKENS).toContain("transparent");
  });

  it("lineStyle's options are exactly the real PillLineStyle union", () => {
    expect(field("lineStyle").options?.map((o) => o.value)).toEqual(PILL_LINE_STYLES);
  });

  it("fillStyle's options are exactly the real PillFillStyle union", () => {
    expect(field("fillStyle").options?.map((o) => o.value)).toEqual(PILL_FILL_STYLES);
  });

  it("lineThickness's options are exactly the real thickness union", () => {
    expect(field("lineThickness").options?.map((o) => o.value)).toEqual(PILL_LINE_THICKNESSES);
  });

  it("lineThickness's declared default ('med') equals Pill's own destructured default — proven by two renders agreeing, never a re-typed pixel constant", () => {
    const explicit = pillElement({ lineThickness: field("lineThickness").defaultValue as string });
    expect(explicit.props.style.borderWidth).toBe(bare.props.style.borderWidth);
  });

  it("lineOpacity's declared default (1) equals Pill's own destructured default — proven by two renders agreeing", () => {
    const explicit = pillElement({ lineOpacity: field("lineOpacity").defaultValue as number });
    expect(explicit.props.style.borderColor).toBe(bare.props.style.borderColor);
  });

  it("fillOpacity's declared default (1) equals Pill's own destructured default — proven by two renders agreeing", () => {
    const explicit = pillElement({ fillOpacity: field("fillOpacity").defaultValue as number });
    expect(explicit.props.style.background).toBe(bare.props.style.background);
  });

  it("lineThickness/lineOpacity/fillOpacity are NOT governed by any preset — always freely editable regardless of state", () => {
    const governed = governedFieldIds(PILL_PRESETS);
    expect(governed).not.toContain("lineThickness");
    expect(governed).not.toContain("lineOpacity");
    expect(governed).not.toContain("fillOpacity");
  });

  it("no FieldSpec declares min/max outside [0,1] for the two opacity fields", () => {
    expect(field("lineOpacity")).toMatchObject({ min: 0, max: 1 });
    expect(field("fillOpacity")).toMatchObject({ min: 0, max: 1 });
  });
});

describe("PILL_FIELDS — children", () => {
  it("children's declared default is the demoable placeholder \"Pill\" (control-only — Pill's real prop has no destructured default; omitting it renders the bare shell)", () => {
    expect(field("children").defaultValue).toBe("Pill");
    expect(bare.props.children).toBeUndefined();
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(PILL_FIELDS)).toEqual(
      Object.fromEntries(PILL_FIELDS.map((f) => [f.id, f.defaultValue])),
    );
  });

  it("toArgTypes maps every segments field to a select control, both number fields to number, and children to text", () => {
    const argTypes = toArgTypes(PILL_FIELDS);
    for (const id of ["state", "tone", "lens", "lineStyle", "lineColor", "lineThickness", "fillStyle", "fillColor"]) {
      expect(argTypes[id].control).toBe("select");
    }
    expect(argTypes.lineOpacity.control).toBe("number");
    expect(argTypes.fillOpacity.control).toBe("number");
    expect(argTypes.lensBefore.control).toBe("text");
    expect(argTypes.children.control).toBe("text");
  });
});

describe("PILL_PRESETS — governed-set discipline (Definition of Done §9 item 3)", () => {
  it("has exactly one preset per real AppearanceState, id === state, selector 'state'", () => {
    expect(PILL_PRESETS.map((p) => p.id)).toEqual(APPEARANCE_STATES);
    expect(PILL_PRESETS.every((p) => p.selector === "state")).toBe(true);
  });

  it("every preset governs exactly {lineStyle, lineColor, fillStyle, fillColor} — never lineThickness/lineOpacity/fillOpacity", () => {
    for (const preset of PILL_PRESETS) {
      expect([...preset.governs].sort()).toEqual(
        ["fillColor", "fillStyle", "lineColor", "lineStyle"].sort(),
      );
    }
  });

  it("every `governs` entry has a matching key in that preset's own `values` — no authoring gap", () => {
    for (const preset of PILL_PRESETS) {
      for (const governedId of preset.governs) {
        expect(Object.keys(preset.values)).toContain(governedId);
        expect(preset.values[governedId]).not.toBeUndefined();
      }
    }
  });

  it("every governed value is itself a legal option of its own field (paint fields resolve to real tokens, not stray strings)", () => {
    for (const preset of PILL_PRESETS) {
      for (const governedId of preset.governs) {
        const spec = PILL_PAINT_FIELDS.find((f) => f.id === governedId)!;
        const legal = spec.options!.map((o) => o.value);
        expect(legal).toContain(preset.values[governedId]);
      }
    }
  });

  it("assertDisjointPresets(PILL_PRESETS) does not throw — every preset shares the single 'state' selector", () => {
    expect(() => assertDisjointPresets(PILL_PRESETS)).not.toThrow();
  });

  it("governedFieldIds(PILL_PRESETS) is exactly the four paint fields, deduplicated", () => {
    expect(governedFieldIds(PILL_PRESETS).sort()).toEqual(
      ["fillColor", "fillStyle", "lineColor", "lineStyle"].sort(),
    );
  });
});

describe("The §1.4 worked example, executed against the real PILL_PRESETS (Definition of Done §9 item 3)", () => {
  it("resolveField(lineColor, {state:'wired'}, PILL_PRESETS): preset wins, resolved 'primary'", () => {
    const trace = resolveField(field("lineColor"), { state: "wired" }, PILL_PRESETS);
    expect(trace.winner).toBe("preset");
    expect(trace.winningPresetId).toBe("wired");
    expect(trace.resolved).toBe("primary");
  });

  it("resolveField(lineColor, {state:'wired', lineColor:'bbox-danger'}, PILL_PRESETS): an instance override reaches past the preset honestly", () => {
    const trace = resolveField(
      field("lineColor"),
      { state: "wired", lineColor: "bbox-danger" },
      PILL_PRESETS,
    );
    expect(trace.winner).toBe("override");
    expect(trace.resolved).toBe("bbox-danger");
    // The losing preset candidate is still visible, unchanged by the override.
    expect(trace.candidates[1]).toEqual({ layer: "preset", value: "primary", presetId: "wired" });
  });
});

describe("Pill — the real component reached through the same cascade the trace panel reads", () => {
  it("a bare Pill (state:'empty') paints the 'empty' preset's line, with no fill", () => {
    expect(bare.props.style.borderColor).toBe("var(--foreground)");
    expect(bare.props.style.background).toBe("transparent");
    expect(bare.props.style.borderStyle).toBe("solid");
  });

  it("state:'wired' paints the primary line and fill", () => {
    const wired = pillElement({ state: "wired" });
    expect(wired.props.style.borderColor).toBe("var(--primary)");
    expect(wired.props.style.background).toBe("var(--primary)");
  });

  it("state:'hidden' paints nothing — borderStyle none, fully transparent", () => {
    const hidden = pillElement({ state: "hidden" });
    expect(hidden.props.style.borderStyle).toBe("none");
    expect(hidden.props.style.background).toBe("transparent");
  });

  it("an explicit lineColor override reaches past the 'wired' preset on the real component, exactly the §1.4 worked example", () => {
    const overridden = pillElement({ state: "wired", lineColor: "bbox-danger" });
    expect(overridden.props.style.borderColor).toBe("var(--bbox-danger)");
    // The fill is untouched — only the one overridden field moved.
    expect(overridden.props.style.background).toBe("var(--primary)");
  });

  it("tone overrides the two COLOUR fields, reaching past whatever state's preset would have supplied — the SHAPE (lineStyle/fillStyle) still comes from state, since a token string is not a legal lineStyle/fillStyle value", () => {
    // state:"wired" already asks for an outline+fill shape (fillStyle
    // "solid"); tone:"danger" recolours both without changing that shape.
    const toned = pillElement({ state: "wired", tone: "danger" });
    expect(toned.props.style.borderColor).toBe("var(--bbox-danger)");
    expect(toned.props.style.background).toBe("var(--bbox-danger)");
    expect(toned.props.style.borderStyle).toBe("solid");
  });

  it("tone recolours the outline even on a hollow state (fillStyle stays 'none' — a token is not a legal fillStyle)", () => {
    const toned = pillElement({ state: "empty", tone: "danger" });
    expect(toned.props.style.borderColor).toBe("var(--bbox-danger)");
    expect(toned.props.style.background).toBe("transparent");
  });

  it("tone:'neutral' (the default) never overrides anything — state alone drives the paint", () => {
    const neutral = pillElement({ state: "wired", tone: "neutral" });
    const noTone = pillElement({ state: "wired" });
    expect(neutral.props.style).toEqual(noTone.props.style);
  });

  it("fillStyle:'semi' paints a real, non-empty, non-fully-opaque background distinct from 'none' and 'solid'", () => {
    const none = pillElement({ state: "valueSet", fillStyle: "none" });
    const semi = pillElement({ state: "valueSet", fillStyle: "semi" });
    const solid = pillElement({ state: "valueSet", fillStyle: "solid" });
    expect(none.props.style.background).toBe("transparent");
    expect(semi.props.style.background).not.toBe("transparent");
    expect(semi.props.style.background).not.toBe(solid.props.style.background);
  });

  it("children omitted renders the bare shell with no label — the real default, distinct from the demoable 'Pill' placeholder", () => {
    expect(bare.props.children).toBeUndefined();
  });

  it("lensBefore never leaks onto the rendered DOM span as an unrecognized attribute", () => {
    const withLensBefore = pillElement({ lensBefore: "old value" });
    expect(withLensBefore.props).not.toHaveProperty("lensBefore");
  });
});
