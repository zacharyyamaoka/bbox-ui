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

  // WHY presence here and order separately below: they are two different
  // claims, and an earlier version of this test named itself for the
  // stronger one while only ever measuring the weaker. A test whose name
  // overclaims what it measures is worse than one that says plainly what
  // it does.
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
  //
  // WHY each entry names its ROUTING FUNCTION and the check is sliced to
  // it, rather than run over the whole file: the claim is about one
  // function's branch order, and a file-wide `indexOf` silently measures
  // something else the moment any OTHER function in the same file grows a
  // `field.kind` branch of its own. That is not hypothetical — IconStrip's
  // `FieldText` gained `if (field.kind === "textarea")` (the TextBox
  // editing work) some 70 lines ABOVE `GenericFallback`, which made this
  // test fail while the invariant it names still held perfectly: nothing
  // reaches `FieldText` except through `GenericFallback`, i.e. AFTER the
  // readOnly check. Slicing is also the idiom this file's last describe
  // block already uses.
  const ORDER_CHECKED_FILES: [file: string, routingFn: string][] = [
    ["variants/FigmaDense.tsx", "DenseControl"],
    ["variants/RowPopover.tsx", "PopoverControl"],
    ["variants/IconStrip.tsx", "GenericFallback"],
    ["FieldTraceRow.tsx", "FieldControl"],
  ];

  it.each(ORDER_CHECKED_FILES)("%s's %s checks field.readOnly before its first field.kind branch", (rel, fn) => {
    const text = code(read(rel));
    const at = text.indexOf(`function ${fn}`);
    expect(at, `${rel} has no function ${fn} — the routing function was renamed`).toBeGreaterThan(-1);
    expect(readOnlyPrecedesKindBranch(text.slice(at))).toBe(true);
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
