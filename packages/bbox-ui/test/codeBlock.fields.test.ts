import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, governedFieldIds, resolveField, toArgTypes } from "@bbox-ui/schema";

import { CODE_BLOCK_DEFAULT_VALUE, CODE_BLOCK_FIELDS } from "../src/codeBlock.fields";
import {
  CODE_BLOCK_GUTTER_PX,
  CODE_BLOCK_LANGUAGE_LABELS,
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_LINES,
  CODE_BLOCK_LOOK_LABELS,
  CODE_BLOCK_LOOKS,
  CODE_BLOCK_SIZES,
  codeBlockCharPx,
  codeBlockFontPx,
  codeBlockWidthPx,
} from "../src/codeBlock.layout";
import { CODE_BLOCK_LOOK_GOVERNS, CODE_BLOCK_PRESETS, codeBlockLookValues } from "../src/codeBlock.presets";
import { resolveCodeBlockPresentation } from "../src/codeBlock";
import { codeBlockLanguageExtension } from "../src/codeBlockLanguages";

/**
 * `CodeBlock` mounts CodeMirror in a layout effect, so unlike `TextBox` it
 * cannot be called as a plain function to read its defaults off the
 * returned element. `resolveCodeBlockPresentation` is the exported seam the
 * component itself paints from — reading defaults off THAT (with no props)
 * is the same "fail the moment the real default changes" guarantee
 * `textBox.fields.test.ts` gets from the element.
 */
const bare = resolveCodeBlockPresentation({});

function field(id: string) {
  const found = CODE_BLOCK_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no CODE_BLOCK_FIELDS entry for "${id}"`);
  return found;
}

describe("CODE_BLOCK_FIELDS", () => {
  it("has exactly CodeBlock's controllable props, in panel order", () => {
    expect(CODE_BLOCK_FIELDS.map((f) => f.id)).toEqual([
      "look",
      "language",
      "size",
      "sizePx",
      "lineNumbers",
      "lines",
      "wrap",
      "columns",
      "paddingTop",
      "paddingBot",
      "paddingLeft",
      "paddingRight",
      "placeholder",
      "value",
    ]);
  });

  it("look's options are exactly the real CodeBlockLook union, labelled from the same table", () => {
    expect(field("look").options?.map((o) => o.value)).toEqual([...CODE_BLOCK_LOOKS]);
    expect(field("look").options?.map((o) => o.label)).toEqual(CODE_BLOCK_LOOKS.map((l) => CODE_BLOCK_LOOK_LABELS[l]));
    expect(field("look").defaultValue).toBe(bare.look);
  });

  it("language's options are exactly the real CodeBlockLanguage union, and every one has a parser", () => {
    expect(field("language").options?.map((o) => o.value)).toEqual([...CODE_BLOCK_LANGUAGES]);
    expect(Object.keys(CODE_BLOCK_LANGUAGE_LABELS).sort()).toEqual([...CODE_BLOCK_LANGUAGES].sort());
    for (const language of CODE_BLOCK_LANGUAGES) {
      // plaintext is the one language whose "parser" is the empty extension.
      const extension = codeBlockLanguageExtension(language);
      if (language === "plaintext") expect(extension).toEqual([]);
      else expect(extension).toBeTruthy();
    }
    expect(field("language").defaultValue).toBe("python");
  });

  it("size's options are the descending ladder plus custom last, and the default resolves to md's 16px", () => {
    expect(field("size").options?.map((o) => o.value)).toEqual(["xl", "lg", "md", "sm", "custom"]);
    expect(field("size").options?.map((o) => o.value).filter((v) => v !== "custom").sort()).toEqual(
      Object.keys(CODE_BLOCK_SIZES).sort(),
    );
    expect(field("size").defaultValue).toBe("md");
    expect(bare.fontPx).toBe(CODE_BLOCK_SIZES.md);
    expect(field("size").group).toBe("size");
    expect(field("sizePx").group).toBe("size");
  });

  it("sizePx's declared default equals the real default, and only custom reads it", () => {
    expect(field("sizePx").defaultValue).toBe(bare.fontPx);
    expect(codeBlockFontPx("custom", 11)).toBe(11);
    expect(codeBlockFontPx("lg", 999)).toBe(CODE_BLOCK_SIZES.lg);
    expect(resolveCodeBlockPresentation({ size: "custom", sizePx: 11 }).fontPx).toBe(11);
  });

  it("every look-governed field's declared default equals the block look's own value (the default look)", () => {
    const block = codeBlockLookValues("block");
    expect(field("lineNumbers").defaultValue).toBe(block.lineNumbers);
    expect(field("lines").defaultValue).toBe(block.lines);
    expect(field("paddingTop").defaultValue).toBe(block.paddingTop);
    expect(field("paddingBot").defaultValue).toBe(block.paddingBot);
    expect(field("paddingLeft").defaultValue).toBe(block.paddingLeft);
    expect(field("paddingRight").defaultValue).toBe(block.paddingRight);
    // …and those are what a bare <CodeBlock> actually paints from.
    expect(bare.lineNumbers).toBe(block.lineNumbers);
    expect(bare.lines).toBe(block.lines);
    expect(bare.paddingTop).toBe(block.paddingTop);
    expect(bare.paddingLeft).toBe(block.paddingLeft);
  });

  it("lines's options are exactly the real CodeBlockLines union", () => {
    expect(field("lines").options?.map((o) => o.value)).toEqual([...CODE_BLOCK_LINES]);
  });

  it("wrap and columns default off (no wrap, fill the host)", () => {
    expect(field("wrap").defaultValue).toBe(false);
    expect(field("columns").defaultValue).toBe(0);
    expect(bare.width).toBeUndefined();
  });

  it("value's default is the greet specimen, as a textarea-kind field", () => {
    expect(field("value").kind).toBe("textarea");
    expect(field("value").defaultValue).toBe(CODE_BLOCK_DEFAULT_VALUE);
    expect(CODE_BLOCK_DEFAULT_VALUE.split("\n")).toHaveLength(2);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    const args = defaultArgs(CODE_BLOCK_FIELDS);
    expect(Object.keys(args).sort()).toEqual(CODE_BLOCK_FIELDS.map((f) => f.id).sort());
    for (const f of CODE_BLOCK_FIELDS) expect(args[f.id]).toBe(f.defaultValue);
  });

  it("toArgTypes maps segments to select, toggles to boolean, numbers to number, the document to text", () => {
    const argTypes = toArgTypes(CODE_BLOCK_FIELDS);
    expect(argTypes.look.control).toBe("select");
    expect(argTypes.language.control).toBe("select");
    expect(argTypes.lineNumbers.control).toBe("boolean");
    expect(argTypes.columns.control).toBe("number");
    expect(argTypes.value.control).toBe("text");
  });
});

describe("CODE_BLOCK_PRESETS — a look is a preset over the same fields", () => {
  it("has one preset per look, selected on `look`, all governing the same closed set", () => {
    expect(CODE_BLOCK_PRESETS.map((p) => p.id)).toEqual([...CODE_BLOCK_LOOKS]);
    for (const preset of CODE_BLOCK_PRESETS) {
      expect(preset.selector).toBe("look");
      expect(preset.governs).toEqual([...CODE_BLOCK_LOOK_GOVERNS]);
      expect(Object.keys(preset.values).sort()).toEqual([...preset.governs].sort());
    }
    expect(() => assertDisjointPresets(CODE_BLOCK_PRESETS)).not.toThrow();
    expect(governedFieldIds(CODE_BLOCK_PRESETS).sort()).toEqual([...CODE_BLOCK_LOOK_GOVERNS].sort());
  });

  it("the field look is 'a code block without line numbers' — one line, no gutter, an input's padding", () => {
    const fieldLook = codeBlockLookValues("field");
    expect(fieldLook.lineNumbers).toBe(false);
    expect(fieldLook.lines).toBe("single");
    const resolved = resolveCodeBlockPresentation({ look: "field" });
    expect(resolved.lineNumbers).toBe(false);
    expect(resolved.lines).toBe("single");
    expect(resolved.paddingLeft).toBe(fieldLook.paddingLeft);
  });

  it("the component and the schema resolve a look to the SAME values (override beats preset beats default)", () => {
    for (const look of CODE_BLOCK_LOOKS) {
      const fromComponent = resolveCodeBlockPresentation({ look });
      for (const id of CODE_BLOCK_LOOK_GOVERNS) {
        const fromSchema = resolveField(field(id), { look }, CODE_BLOCK_PRESETS).resolved;
        expect(fromComponent[id], `${look}.${id}`).toBe(fromSchema);
      }
    }
    // An explicit prop wins over its look in both places.
    expect(resolveCodeBlockPresentation({ look: "field", lineNumbers: true }).lineNumbers).toBe(true);
    expect(resolveField(field("lineNumbers"), { look: "field", lineNumbers: true }, CODE_BLOCK_PRESETS).resolved).toBe(true);
  });
});

describe("codeBlockWidthPx — columns are the authored fact, pixels derive", () => {
  it("returns undefined for 0 (fill the host), and pads + gutters + cells otherwise", () => {
    expect(codeBlockWidthPx(0, 16, true, 16, 16)).toBeUndefined();
    const cells = 40 * codeBlockCharPx(16);
    expect(codeBlockWidthPx(40, 16, true, 16, 16)).toBe(Math.round(16 + 16 + CODE_BLOCK_GUTTER_PX + cells));
    expect(codeBlockWidthPx(40, 16, false, 16, 16)).toBe(Math.round(16 + 16 + cells));
  });

  it("flows through resolveCodeBlockPresentation as the box's width", () => {
    const resolved = resolveCodeBlockPresentation({ columns: 40 });
    expect(resolved.width).toBe(codeBlockWidthPx(40, 16, true, 16, 16));
  });
});
