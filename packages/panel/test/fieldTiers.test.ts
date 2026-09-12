import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@bbox-ui/schema";
import { GLYPH_FIELDS, GLYPH_PRESETS } from "@bbox-ui/core";
import { classifyField } from "../src/fieldTiers";

describe("classifyField", () => {
  it("a \"glyph\" field is 'simple' — the picker trigger is what changes constantly, not an escape hatch", () => {
    const content = GLYPH_FIELDS.find((f) => f.id === "content")!;
    expect(content.kind).toBe("glyph");
    expect(classifyField(content, GLYPH_PRESETS, new Set())).toBe("simple");
  });

  it("a \"glyph\" field stays 'simple' even though it carries a hint (unlike the bare-text rule above it)", () => {
    const withHint: FieldSpec = { id: "content", label: "Content", kind: "glyph", defaultValue: "", hint: "Click to pick." };
    expect(classifyField(withHint, [], new Set())).toBe("simple");
  });

  it("Glyph's real field array tiers as: content + sizePreset simple, size (governed) + padding (continuous number) expert", () => {
    const governed = new Set(GLYPH_PRESETS.flatMap((p) => p.governs));
    const tiers = GLYPH_FIELDS.map((f) => [f.id, classifyField(f, GLYPH_PRESETS, governed)]);
    expect(tiers).toEqual([
      ["content", "simple"],
      ["sizePreset", "simple"],
      ["size", "expert"],
      ["padding", "expert"],
    ]);
  });
});
