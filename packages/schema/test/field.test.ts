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
});
