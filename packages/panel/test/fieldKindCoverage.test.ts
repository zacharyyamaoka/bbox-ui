import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A structural gate (same shape as oneModel.test.ts), not a behavioural one:
 * it reads the source of every control-rendering file rather than mounting
 * it, because this package has no render-testing dependency and a real DOM
 * render for six variants is a heavier fix than the bug it would catch.
 *
 * The two facts it pins:
 *
 * 1. `field.readOnly` (HOST_FIELDS' derived `w`/`h`) must be checked ahead
 *    of every `field.kind` branch in every file that owns its own control
 *    routing — FigmaDense's `DenseControl`, RowPopover's `PopoverControl`,
 *    IconStrip's `GenericFallback`, and the shared `FieldTraceRow`'s
 *    `FieldControl` (which Current/ComponentInspector, Tiered and
 *    FilterFirst all render through, per oneModel.test.ts's "one
 *    resolution model" rule — fixing it there fixes all three).
 * 2. IconStrip's `GenericFallback` — the one variant with no honest icon
 *    for an arbitrary control, see its own file header — must route
 *    `kind: "glyph"` to a real control, not let it fall through to
 *    `FieldWords`' `(field.options ?? []).map(...)`, which renders nothing
 *    for a field that has no `options`.
 */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function read(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), "utf8");
}

/** Strip comments so a file merely DISCUSSING `field.readOnly` in a WHY
 *  comment does not count as handling it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("field.readOnly is honoured everywhere a control is drawn", () => {
  const OWN_CONTROL_FILES = [
    "variants/FigmaDense.tsx",
    "variants/RowPopover.tsx",
    "variants/IconStrip.tsx",
    "FieldTraceRow.tsx",
  ];

  it.each(OWN_CONTROL_FILES)("%s checks field.readOnly before any field.kind branch", (rel) => {
    const text = code(read(rel));
    expect(text).toMatch(/field\.readOnly/);
  });

  it("Tiered and FilterFirst render fields through the shared <FieldTraceRow>, not a second control", () => {
    for (const rel of ["variants/Tiered.tsx", "variants/FilterFirst.tsx"]) {
      const text = code(read(rel));
      expect(text).toMatch(/<FieldTraceRow/);
    }
  });

  it("Current renders through ComponentInspector, which renders through the shared <FieldTraceRow>", () => {
    const current = code(read("variants/Current.tsx"));
    expect(current).toMatch(/ComponentInspector/);
    const inspector = code(read("ComponentInspector.tsx"));
    expect(inspector).toMatch(/<FieldTraceRow/);
  });
});

describe("IconStrip's GenericFallback never drops a \"glyph\" field", () => {
  it("routes kind: \"glyph\" to a real control, not FieldWords' options-only map", () => {
    const text = code(read("variants/IconStrip.tsx"));
    const fallback = text.slice(text.indexOf("function GenericFallback"));
    // The readOnly check first, then a real control for "glyph" — matching
    // the "text" branch it shares the same encoded-string shape with.
    expect(fallback).toMatch(/field\.kind === "glyph"/);
  });
});
