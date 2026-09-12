import { describe, expect, it } from "vitest";
import {
  blurOutcome,
  clampTo,
  commitFor,
  initialNumberInput,
  reduceNumberInput,
  snapTo,
  type NumberInputEvent,
} from "../src/NumberInput";

/**
 * Rules found by three judge rounds, tested as the machine the component
 * drives — the same event sequence a user produces. Round 3 mutation-tested
 * the previous file and two mutants survived because the wiring (what
 * "focus" records, that "change" commits) lived in the component. It lives
 * in the reducer now, so those mutants die here.
 */
const CTX = { defaultValue: 0, min: 0, max: 24, step: 1, hasClear: true };

function run(value: number | undefined, events: NumberInputEvent[], ctx = CTX) {
  let state = initialNumberInput(value);
  const effects: unknown[] = [];
  for (const e of events) {
    const r = reduceNumberInput(state, e, ctx);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

describe("commitFor / snapTo / clampTo", () => {
  it("commits nothing for an empty or unparseable draft", () => {
    expect(commitFor("", 0, 24, 1)).toBeNull();
    expect(commitFor("abc", 0, 24, 1)).toBeNull();
  });
  it("clamps into the declared range, like the spinner and the scrub", () => {
    expect(commitFor("50", 0, 24, 1)).toBe(24);
    expect(commitFor("-5", 0, 24, 1)).toBe(0);
    expect(commitFor("1e3", 0, 24, 1)).toBe(24);
    expect(clampTo(7)).toBe(7);
  });
  it("snaps to the step grid: 1.5 in a step-1 field is 2, a value the arrows can reach", () => {
    expect(commitFor("1.5", 0, 24, 1)).toBe(2);
    expect(commitFor("0.35", 0, 1, 0.1)).toBe(0.4);
    expect(commitFor("0.35", 0, 1, 0.05)).toBe(0.35);
    expect(snapTo(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
  });
  it("a field with no declared step snaps by 1, because that is the browser's grid for it (round 4)", () => {
    expect(commitFor("12.5", 0, 24)).toBe(13);
    expect(commitFor("12.5")).toBe(13);
  });
  it("does not round the typed value before dividing: 0.9 on a step-2 grid is 0, not 2 (round 4)", () => {
    expect(snapTo(0.9, { step: 2 })).toBe(0);
    expect(snapTo(0.6, { step: 2 })).toBe(0);
    expect(snapTo(1.1, { step: 2 })).toBe(2);
  });
  it("stays ON the grid when max is not: the largest on-grid value below max, as stepDown does (round 4)", () => {
    expect(snapTo(10, { min: 0.5, max: 10, step: 2 })).toBe(8.5);
    expect(snapTo(10, { min: 0, max: 10, step: 3 })).toBe(9);
    expect(snapTo(-3, { min: 0.5, max: 10, step: 2 })).toBe(0.5);
  });
});

describe("blurOutcome", () => {
  const base = { defaultValue: 0, min: 0, max: 24, step: 1, hasClear: true };
  it("does nothing when nothing was typed, even if the draft is out of range", () => {
    // Kills the mutant that deletes the dirty gate: without it this would
    // "show" 24 for a box the user only tabbed through.
    expect(blurOutcome({ ...base, dirty: false, draft: "50", startedWithValue: true })).toEqual({ kind: "none" });
    expect(blurOutcome({ ...base, dirty: false, draft: "", startedWithValue: false })).toEqual({ kind: "none" });
  });
  it("clears the override when a displayed value was erased and the box left empty", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "", startedWithValue: true })).toEqual({ kind: "clear" });
  });
  it("commits the default instead when there is no clear path", () => {
    expect(blurOutcome({ ...base, hasClear: false, dirty: true, draft: "", startedWithValue: true })).toEqual({ kind: "commit", value: 0 });
  });
  it("does NOT clear when the box started empty (Mixed) and ends empty", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "", startedWithValue: false })).toEqual({ kind: "none" });
  });
  it("shows the snapped value that was actually stored", () => {
    expect(blurOutcome({ ...base, dirty: true, draft: "50", startedWithValue: true })).toEqual({ kind: "show", value: 24 });
    expect(blurOutcome({ ...base, dirty: true, draft: "1.5", startedWithValue: true })).toEqual({ kind: "show", value: 2 });
  });
});

describe("reduceNumberInput — the wiring, as a user drives it", () => {
  it("focus records whether the box displayed a value (kills 'always started with value')", () => {
    const mixed = run(undefined, [{ type: "focus", value: undefined }]);
    expect(mixed.state.startedWithValue).toBe(false);
    const held = run(8, [{ type: "focus", value: 8 }]);
    expect(held.state.startedWithValue).toBe(true);
  });
  it("typing commits each parseable value as it is typed (kills 'never commit while typing')", () => {
    const r = run(0, [{ type: "focus", value: 0 }, { type: "change", next: "" }, { type: "change", next: "5" }, { type: "change", next: "50" }]);
    expect(r.effects).toEqual([{ kind: "commit", value: 5 }, { kind: "commit", value: 24 }]);
    expect(r.state.draft).toBe("50");
  });
  it("a Tab through a Mixed box writes nothing", () => {
    const r = run(undefined, [{ type: "focus", value: undefined }, { type: "blur", value: undefined }]);
    expect(r.effects).toEqual([]);
  });
  it("erasing a held value and leaving clears the override", () => {
    const r = run(8, [{ type: "focus", value: 8 }, { type: "change", next: "" }, { type: "blur", value: undefined }]);
    expect(r.effects).toEqual([{ kind: "clear" }]);
    expect(r.state.draft).toBe("");
  });
  it("a lone '.' into a Mixed box then leaving touches nothing — the originals stay", () => {
    const r = run(undefined, [{ type: "focus", value: undefined }, { type: "change", next: "" }, { type: "blur", value: undefined }]);
    expect(r.effects).toEqual([]);
  });
  it("an outside change replaces the draft only while not focused", () => {
    const idle = run(3, [{ type: "value", value: 9 }]);
    expect(idle.state.draft).toBe("9");
    const editing = run(3, [{ type: "focus", value: 3 }, { type: "change", next: "4" }, { type: "value", value: 9 }]);
    expect(editing.state.draft).toBe("4");
  });
  it("typing past max then leaving shows the stored 24", () => {
    const r = run(0, [{ type: "focus", value: 0 }, { type: "change", next: "50" }, { type: "blur", value: 24 }]);
    expect(r.state.draft).toBe("24");
  });
  it("a Mixed box that committed while typing and was then erased reads the stored value after blur, not blank (round 4)", () => {
    // focus on Mixed, type 3 (commits 3 to every subject), erase, leave: the
    // store now holds 3 and the box must show it.
    const r = run(undefined, [
      { type: "focus", value: undefined },
      { type: "change", next: "3" },
      { type: "change", next: "" },
      { type: "blur", value: 3 },
    ]);
    expect(r.effects).toEqual([{ kind: "commit", value: 3 }]);
    expect(r.state.draft).toBe("3");
    expect(r.state.dirty).toBe(false);
  });
});
