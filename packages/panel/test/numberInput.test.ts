import { describe, expect, it } from "vitest";
import { blurOutcome, clampTo, commitFor } from "../src/NumberInput";

/**
 * The three rules the judge broke in round 1, and the hazard round 2 named,
 * as pure functions. Deleting the `dirty` gate or the clamp turns these red;
 * before this file the whole suite stayed green with either removed.
 */
describe("commitFor", () => {
  it("commits nothing for an empty or unparseable draft", () => {
    expect(commitFor("", 0, 24)).toBeNull();
    expect(commitFor("abc", 0, 24)).toBeNull();
  });
  it("clamps a typed value into the declared range, like the spinner and scrub", () => {
    expect(commitFor("50", 0, 24)).toBe(24);
    expect(commitFor("-5", 0, 24)).toBe(0);
    expect(commitFor("1e3", 0, 24)).toBe(24);
    expect(commitFor("0.35", 0, 1)).toBe(0.35);
  });
  it("passes an in-range value through untouched", () => {
    expect(commitFor("12", 0, 24)).toBe(12);
    expect(clampTo(7)).toBe(7);
  });
});

describe("blurOutcome", () => {
  const base = { defaultValue: 0, min: 0, max: 24, hasClear: true };
  it("does nothing when nothing was typed — a Mixed box is born empty and leaving it is not an edit", () => {
    expect(blurOutcome({ ...base, dirty: false, draft: "", startedWithValue: false })).toEqual({ kind: "none" });
  });
  it("clears the override when a held value was erased and the box was left empty", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "", startedWithValue: true })).toEqual({ kind: "clear" });
  });
  it("commits the default instead when there is no clear path", () => {
    expect(blurOutcome({ ...base, hasClear: false, dirty: true, draft: "", startedWithValue: true })).toEqual({ kind: "commit", value: 0 });
  });
  it("does NOT clear when the box started empty (Mixed) and ends empty — that would erase values the user never saw", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "", startedWithValue: false })).toEqual({ kind: "none" });
  });
  it("shows the clamped value that was actually stored", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "50", startedWithValue: true })).toEqual({ kind: "show", value: 24 });
  });
  it("shows nothing extra for an in-range value", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "8", startedWithValue: true })).toEqual({ kind: "none" });
  });
});
