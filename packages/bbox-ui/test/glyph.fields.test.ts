import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { GLYPH_FIELDS, GLYPH_PRESETS } from "../src/glyph.fields";
import { Glyph } from "../src/glyph";
import { GLYPH_SIZES } from "../src/glyph.layout";

/**
 * `Glyph` uses no hooks — calling it directly, as a plain function, returns
 * the exact React element tree it would render, with every default already
 * applied by its own `= "..."` destructuring. Reading defaults off THIS
 * (not off a hand-retyped literal) is what makes this file fail the moment
 * `glyph.tsx`'s real default changes, instead of silently drifting alongside
 * a copy that only agrees with itself. No DOM/jsdom is needed: these are
 * plain element objects, never rendered or mounted. Same pattern as T0's
 * `port.fields.test.ts`.
 */
function glyphElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Glyph as any)(props);
}

function field(id: string) {
  const found = GLYPH_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no GLYPH_FIELDS entry for "${id}"`);
  return found;
}

const bareGlyph = glyphElement();

describe("GLYPH_FIELDS", () => {
  it("has exactly Glyph's three real props, in panel order", () => {
    expect(GLYPH_FIELDS.map((f) => f.id)).toEqual(["size", "padding", "children"]);
  });

  it("size's declared default equals Glyph's real default (glyph.tsx: size = \"xl\")", () => {
    expect(field("size").defaultValue).toBe("xl");
    expect(bareGlyph.props["data-size"]).toBe(field("size").defaultValue);
    expect(bareGlyph.props.style.width).toBe(GLYPH_SIZES.xl);
    expect(bareGlyph.props.style.fontSize).toBe(GLYPH_SIZES.xl);
  });

  it("size cascades — a header can hand its rung down to Glyph the same way it hands one to a Port", () => {
    expect(field("size").cascades).toBe(true);
  });

  it("padding's declared default equals Glyph's real default (glyph.tsx: padding = 0)", () => {
    expect(field("padding").defaultValue).toBe(0);
    expect(bareGlyph.props.style.padding).toBe(field("padding").defaultValue);
  });

  it("children has NO real destructured default on Glyph — omitting it renders an empty square, not the literal placeholder", () => {
    // The span's own `children` prop is exactly what was passed in — no
    // fallback branch exists (unlike Port's conditional PortLabel), so an
    // omitted `children` reads back as `undefined`, proving the real
    // default behavior is "empty slot", which `FieldValue` (string |
    // number | boolean) cannot encode.
    expect(bareGlyph.props.children).toBeUndefined();
    // "🔍" is therefore a deliberate demoable placeholder, not a fact
    // about the component — pinned consciously here rather than asserted
    // as if it were glyph.tsx's own default. See glyph.fields.ts's comment
    // on this field and docs/T1-SPEC.md §4.1 for the full disagreement.
    expect(field("children").defaultValue).toBe("🔍");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(GLYPH_FIELDS)).toEqual({
      size: field("size").defaultValue,
      padding: field("padding").defaultValue,
      children: field("children").defaultValue,
    });
  });

  it("size's options are exactly the real GlyphSize union (glyph.layout.ts's own GLYPH_SIZES keys)", () => {
    expect(field("size").options?.map((o) => o.value)).toEqual(Object.keys(GLYPH_SIZES));
  });

  it("every size option resolves to Glyph's real rendered footprint for that size", () => {
    for (const option of field("size").options ?? []) {
      const el = glyphElement({ size: option.value });
      expect(el.props.style.width).toBe(GLYPH_SIZES[option.value as keyof typeof GLYPH_SIZES]);
      expect(el.props.style.height).toBe(GLYPH_SIZES[option.value as keyof typeof GLYPH_SIZES]);
    }
  });

  it("padding is additive to the rendered footprint, never a fourth field baked into size (docs/T1-SPEC.md §4.1)", () => {
    const el = glyphElement({ padding: 8 });
    expect(el.props.style.width).toBe(GLYPH_SIZES.xl);
    expect(el.props.style.padding).toBe(8);
  });

  it("toArgTypes maps size to a select control, padding to number, children to text", () => {
    const argTypes = toArgTypes(GLYPH_FIELDS);
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.padding.control).toBe("number");
    expect(argTypes.padding.min).toBe(0);
    expect(argTypes.padding.max).toBe(24);
    expect(argTypes.padding.step).toBe(1);
    expect(argTypes.children.control).toBe("text");
  });

  it("has no presets — nothing on the board or in any donor gives Glyph a state axis (docs/T1-SPEC.md §4.1)", () => {
    expect(GLYPH_PRESETS).toEqual([]);
  });
});
