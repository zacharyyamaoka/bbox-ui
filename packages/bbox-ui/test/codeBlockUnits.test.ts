import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { flattenDecorations } from "../src/codeBlockFlatten";
import { innerNewlines, pythonUnits, unitNumberAt } from "../src/codeBlockUnits";

/** Every unit as its own text, so a test reads like the lane it describes. */
function unitTexts(text: string): string[] {
  return pythonUnits(text).map((u) => text.slice(u.from, u.to));
}

describe("pythonUnits — Python's continuation rule as lane rows", () => {
  it("one plain line per unit, blank lines included", () => {
    expect(unitTexts("a: int\n\nb: str")).toEqual(["a: int", "", "b: str"]);
  });

  it("a bracketed default spanning lines is ONE unit — the port-lane case", () => {
    const text = 'pose: Pose = {\n  "x": 1,\n  "y": 2\n}\nsamples: int = 3';
    expect(unitTexts(text)).toEqual(['pose: Pose = {\n  "x": 1,\n  "y": 2\n}', "samples: int = 3"]);
  });

  it("nested and mixed brackets count as one depth", () => {
    const text = "f: Fn = call([1,\n 2], (3,\n 4))\nnext: int";
    expect(unitTexts(text)).toEqual(["f: Fn = call([1,\n 2], (3,\n 4))", "next: int"]);
  });

  it("a triple-quoted string continues across lines, even with brackets inside", () => {
    const text = 'doc: str = """one (\ntwo\n"""\nlast: int';
    expect(unitTexts(text)).toEqual(['doc: str = """one (\ntwo\n"""', "last: int"]);
  });

  it("brackets inside a single-line string or a comment do not open a unit", () => {
    expect(unitTexts('s: str = "("\nt: int  # (\nu: int')).toEqual(['s: str = "("', "t: int  # (", "u: int"]);
  });

  it("a trailing backslash continues the line", () => {
    expect(unitTexts("a = 1 + \\\n  2\nb = 3")).toEqual(["a = 1 + \\\n  2", "b = 3"]);
  });

  it("an unclosed bracket swallows the rest — what Python itself would do", () => {
    expect(unitTexts("a = (\nb\nc")).toEqual(["a = (\nb\nc"]);
  });

  it("units partition the text: every character belongs to exactly one, in order", () => {
    const text = "x = [\n1]\n\ny = 2\n";
    const units = pythonUnits(text);
    expect(units[0]!.from).toBe(0);
    for (let i = 1; i < units.length; i += 1) expect(units[i]!.from).toBe(units[i - 1]!.to + 1);
    expect(units[units.length - 1]!.to).toBe(text.length);
  });
});

describe("innerNewlines / unitNumberAt", () => {
  const text = 'pose: Pose = {\n  "x": 1,\n  "y": 2\n}\nsamples: int = 3';
  const units = pythonUnits(text);

  it("lists exactly the newlines inside units — never the ones that end a unit", () => {
    const offsets = innerNewlines(text, units);
    expect(offsets).toHaveLength(3);
    for (const offset of offsets) expect(text[offset]).toBe("\n");
    expect(offsets).not.toContain(text.indexOf("\nsamples"));
  });

  it("numbers a line by the unit it sits in — 1, 1, 1, 1, 2 for the five physical lines", () => {
    const lineStarts = [0, ...Array.from(text.matchAll(/\n/g), (m) => m.index! + 1)];
    expect(lineStarts.map((offset) => unitNumberAt(units, offset))).toEqual([1, 1, 1, 1, 2]);
  });
});

describe("flattenDecorations — one replace decoration per inner newline", () => {
  function replaced(state: EditorState): Array<{ from: number; to: number }> {
    const ranges: Array<{ from: number; to: number }> = [];
    for (const decorations of state.facet(EditorView.decorations)) {
      const set = typeof decorations === "function" ? decorations(null as never) : decorations;
      set.between(0, state.doc.length, (from, to, value) => {
        if ((value.spec as { widget?: unknown }).widget) ranges.push({ from, to });
      });
    }
    return ranges;
  }

  it("folds the three newlines inside the dict, leaves the one between ports alone", () => {
    const text = 'pose: Pose = {\n  "x": 1,\n  "y": 2\n}\nsamples: int = 3';
    const state = EditorState.create({ doc: text, extensions: flattenDecorations() });
    const ranges = replaced(state);
    expect(ranges.map((r) => r.from)).toEqual(innerNewlines(text, pythonUnits(text)));
    for (const r of ranges) expect(r.to - r.from).toBe(1);
  });

  it("recomputes when the document changes — closing the bracket ends the fold", () => {
    let state = EditorState.create({ doc: "a = (\nb", extensions: flattenDecorations() });
    expect(replaced(state)).toHaveLength(1);
    state = state.update({ changes: { from: 5, insert: ")" } }).state; // "a = ()\nb"
    expect(replaced(state)).toHaveLength(0);
  });

  it("a grammar's own units win over the Python rule", () => {
    const everyLineOneUnit = (text: string) => {
      const units = [];
      let from = 0;
      for (let i = 0; i <= text.length; i += 1) {
        if (i === text.length || text[i] === "\n") {
          units.push({ from, to: i });
          from = i + 1;
        }
      }
      return units;
    };
    const state = EditorState.create({ doc: "a = (\nb", extensions: flattenDecorations(everyLineOneUnit) });
    expect(replaced(state)).toHaveLength(0);
  });
});
