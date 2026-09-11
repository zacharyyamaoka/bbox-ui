import { describe, expect, it } from "vitest";
import type { FieldSpec } from "../src/field";
import { MIXED, readFields } from "../src/field";
import {
  assertDisjointPresets,
  governedFieldIds,
  resolveField,
  resolveFields,
  type PresetSpec,
} from "../src/resolve";

const LINE_COLOR_FIELD: FieldSpec = {
  id: "lineColor",
  label: "Line Colour",
  kind: "segments",
  defaultValue: "foreground",
  options: [
    { value: "foreground", label: "Foreground" },
    { value: "primary", label: "Primary" },
    { value: "bbox-danger", label: "Danger" },
  ],
};

const VISIBLE_FIELD: FieldSpec = {
  id: "visible",
  label: "Visible",
  kind: "toggle",
  defaultValue: true,
};

const STATE_FIELD: FieldSpec = {
  id: "state",
  label: "State",
  kind: "segments",
  defaultValue: "empty",
  options: [
    { value: "empty", label: "Empty" },
    { value: "wired", label: "Wired" },
  ],
};

const PILL_PRESETS: PresetSpec[] = [
  {
    id: "wired",
    label: "Wired",
    selector: "state",
    governs: ["lineColor", "visible"],
    values: { lineColor: "primary", visible: false },
  },
  {
    id: "empty",
    label: "Empty",
    selector: "state",
    governs: ["lineColor"],
    values: { lineColor: "foreground" },
  },
];

describe("resolveField — cascade order", () => {
  it("all three layers present: override wins", () => {
    const trace = resolveField(
      LINE_COLOR_FIELD,
      { state: "wired", lineColor: "bbox-danger" },
      PILL_PRESETS,
    );
    expect(trace.winner).toBe("override");
    expect(trace.resolved).toBe("bbox-danger");
    expect(trace.winningPresetId).toBeUndefined();
  });

  it("preset + default present, no override: preset wins", () => {
    const trace = resolveField(LINE_COLOR_FIELD, { state: "wired" }, PILL_PRESETS);
    expect(trace.winner).toBe("preset");
    expect(trace.resolved).toBe("primary");
    expect(trace.winningPresetId).toBe("wired");
  });

  it("only default present: no override, no matching preset", () => {
    const trace = resolveField(LINE_COLOR_FIELD, {}, PILL_PRESETS);
    expect(trace.winner).toBe("default");
    expect(trace.resolved).toBe("foreground");
    expect(trace.winningPresetId).toBeUndefined();
  });

  it("subject has a state but no preset governs this field: falls through to default", () => {
    const noPresetFor: FieldSpec = {
      id: "ungoverned",
      label: "Ungoverned",
      kind: "text",
      defaultValue: "fallback",
    };
    const trace = resolveField(noPresetFor, { state: "wired" }, PILL_PRESETS);
    expect(trace.winner).toBe("default");
    expect(trace.resolved).toBe("fallback");
    expect(trace.candidates[1]).toEqual({ layer: "preset", value: undefined });
  });

  it("subject's selector value matches no preset id: preset candidate stays empty", () => {
    const trace = resolveField(LINE_COLOR_FIELD, { state: "outOfFocus" }, PILL_PRESETS);
    expect(trace.winner).toBe("default");
    expect(trace.candidates[1]).toEqual({ layer: "preset", value: undefined });
  });

  it("a falsy override (false) still wins over a truthy preset/default — presence, not truthiness", () => {
    const trace = resolveField(VISIBLE_FIELD, { state: "wired", visible: false }, [
      { id: "always-visible", label: "x", selector: "state", governs: ["visible"], values: { visible: true } },
    ]);
    expect(trace.winner).toBe("override");
    expect(trace.resolved).toBe(false);
  });

  it("a falsy preset value (false) still wins over the default — presence, not truthiness", () => {
    const trace = resolveField(VISIBLE_FIELD, { state: "wired" }, PILL_PRESETS);
    expect(trace.winner).toBe("preset");
    expect(trace.resolved).toBe(false);
  });

  it("candidates array is always exactly 3, in cascade order, regardless of who wins", () => {
    const trace = resolveField(LINE_COLOR_FIELD, {}, PILL_PRESETS);
    expect(trace.candidates.map((c) => c.layer)).toEqual(["override", "preset", "default"]);
  });

  it("§1.4 worked example, executed: preset wins, candidates show all three layers honestly", () => {
    const trace = resolveField(LINE_COLOR_FIELD, { state: "wired" }, PILL_PRESETS);
    expect(trace).toMatchObject({
      resolved: "primary",
      winner: "preset",
      winningPresetId: "wired",
      candidates: [
        { layer: "override", value: undefined },
        { layer: "preset", value: "primary", presetId: "wired" },
        { layer: "default", value: "foreground" },
      ],
    });
  });

  it("§1.4 worked example, executed: an instance override reaches past the preset honestly", () => {
    const trace = resolveField(
      LINE_COLOR_FIELD,
      { state: "wired", lineColor: "bbox-danger" },
      PILL_PRESETS,
    );
    expect(trace).toMatchObject({
      resolved: "bbox-danger",
      winner: "override",
      candidates: [
        { layer: "override", value: "bbox-danger" },
        { layer: "preset", value: "primary", presetId: "wired" },
        { layer: "default", value: "foreground" },
      ],
    });
  });
});

describe("resolveFields", () => {
  it("resolves every field in order, matching per-field resolveField", () => {
    const fields = [LINE_COLOR_FIELD, VISIBLE_FIELD];
    const subject = { state: "wired" };
    const traces = resolveFields(fields, subject, PILL_PRESETS);
    expect(traces).toHaveLength(2);
    expect(traces[0]).toEqual(resolveField(LINE_COLOR_FIELD, subject, PILL_PRESETS));
    expect(traces[1]).toEqual(resolveField(VISIBLE_FIELD, subject, PILL_PRESETS));
  });

  it("empty fields array resolves to an empty trace list", () => {
    expect(resolveFields([], { state: "wired" }, PILL_PRESETS)).toEqual([]);
  });
});

describe("resolveField vs readFields — single-subject agreement", () => {
  it("a single subject's resolveField.resolved matches readFields' single-subject reading", () => {
    const subject = { state: "wired" };
    const trace = resolveField(LINE_COLOR_FIELD, subject, PILL_PRESETS);
    // readFields reads the raw prop; for a subject with no explicit lineColor
    // override it reads the field default, NOT the cascade-resolved preset
    // value — the two functions answer different questions (raw prop vs full
    // cascade) and must not be confused. With an explicit override they agree.
    const overridden = { state: "wired", lineColor: "bbox-danger" };
    const overriddenTrace = resolveField(LINE_COLOR_FIELD, overridden, PILL_PRESETS);
    const [reading] = readFields([LINE_COLOR_FIELD], [overridden]);
    expect(reading.value).toBe(overriddenTrace.resolved);
    expect(trace.resolved).toBe("primary");
  });

  it("MIXED across a multi-selection: comparing per-subject resolveField output surfaces the same disagreement readFields reports on raw props", () => {
    // Two subjects whose RAW props already disagree (one has an explicit
    // override, the other doesn't) — readFields must still call this MIXED
    // on the raw value, exactly as it did before the cascade existed.
    const overriddenSubject = { state: "wired", lineColor: "bbox-danger" };
    const plainSubject = { state: "wired" };

    // The product inspector's collapsed view still uses readFields on raw
    // props for MIXED — this proves that stays correct once presets exist.
    const [rawReading] = readFields([LINE_COLOR_FIELD], [overriddenSubject, plainSubject]);
    expect(rawReading.value).toBe(MIXED);

    // The cascade-resolved values for the two subjects also disagree (one
    // resolves via override, the other via preset), which is what makes
    // MIXED the honest collapsed reading of two different resolved paints,
    // not just two different raw prop bags.
    const overriddenTrace = resolveField(LINE_COLOR_FIELD, overriddenSubject, PILL_PRESETS);
    const plainTrace = resolveField(LINE_COLOR_FIELD, plainSubject, PILL_PRESETS);
    expect(overriddenTrace.resolved).not.toBe(plainTrace.resolved);
    expect(overriddenTrace.winner).toBe("override");
    expect(plainTrace.winner).toBe("preset");
  });

  it("a single selected subject still exposes its own full trace even inside what would be a multi-selection elsewhere", () => {
    const subjects = [{ state: "wired" }, { state: "empty" }];
    // The spec's scope line (§7.2): trace disclosure only opens for exactly
    // one selected subject. Resolving just that one subject must still
    // return a complete, non-MIXED trace.
    const trace = resolveField(LINE_COLOR_FIELD, subjects[0], PILL_PRESETS);
    expect(trace.winner).toBe("preset");
    expect(trace.resolved).toBe("primary");
  });
});

describe("assertDisjointPresets", () => {
  it("does NOT throw when siblings sharing a selector share a governed field", () => {
    // Both PILL_PRESETS entries govern "lineColor" but share selector "state" —
    // legitimate, mutually-exclusive alternatives in one semantic ladder.
    expect(() => assertDisjointPresets(PILL_PRESETS)).not.toThrow();
  });

  it("throws the instant two DIFFERENT selectors both govern the same field", () => {
    const conflicting: PresetSpec[] = [
      { id: "wired", label: "Wired", selector: "state", governs: ["lineColor"], values: { lineColor: "primary" } },
      { id: "danger", label: "Danger", selector: "tone", governs: ["lineColor"], values: { lineColor: "bbox-danger" } },
    ];
    expect(() => assertDisjointPresets(conflicting)).toThrow(
      /"lineColor" is governed by presets selected on two different fields/,
    );
  });

  it("the thrown error names both conflicting selectors", () => {
    const conflicting: PresetSpec[] = [
      { id: "wired", label: "Wired", selector: "state", governs: ["lineColor"], values: {} },
      { id: "danger", label: "Danger", selector: "tone", governs: ["lineColor"], values: {} },
    ];
    expect(() => assertDisjointPresets(conflicting)).toThrow(/"state"/);
    expect(() => assertDisjointPresets(conflicting)).toThrow(/"tone"/);
  });

  it("does not throw for an empty preset array", () => {
    expect(() => assertDisjointPresets([])).not.toThrow();
  });

  it("does not throw when different selectors govern disjoint fields", () => {
    const disjoint: PresetSpec[] = [
      { id: "wired", label: "Wired", selector: "state", governs: ["lineColor"], values: {} },
      { id: "danger", label: "Danger", selector: "tone", governs: ["fillColor"], values: {} },
    ];
    expect(() => assertDisjointPresets(disjoint)).not.toThrow();
  });
});

describe("governedFieldIds", () => {
  it("is the deduplicated union of every preset's governs list", () => {
    expect(governedFieldIds(PILL_PRESETS).sort()).toEqual(["lineColor", "visible"]);
  });

  it("is empty for an empty preset array", () => {
    expect(governedFieldIds([])).toEqual([]);
  });

  it("deduplicates a field governed by two same-selector siblings", () => {
    // "lineColor" is governed by both "wired" and "empty" above — must
    // appear once, not twice.
    expect(governedFieldIds(PILL_PRESETS).filter((id) => id === "lineColor")).toHaveLength(1);
  });
});
