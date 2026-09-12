import { describe, expect, it } from "vitest";
import { MIXED, readFields, type FieldSpec } from "../src/field";

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
  },
  { id: "label", label: "Label", kind: "text", defaultValue: "Port" },
];

describe("readFields", () => {
  it("reads defaultValue for every field with zero subjects", () => {
    const readings = readFields(FIELDS, []);
    expect(readings).toEqual([
      { field: FIELDS[0], value: "empty" },
      { field: FIELDS[1], value: "Port" },
    ]);
  });

  it("reads the shared value when every subject agrees", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }, { state: "wired" }]);
    expect(readings[0].value).toBe("wired");
  });

  it("reads MIXED the instant subjects disagree", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }, { state: "empty" }]);
    expect(readings[0].value).toBe(MIXED);
  });

  it("falls back to defaultValue per-subject when a subject omits the key", () => {
    const readings = readFields(FIELDS, [{ state: "empty" }, {}]);
    // {} reads as "empty" (the field default) too, so both subjects agree.
    expect(readings[0].value).toBe("empty");
  });

  it("a single subject can never read MIXED", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }]);
    expect(readings[0].value).not.toBe(MIXED);
  });

  // WHY this is its own block with its OWN field array, rather than adding a
  // third entry to the shared `FIELDS` above: `readFields` never branches on
  // `field.kind` at all — it reads and compares `FieldValue`s generically —
  // so a "glyph" field's stored value (an encoded string,
  // @bbox-ui/glyph-content's grammar) is read, defaulted and MIXED-detected
  // identically to a "text" field's. A local array pins that down without
  // making every other test in this file re-account for a third field.
  describe("a glyph field", () => {
    const GLYPH_FIELDS: FieldSpec[] = [{ id: "content", label: "Content", kind: "glyph", defaultValue: "" }];

    it("reads its defaultValue with zero subjects, same as a text field", () => {
      const readings = readFields(GLYPH_FIELDS, []);
      expect(readings).toEqual([{ field: GLYPH_FIELDS[0], value: "" }]);
    });

    it("reads the shared encoded string when subjects agree", () => {
      const readings = readFields(GLYPH_FIELDS, [{ content: "lucide:rocket" }, { content: "lucide:rocket" }]);
      expect(readings[0].value).toBe("lucide:rocket");
    });

    it("reads MIXED across two different encoded strings", () => {
      const readings = readFields(GLYPH_FIELDS, [{ content: "lucide:rocket" }, { content: "emoji:🚀" }]);
      expect(readings[0].value).toBe(MIXED);
    });
  });
});
