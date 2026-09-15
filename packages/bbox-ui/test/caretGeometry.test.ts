import { describe, expect, it } from "vitest";

import { lineStartOffset } from "../src/caretGeometry";

// `caretOffsetFromPoint` is a DOM hit-test (`caretRangeFromPoint`, a live
// `TreeWalker`) with no meaningful pure-logic behaviour to isolate — this
// repo has no DOM test environment (no jsdom/happy-dom, matching every other
// package here), so it stays covered by driving the real demos in a browser
// rather than a unit test. `lineStartOffset` is pure and gets one here.
describe("lineStartOffset", () => {
  it("is 0 for the first line", () => {
    expect(lineStartOffset("a: int\nb: float", 0)).toBe(0);
  });

  it("accounts for every prior line's length plus its newline", () => {
    const text = "a: int\nb: float\nc: str";
    expect(lineStartOffset(text, 1)).toBe("a: int\n".length);
    expect(lineStartOffset(text, 2)).toBe("a: int\nb: float\n".length);
  });

  it("normalizes CRLF before counting", () => {
    const text = "a: int\r\nb: float";
    expect(lineStartOffset(text, 1)).toBe("a: int\n".length);
  });

  it("past the last line, keeps adding a trailing newline per counted line rather than throwing", () => {
    // Every line (the last one included) counts as `length + 1` — so past
    // the end this lands one character beyond `text.length`, not clamped
    // to it. Documented, not "fixed": this is the original function's
    // behaviour, ported unchanged, and the one caller (a rendered-row
    // click past the final row) only ever passes a real line index.
    const text = "a: int\nb: float";
    expect(lineStartOffset(text, 5)).toBe(text.length + 1);
  });
});
