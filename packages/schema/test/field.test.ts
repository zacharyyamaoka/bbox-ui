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

// WHY a `textarea` field gets its OWN fields array rather than joining
// `FIELDS` above: the "reads defaultValue for every field with zero
// subjects" test right below already pins `readFields(FIELDS, [])`'s exact
// shape; growing `FIELDS` would silently break that pin instead of proving
// anything about `textarea`.
const TEXTAREA_FIELDS: FieldSpec[] = [{ id: "body", label: "Body", kind: "textarea", defaultValue: "" }];

// WHY this gets its own block rather than folding into the `readFields`
// suite below: `readFields`/`resolveFields` never switch on `field.kind` at
// all (this file's own header comment) — a `textarea` field's VALUE is read
// exactly like a `text` field's, newline and all. This is the "add a unit
// test that a `textarea` field reads/resolves like `text`" ask from
// docs/TEXTBOX-EDITING-SPEC.md §2, made concrete: nothing in `readFields`
// needed to change for "textarea" to work, and this pins that so a future
// refactor that DOES special-case kind here notices it broke something.
describe("readFields — a `textarea` field behaves exactly like `text`", () => {
  it("reads its defaultValue with zero subjects, same as a text field", () => {
    expect(readFields(TEXTAREA_FIELDS, [])[0].value).toBe("");
  });

  it("reads a real (multi-line) subject value, unmodified", () => {
    const readings = readFields(TEXTAREA_FIELDS, [{ body: "line one\nline two" }]);
    expect(readings[0].value).toBe("line one\nline two");
  });

  it("agrees/disagrees across subjects exactly like a text field would", () => {
    const agreeing = readFields(TEXTAREA_FIELDS, [{ body: "same" }, { body: "same" }]);
    expect(agreeing[0].value).toBe("same");
    const disagreeing = readFields(TEXTAREA_FIELDS, [{ body: "a" }, { body: "b" }]);
    expect(disagreeing[0].value).toBe(MIXED);
  });

  it("falls back to defaultValue per-subject when a subject omits the key", () => {
    expect(readFields(TEXTAREA_FIELDS, [{ body: "" }, {}])[0].value).toBe("");
  });
});

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
