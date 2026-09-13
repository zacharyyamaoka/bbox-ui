import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@bbox-ui/schema";
import { DENSITY, STANDARD_CONTROLS, type BoundField, type InspectorSection, type SectionRow } from "../src/sections/contract";
import { controlKindFor } from "../src/sections/StandardRow";
import { derivedSummary, isEffectivelyEmpty, listSummary, sectionTagCount } from "../src/sections/shared";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

function field(over: Partial<FieldSpec> = {}): FieldSpec {
  return { id: "f", label: "F", kind: "number", defaultValue: 0, ...over } as FieldSpec;
}
function bound(over: Partial<BoundField> = {}): BoundField {
  return {
    field: field(),
    targetId: "i1",
    subjects: [{ id: "i1", props: {} }],
    presets: [],
    governed: new Set<string>(),
    onChange: () => {},
    onClearOverride: () => {},
    ...over,
  };
}
function section(over: Partial<InspectorSection> = {}): InspectorSection {
  return { id: "s", label: "S", rows: [], actions: [], ...over };
}

describe("a folded thing says one compact line", () => {
  it("names its members, or says empty", () => {
    expect(listSummary(0)).toBe("empty");
    expect(listSummary(1)).toBe("1 member");
    expect(listSummary(4)).toBe("4 members");
  });

  it("counts a pair as the two values it writes, not as one row", () => {
    const pair: SectionRow = { kind: "pair", fields: [bound(), bound({ field: field({ id: "g" }) })] };
    expect(derivedSummary(section({ rows: [pair] }))).toBe("2 properties");
  });

  it("names each list rather than totalling them, so two lists read as themselves", () => {
    const rows = [
      { kind: "list" as const, list: { id: "a", label: "Left", count: 1, node: null, actions: [] } },
      { kind: "list" as const, list: { id: "b", label: "Right", count: 0, node: null, actions: [] } },
    ];
    expect(derivedSummary(section({ rows }))).toBe("1 left · 0 right");
  });
});

describe("a section's default fold state is re-derived, never remembered", () => {
  it("calls a section of empty lists effectively empty", () => {
    const rows = [{ kind: "list" as const, list: { id: "a", label: "Left", count: 0, node: null, actions: [] } }];
    expect(isEffectivelyEmpty(section({ rows }))).toBe(true);
  });

  it("stops calling it empty the moment one list gains a member", () => {
    const rows = [{ kind: "list" as const, list: { id: "a", label: "Left", count: 1, node: null, actions: [] } }];
    expect(isEffectivelyEmpty(section({ rows }))).toBe(false);
  });

  it("never calls a section with a property row empty", () => {
    expect(isEffectivelyEmpty(section({ rows: [{ kind: "field", field: bound() }] }))).toBe(false);
  });
});

describe("a section header's aggregate tag is the rows' own rule, read twice", () => {
  const overridden = bound({ field: field({ id: "radius" }), subjects: [{ id: "i1", props: { radius: 17 } }] });

  it("counts an overridden row", () => {
    expect(sectionTagCount(section({ rows: [{ kind: "field", field: overridden }] }))).toEqual({ tag: "override", count: 1 });
  });

  it("says nothing when every row is at its default", () => {
    expect(sectionTagCount(section({ rows: [{ kind: "field", field: bound() }] }))).toBeNull();
  });

  it("lets MIXED outrank override — a disagreement is the more urgent fact", () => {
    const mixed = bound({
      field: field({ id: "radius" }),
      subjects: [
        { id: "i1", props: { radius: 1 } },
        { id: "i2", props: { radius: 2 } },
      ],
    });
    expect(sectionTagCount(section({ rows: [{ kind: "field", field: mixed }, { kind: "field", field: overridden }] }))).toEqual({
      tag: "mixed",
      count: 1,
    });
  });

  it("ignores a row with no cascade behind it, so a canvas position never reads as an override", () => {
    const hostFact = bound({ field: field({ id: "x" }), subjects: [{ id: "i1", props: { x: 80 } }], provenance: "none" });
    expect(sectionTagCount(section({ rows: [{ kind: "field", field: hostFact }] }))).toBeNull();
  });

  it("ignores a member list — a list has no value to override", () => {
    const rows = [{ kind: "list" as const, list: { id: "a", label: "Left", count: 3, node: null, actions: [] } }];
    expect(sectionTagCount(section({ rows }))).toBeNull();
  });
});

describe("the standard control list stays closed", () => {
  it("resolves every FieldKind to a member of it", () => {
    // `textarea` is deliberately absent: it is not a FieldKind on `main`.
    // A peer branch (the TextBox editing lane) adds it, and `controlKindFor`
    // already falls through to "text" for anything it does not name — so
    // this list grows when that kind lands, not before.
    const kinds = [
      controlKindFor(field({ kind: "number" })),
      controlKindFor(field({ kind: "toggle" })),
      controlKindFor(field({ kind: "text" })),
      controlKindFor(field({ kind: "segments", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] })),
    ];
    for (const kind of kinds) expect(STANDARD_CONTROLS).toContain(kind);
  });

  it("sends a WIDE enum to a dropdown even when it has only three options", () => {
    // The real regression: "Small · 8px / Medium · 12px / Large · 18px" is
    // three options and 37 characters, and segmenting it clipped the third
    // off the panel edge. The budget is measured in characters for exactly
    // this reason, so the count alone must not decide.
    const wide = field({
      kind: "segments",
      options: [
        { value: "s", label: "Small · 8px" },
        { value: "m", label: "Medium · 12px" },
        { value: "l", label: "Large · 18px" },
      ],
    });
    expect(controlKindFor(wide)).toBe("dropdown");
    const narrow = field({
      kind: "segments",
      options: [
        { value: "r", label: "Row" },
        { value: "c", label: "Column" },
      ],
    });
    expect(controlKindFor(narrow)).toBe("segmented");
  });
});

describe("Compact is genuinely tighter than Roomy", () => {
  it("shortens every dimension it governs", () => {
    for (const key of ["titleHeight", "gutter", "bodyBottom", "titleSize"] as const) {
      expect(DENSITY.compact[key]).toBeLessThan(DENSITY.comfortable[key]);
    }
  });
});

/**
 * Structural gates. These read source text, which is unusual — and is the
 * point: both failures they guard were invisible to every value-level test
 * that existed at the time.
 */
describe("one row renderer, one list header", () => {
  it("builds the section row out of FigmaDense's own parts rather than a copy", () => {
    // WHY: round 1's section row was a 835-line copy of FigmaDense's. Main
    // then replaced the provenance DOT with a plain-word tag and the "×"
    // with a reset icon, and the copy received neither — so the rebase
    // surfaced a panel whose rows disagreed with the panel beside it. A
    // copy is the defect; importing is the fix, and this is what pins it.
    const source = read("sections/StandardRow.tsx");
    expect(source).toMatch(/from "\.\.\/variants\/FigmaDense"/);
    for (const part of ["RowLabel", "DenseControl", "TraceChain", "readRow"]) {
      expect(source).toContain(part);
    }
    expect(source).not.toMatch(/function RowLabel/);
    expect(source).not.toMatch(/field-provenance-dot/);
  });

  it("lets a member list render with no header of its own", () => {
    // WHY: the double header Zach screenshotted on 2026-09-12 — a section's
    // compact summary row sitting on top of the list control's own header.
    // The fix is that the control CAN be headless and the section layer is
    // the only thing that draws a header.
    const list = read("members/List.tsx");
    expect(list).toMatch(/chrome === "none"/);
    const headless = list.slice(list.indexOf("const headless"), list.indexOf("return (\n    <section data-slot=\"members-control\" data-members-control=\"list\" style={sectionStyle}>"));
    expect(headless).not.toContain("<SectionHeader");
  });

  it("draws every header through the one FoldRow", () => {
    const shared = read("sections/shared.tsx");
    expect(shared).toContain("FoldRow");
    for (const variant of ["Hairline", "Ledger", "Strata"]) {
      const source = read(`sections/variants/${variant}.tsx`);
      expect(source).toMatch(/from "\.\.\/FoldRow"/);
      // No design may hand-draw a title row; the shared component is the
      // only thing that knows a header's shape.
      expect(source).not.toMatch(/data-slot="section-title"/);
      expect(source).not.toMatch(/data-slot="list-header"/);
    }
  });

  it("keeps the chevron out of the resting state of an OPEN row", () => {
    // Zach, 2026-09-12: "the chevron should appear just on hover." The
    // browser journey proves the pixels; this proves the rule survives a
    // refactor that never runs a browser.
    const foldRow = read("sections/FoldRow.tsx");
    expect(foldRow).toContain("const chevronVisible = foldable && (!open || revealed);");
    expect(foldRow).toContain("pointerEvents: visible ? \"auto\" : \"none\"");
  });
});
