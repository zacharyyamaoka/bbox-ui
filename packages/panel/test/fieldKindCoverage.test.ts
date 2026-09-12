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
    // HostFactsSection owns its own `disabled` routing (readOnly OR the
    // render surface isn't editable), but its own `field.kind !== "number"`
    // check is a schema-invariant GUARD (throws if HOST_FIELDS is ever
    // given a non-number entry), not a control-routing switch a readOnly
    // skip needs to precede — so it is exempt from the ORDER claim below,
    // while still asserted for mere presence here.
    "HostFactsSection.tsx",
  ];

  // WHY presence, not order, for every file in this list: an earlier
  // version of this test named itself "checks field.readOnly before any
  // field.kind branch" but only ever asserted presence — for
  // HostFactsSection.tsx that name was false (its kind check sits FIRST,
  // measured below), even though the file has no defect: nothing between
  // the two checks renders a control, so no ordering was ever load-bearing
  // there. A test whose name overclaims what it measures is worse than one
  // that says plainly what it does.
  it.each(OWN_CONTROL_FILES)("%s references field.readOnly", (rel) => {
    const text = code(read(rel));
    expect(text).toMatch(/field\.readOnly/);
  });

  /** First textual occurrence of `field.readOnly` before the first
   *  `field.kind === "…"` / `field.kind !== "…"` branch. */
  function readOnlyPrecedesKindBranch(text: string): boolean {
    const readOnlyAt = text.indexOf("field.readOnly");
    const kindBranch = text.match(/field\.kind\s*(===|!==)/);
    const kindAt = kindBranch ? text.indexOf(kindBranch[0]) : -1;
    return readOnlyAt !== -1 && kindAt !== -1 && readOnlyAt < kindAt;
  }

  // The stronger, ORDER claim genuinely holds — and genuinely matters —
  // only for the files whose `field.kind` branches are a live
  // control-routing switch: a readOnly field must hit the "disabled, no
  // live control" branch before any kind-specific control renders,
  // regardless of which kind it is. HostFactsSection is deliberately
  // excluded (see the file list above).
  const ORDER_CHECKED_FILES = ["variants/FigmaDense.tsx", "variants/RowPopover.tsx", "variants/IconStrip.tsx", "FieldTraceRow.tsx"];

  it.each(ORDER_CHECKED_FILES)("%s checks field.readOnly before its first field.kind branch", (rel) => {
    expect(readOnlyPrecedesKindBranch(code(read(rel)))).toBe(true);
  });

  it("that order check actually fires on the defect it names — mutation-tested inline", () => {
    const inverted = [
      'if (field.kind === "glyph") { return glyphControl(); }',
      "if (field.readOnly) { return disabledControl(); }",
    ].join("\n");
    const correct = [
      "if (field.readOnly) { return disabledControl(); }",
      'if (field.kind === "glyph") { return glyphControl(); }',
    ].join("\n");
    expect(readOnlyPrecedesKindBranch(inverted)).toBe(false);
    expect(readOnlyPrecedesKindBranch(correct)).toBe(true);
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
