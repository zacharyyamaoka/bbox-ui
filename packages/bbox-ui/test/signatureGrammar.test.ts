import { describe, expect, it, vi } from "vitest";

import type { CodeFieldSlotAt } from "../src/codeGrammar";
import { signatureGrammar } from "../src/signatureGrammar";

describe("signatureGrammar — decorate (source-mode marks)", () => {
  it("marks the three roles plus punctuation, at the exact offsets", () => {
    const grammar = signatureGrammar();
    const text = "pose: Pose = None";
    const ranges = grammar.decorate!(text);
    expect(ranges).toEqual([
      { from: 0, to: 4, className: "bbox-sig-name" },
      { from: 4, to: 5, className: "bbox-sig-punct" },
      { from: 6, to: 10, className: "bbox-sig-type" },
      { from: 11, to: 12, className: "bbox-sig-punct" },
      { from: 13, to: 17, className: "bbox-sig-default" },
    ]);
  });

  it("marks every line of a lane independently", () => {
    const grammar = signatureGrammar();
    const ranges = grammar.decorate!("a: int\nb: float");
    const classes = ranges.map((r) => r.className);
    expect(classes.filter((c) => c === "bbox-sig-name")).toHaveLength(2);
    expect(classes.filter((c) => c === "bbox-sig-type")).toHaveLength(2);
  });

  it("a free-text name gets only the name mark — nothing lints it", () => {
    const grammar = signatureGrammar();
    const ranges = grammar.decorate!("temperature sensor readings");
    expect(ranges).toEqual([{ from: 0, to: 27, className: "bbox-sig-name" }]);
  });
});

describe("signatureGrammar — lines (rendered-mode tree)", () => {
  it("splits into role-tagged segments that reconstruct the exact source", () => {
    const grammar = signatureGrammar();
    const text = "pose : Pose = None";
    const [row] = grammar.lines!(text);
    expect(row!.segments.map((s) => s.text).join("")).toBe(text);
    expect(row!.segments.map((s) => s.role)).toEqual(["name", "punct", "type", "punct", "default"]);
  });

  it("marks the type segment as the reference — nothing else", () => {
    const grammar = signatureGrammar();
    const [row] = grammar.lines!("pose: Pose = None");
    const references = row!.segments.filter((s) => s.isReference);
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ text: "Pose", role: "type" });
  });

  it("a lane produces one row per line, in order, with the right line index", () => {
    const grammar = signatureGrammar();
    const rows = grammar.lines!("a: int\nb: float = 1.0");
    expect(rows.map((r) => r.line)).toEqual([0, 1]);
    expect(rows[1]!.lineStart).toBe("a: int\n".length);
  });

  it("preserves authored whitespace verbatim rather than fabricating canonical spacing", () => {
    const grammar = signatureGrammar();
    const text = "x:int=5";
    const [row] = grammar.lines!(text);
    expect(row!.segments.map((s) => s.text).join("")).toBe(text);
  });

  it("a name-only line is one segment, unstyled as a reference", () => {
    const grammar = signatureGrammar();
    const [row] = grammar.lines!("quality");
    expect(row!.segments).toEqual([{ text: "quality", role: "name" }]);
  });
});

describe("signatureGrammar — complete (slot-dispatched)", () => {
  const nameSlot: CodeFieldSlotAt = { slot: "name", start: 0, end: 4, query: "po" };
  const typeSlot: CodeFieldSlotAt = { slot: "type", start: 6, end: 6, query: "Po" };
  const defaultSlot: CodeFieldSlotAt = { slot: "default", start: 13, end: 13, query: "" };

  it("offers nothing while a name is being typed — free text is a legal name", () => {
    const grammar = signatureGrammar({ types: [{ label: "Pose" }] });
    const result = grammar.complete!(nameSlot, "po", { text: "po", pos: 2, explicit: false });
    expect(result).toBeNull();
  });

  it("offers the types list after a colon, replacing from the slot's own start", () => {
    const grammar = signatureGrammar({ types: [{ label: "Pose" }, { label: "int" }] });
    const result = grammar.complete!(typeSlot, "Po", { text: "pose: Po", pos: 8, explicit: false });
    expect(result).toMatchObject({ from: 6, to: 8 });
    expect(result!.options.map((o) => o.label)).toEqual(["Pose", "int"]);
  });

  it("offers the values list after an equals sign, replacing from the identifier boundary", () => {
    const grammar = signatureGrammar({ values: [{ label: "None" }, { label: "default_pose" }] });
    const text = "pose: Pose = def";
    const result = grammar.complete!(defaultSlot, "def", { text, pos: text.length, explicit: false });
    expect(result).toMatchObject({ from: text.length - 3, to: text.length });
    expect(result!.options.map((o) => o.label)).toEqual(["None", "default_pose"]);
  });

  it("returns null when the offered list for that slot is empty", () => {
    const grammar = signatureGrammar();
    expect(grammar.complete!(typeSlot, "", { text: "", pos: 0, explicit: false })).toBeNull();
  });

  it("passes each item's kind through as the completion type, for completionBadge", () => {
    const grammar = signatureGrammar({ types: [{ label: "Pose", kind: "board-type" }] });
    const result = grammar.complete!(typeSlot, "", { text: "", pos: 0, explicit: false });
    expect(result!.options[0]).toMatchObject({ label: "Pose", type: "board-type" });
  });
});

describe("signatureGrammar — resolveReference / completionBadge passthrough", () => {
  it("passes resolveReference straight through, unmodified", () => {
    const onJump = vi.fn();
    const resolveReference = vi.fn(() => ({ kind: "known", onJump }));
    const grammar = signatureGrammar({ resolveReference });
    const result = grammar.resolveReference!("Pose");
    expect(resolveReference).toHaveBeenCalledWith("Pose");
    expect(result).toMatchObject({ kind: "known" });
  });

  it("is undefined when no resolveReference is given — every type renders plain", () => {
    const grammar = signatureGrammar();
    expect(grammar.resolveReference).toBeUndefined();
  });

  it("looks up a completion badge label by kind", () => {
    const grammar = signatureGrammar({ kindLabels: { "board-type": "board type" } });
    expect(grammar.completionBadge!("board-type")).toBe("board type");
    expect(grammar.completionBadge!("unknown-kind")).toBeUndefined();
  });

  it("is undefined when no kindLabels are given — no completion badges", () => {
    const grammar = signatureGrammar();
    expect(grammar.completionBadge).toBeUndefined();
  });
});

describe("signatureGrammar — language", () => {
  it("mounts python() by default", () => {
    const grammar = signatureGrammar();
    expect(grammar.language).toBeDefined();
  });

  it("mounts nothing when language is explicitly null", () => {
    const grammar = signatureGrammar({ language: null });
    expect(grammar.language).toBeUndefined();
  });
});
