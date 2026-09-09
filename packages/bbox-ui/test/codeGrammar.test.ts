import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { grammarExtensions, type CodeFieldGrammar } from "../src/codeGrammar";

/** Every mark CodeMirror actually painted, read back from the real decoration facet — no DOM required. */
function paintedRanges(state: EditorState): Array<{ from: number; to: number; class: string }> {
  const ranges: Array<{ from: number; to: number; class: string }> = [];
  for (const decorations of state.facet(EditorView.decorations)) {
    const set = typeof decorations === "function" ? decorations(null as never) : decorations;
    set.between(0, state.doc.length, (from, to, value) => {
      const spec = value.spec as { class?: string };
      if (spec.class) ranges.push({ from, to, class: spec.class });
    });
  }
  return ranges;
}

describe("grammarExtensions — decorate bridge", () => {
  it("turns declared ranges into real CodeMirror mark decorations at the same offsets", () => {
    const grammar: CodeFieldGrammar = {
      decorate: (text) => [{ from: 0, to: 4, className: "bbox-test-name" }],
    };
    const state = EditorState.create({ doc: "pose", extensions: grammarExtensions(grammar) });
    expect(paintedRanges(state)).toEqual([{ from: 0, to: 4, class: "bbox-test-name" }]);
  });

  it("recomputes when the document changes", () => {
    const grammar: CodeFieldGrammar = {
      decorate: (text) => (text.length > 0 ? [{ from: 0, to: text.length, className: "bbox-test-name" }] : []),
    };
    let state = EditorState.create({ doc: "a", extensions: grammarExtensions(grammar) });
    state = state.update({ changes: { from: 1, insert: "bc" } }).state;
    expect(paintedRanges(state)).toEqual([{ from: 0, to: 3, class: "bbox-test-name" }]);
  });

  it("drops a zero-width or inverted range rather than passing it to CodeMirror", () => {
    const grammar: CodeFieldGrammar = {
      decorate: () => [{ from: 3, to: 3, className: "bbox-test-empty" }],
    };
    const state = EditorState.create({ doc: "abc", extensions: grammarExtensions(grammar) });
    expect(paintedRanges(state)).toEqual([]);
  });

  it("sorts out-of-order ranges before handing them to RangeSetBuilder", () => {
    const grammar: CodeFieldGrammar = {
      decorate: () => [
        { from: 2, to: 3, className: "second" },
        { from: 0, to: 1, className: "first" },
      ],
    };
    const state = EditorState.create({ doc: "abc", extensions: grammarExtensions(grammar) });
    // RangeSetBuilder throws if fed out-of-order ranges — reaching this
    // assertion at all is the proof the bridge sorts them first.
    expect(paintedRanges(state).map((r) => r.class)).toEqual(["first", "second"]);
  });
});

describe("grammarExtensions — fold (foldInactiveLinesAfter)", () => {
  it("replaces an inactive long line past the character limit with the ellipsis widget", () => {
    const grammar: CodeFieldGrammar = { foldInactiveLinesAfter: 4 };
    const state = EditorState.create({
      doc: "a: int\nsomething_long: SomeReallyLongType",
      extensions: grammarExtensions(grammar),
      selection: { anchor: 0 }, // caret on line 1 — line 2 is inactive
    });
    let replaced = false;
    for (const decorations of state.facet(EditorView.decorations)) {
      const set = typeof decorations === "function" ? decorations(null as never) : decorations;
      set.between(0, state.doc.length, () => {
        replaced = true;
      });
    }
    expect(replaced).toBe(true);
  });

  it("never folds the line the caret is on", () => {
    const longLine = "something_long: SomeReallyLongType";
    const grammar: CodeFieldGrammar = { foldInactiveLinesAfter: 4 };
    const state = EditorState.create({
      doc: `a: int\n${longLine}`,
      extensions: grammarExtensions(grammar),
      selection: { anchor: 7 + longLine.length }, // caret on line 2
    });
    let replacedOnActiveLine = false;
    for (const decorations of state.facet(EditorView.decorations)) {
      const set = typeof decorations === "function" ? decorations(null as never) : decorations;
      set.between(7, state.doc.length, () => {
        replacedOnActiveLine = true;
      });
    }
    expect(replacedOnActiveLine).toBe(false);
  });

  it("is a no-op extension list entry when the grammar omits it (no visible effect on a single-line field)", () => {
    const grammar: CodeFieldGrammar = {};
    expect(grammarExtensions(grammar)).toEqual([]);
  });
});

describe("grammarExtensions — which extensions get mounted", () => {
  it("mounts nothing for the empty grammar — the plain code text box", () => {
    expect(grammarExtensions({})).toHaveLength(0);
  });

  it("mounts exactly one extension per declared hook", () => {
    const grammar: CodeFieldGrammar = {
      language: python(),
      decorate: () => [],
      complete: () => null,
      foldInactiveLinesAfter: 10,
    };
    expect(grammarExtensions(grammar)).toHaveLength(4);
  });

  it("omits the completion extension entirely when the grammar has no complete()", () => {
    const grammar: CodeFieldGrammar = { decorate: () => [] };
    expect(grammarExtensions(grammar)).toHaveLength(1);
  });
});
