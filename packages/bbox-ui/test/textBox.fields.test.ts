import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { PADDING_FIELDS, TEXT_BOX_FIELDS, TEXT_BOX_PRESETS } from "../src/textBox.fields";
import { TextBox } from "../src/textBox";
import { TEXT_BOX_SIZES ,
  TEXT_BOX_ALIGN_ITEMS,
  TEXT_BOX_FONT_STACKS,
  TEXT_BOX_JUSTIFY_CONTENT,
  TEXT_BOX_HORIZONTAL_ALIGNS,
  TEXT_BOX_VERTICAL_ALIGNS,} from "../src/textBox.layout";

/**
 * `TextBox` uses no hooks — calling it directly, as a plain function,
 * returns the exact React element it would render, with every default
 * already applied by its own `= "..."` destructuring. Reading defaults off
 * THIS (not off a hand-retyped literal) is what makes this file fail the
 * moment `textBox.tsx`'s real default changes — `port.fields.test.ts`'s
 * own pattern (T0), generalized. No DOM/jsdom needed: plain element props.
 */
function textBoxElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (TextBox as any)(props);
}

function field(id: string) {
  const found = TEXT_BOX_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no TEXT_BOX_FIELDS entry for "${id}"`);
  return found;
}

const bare = textBoxElement();

describe("TEXT_BOX_FIELDS", () => {
  // WHY these compare against the LOOKUP TABLES and not against the arrays
  // the options are built from: an earlier version did the latter, which is a
  // tautology — the options are `ARRAY.map(...)`, so comparing them to ARRAY
  // can never fail. The tables are an independent source that a real
  // consumer reads, exactly the pattern `size` already uses against
  // TEXT_BOX_SIZES, so a member added to one and not the other goes red.
  it("font's options are exactly the real TextBoxFont union", () => {
    expect(TEXT_BOX_FIELDS.find((f) => f.id === "font")?.options?.map((o) => o.value).sort()).toEqual(
      Object.keys(TEXT_BOX_FONT_STACKS).sort(),
    );
  });

  it("align's options are exactly the real vertical-align union", () => {
    expect(TEXT_BOX_FIELDS.find((f) => f.id === "align")?.options?.map((o) => o.value).sort()).toEqual(
      Object.keys(TEXT_BOX_ALIGN_ITEMS).sort(),
    );
  });

  it("justify's options are exactly the real horizontal-align union", () => {
    expect(TEXT_BOX_FIELDS.find((f) => f.id === "justify")?.options?.map((o) => o.value).sort()).toEqual(
      Object.keys(TEXT_BOX_JUSTIFY_CONTENT).sort(),
    );
  });

  it("has exactly TextBox's real props, in panel order", () => {
    expect(TEXT_BOX_FIELDS.map((f) => f.id)).toEqual([
      "size",
      "paddingTop",
      "paddingBot",
      "paddingLeft",
      "paddingRight",
      "font",
      "align",
      "justify",
      "children",
    ]);
  });

  it("PADDING_FIELDS is the same four fields, in the same order, spread into TEXT_BOX_FIELDS", () => {
    expect(PADDING_FIELDS.map((f) => f.id)).toEqual([
      "paddingTop",
      "paddingBot",
      "paddingLeft",
      "paddingRight",
    ]);
    for (const paddingField of PADDING_FIELDS) {
      expect(field(paddingField.id)).toEqual(paddingField);
    }
  });

  it("size's declared default equals TextBox's real default (textBox.tsx: size = \"md\")", () => {
    expect(field("size").defaultValue).toBe(bare.props["data-size"]);
    expect(bare.props.style.fontSize).toBe(TEXT_BOX_SIZES[field("size").defaultValue as keyof typeof TEXT_BOX_SIZES]);
  });

  it("size's options are the board's own descending order, not ascending object-key order", () => {
    expect(field("size").options?.map((o) => o.value)).toEqual(["xl", "lg", "md", "sm"]);
    expect(field("size").options?.map((o) => o.value).sort()).toEqual(
      Object.keys(TEXT_BOX_SIZES).sort(),
    );
  });

  it("every padding field's declared default equals TextBox's real default (all 0)", () => {
    expect(field("paddingTop").defaultValue).toBe(bare.props.style.paddingTop);
    expect(field("paddingBot").defaultValue).toBe(bare.props.style.paddingBottom);
    expect(field("paddingLeft").defaultValue).toBe(bare.props.style.paddingLeft);
    expect(field("paddingRight").defaultValue).toBe(bare.props.style.paddingRight);
  });

  it("font's declared default equals TextBox's real default (textBox.tsx: font = \"sans\")", () => {
    expect(field("font").defaultValue).toBe(bare.props["data-font"]);
  });

  it("align's declared default equals TextBox's real default, mapped to the real CSS alignItems", () => {
    expect(field("align").defaultValue).toBe(bare.props["data-align"]);
    expect(bare.props.style.alignItems).toBe("center");
  });

  it("justify's declared default equals TextBox's real default, mapped to the real CSS justifyContent", () => {
    expect(field("justify").defaultValue).toBe(bare.props["data-justify"]);
    expect(bare.props.style.justifyContent).toBe("center");
  });

  it("align/justify's non-default options map to the real flex-start/flex-end CSS values", () => {
    expect(textBoxElement({ align: "top" }).props.style.alignItems).toBe("flex-start");
    expect(textBoxElement({ align: "bottom" }).props.style.alignItems).toBe("flex-end");
    expect(textBoxElement({ justify: "left" }).props.style.justifyContent).toBe("flex-start");
    expect(textBoxElement({ justify: "right" }).props.style.justifyContent).toBe("flex-end");
  });

  it("children has NO real destructured default on TextBox — omitting it renders a truly empty box, not the literal string \"Text Box\"", () => {
    // `{children}` alone (no `= "..."`) renders `undefined` when omitted.
    expect(bare.props.children).toBeUndefined();
    // "Text Box" is therefore a deliberate demoable placeholder, not a
    // fact about the component — pinned consciously, mirroring
    // port.fields.ts's own `children` deviation (docs/T1-SPEC.md §4.2).
    expect(field("children").defaultValue).toBe("Text Box");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(TEXT_BOX_FIELDS)).toEqual({
      size: field("size").defaultValue,
      paddingTop: field("paddingTop").defaultValue,
      paddingBot: field("paddingBot").defaultValue,
      paddingLeft: field("paddingLeft").defaultValue,
      paddingRight: field("paddingRight").defaultValue,
      font: field("font").defaultValue,
      align: field("align").defaultValue,
      justify: field("justify").defaultValue,
      children: field("children").defaultValue,
    });
  });

  it("toArgTypes maps every segments field to a select control, number fields to number, children to text", () => {
    const argTypes = toArgTypes(TEXT_BOX_FIELDS);
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.paddingTop.control).toBe("number");
    expect(argTypes.paddingBot.control).toBe("number");
    expect(argTypes.paddingLeft.control).toBe("number");
    expect(argTypes.paddingRight.control).toBe("number");
    expect(argTypes.font.control).toBe("select");
    expect(argTypes.align.control).toBe("select");
    expect(argTypes.justify.control).toBe("select");
    expect(argTypes.children.control).toBe("text");
  });

  it("has no presets — pure typography, no board evidence for a state axis", () => {
    expect(TEXT_BOX_PRESETS).toEqual([]);
    // Still real PresetSpec[] data every consumer can .map() over without
    // a null check — assertDisjointPresets must not throw on empty input.
    expect(() => assertDisjointPresets(TEXT_BOX_PRESETS)).not.toThrow();
  });
});
