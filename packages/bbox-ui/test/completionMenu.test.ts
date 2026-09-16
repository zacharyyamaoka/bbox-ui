import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  acceptRange,
  completionMenu,
  matchRanges,
  nextWidenState,
  stepSelection,
  wordAt,
} from "../src/completionMenu";

/** Applies `acceptRange` the way the menu does: replace the range with the label. */
function accept(textWithCaret: string, label: string, mode: "tab" | "enter"): string {
  const pos = textWithCaret.indexOf("|");
  const text = textWithCaret.replace("|", "");
  const range = acceptRange(mode, wordAt(text, pos), pos, text, label);
  return text.slice(0, range.from) + label + text.slice(range.to);
}

describe("wordAt — the identifier run around the caret", () => {
  it("spans both sides of a caret inside a word; query is the part before the caret", () => {
    expect(wordAt("x = Type()", 6)).toEqual({ from: 4, to: 8, query: "Ty" });
  });

  it("is empty at the caret between two non-word characters", () => {
    expect(wordAt("a (  ) b", 3)).toEqual({ from: 3, to: 3, query: "" });
  });

  it("takes digits, underscores and $ as word characters by default", () => {
    expect(wordAt("print_exception2$ x", 5)).toEqual({ from: 0, to: 17, query: "print" });
  });

  it("stops at punctuation on both sides", () => {
    expect(wordAt("foo.bar(baz)", 6)).toEqual({ from: 4, to: 7, query: "ba" });
  });

  it("treats non-ASCII letters as word characters", () => {
    expect(wordAt("é_pose ", 3)).toEqual({ from: 0, to: 6, query: "é_p" });
  });

  it("never splits a surrogate pair (an astral letter counts as one character)", () => {
    const text = "a𝒜b c";
    // "a" (1) + "𝒜" (2 UTF-16 units) + "b" (1) = a 4-unit word.
    expect(wordAt(text, 3)).toEqual({ from: 0, to: 4, query: "a𝒜" });
  });

  it("honours an overridden word character — e.g. a dotted path", () => {
    expect(wordAt("x = os.path.jo", 14, /[\w.]/)).toEqual({ from: 4, to: 14, query: "os.path.jo" });
  });

  it("ignores a global flag's lastIndex state on the caller's regex", () => {
    const sticky = /[a-z]/g;
    expect(wordAt("abc def", 2, sticky)).toEqual({ from: 0, to: 3, query: "ab" });
    expect(wordAt("abc def", 2, sticky)).toEqual({ from: 0, to: 3, query: "ab" });
  });
});

describe("acceptRange — Tab replaces the identifier, Enter eats only a matching suffix", () => {
  it("Enter on Ty|pe → Type, not Typepe (the tail is a suffix of the pick)", () => {
    expect(accept("Ty|pe", "Type", "enter")).toBe("Type");
  });

  it("Enter on Pos|xx → Posexx (an unrelated tail is kept)", () => {
    expect(accept("Pos|xx", "Pose", "enter")).toBe("Posexx");
  });

  it("Tab on Pos|xx → Pose (the whole identifier is replaced)", () => {
    expect(accept("Pos|xx", "Pose", "tab")).toBe("Pose");
  });

  it("Tab and Enter agree at the end of a word", () => {
    expect(accept("print(pri|)", "print", "enter")).toBe("print(print)");
    expect(accept("print(pri|)", "print", "tab")).toBe("print(print)");
  });

  it("leaves the text around the word untouched", () => {
    expect(accept("a = Tr|ansfoo + 1", "Transform", "tab")).toBe("a = Transform + 1");
    expect(accept("a = Tr|ansfoo + 1", "Transform", "enter")).toBe("a = Transformansfoo + 1");
  });

  it("returns exact offsets, word start to word end or caret", () => {
    const text = "x Ty|pe y".replace("|", "");
    const word = wordAt(text, 4);
    expect(acceptRange("tab", word, 4, text, "Tyrant")).toEqual({ from: 2, to: 6 });
    expect(acceptRange("enter", word, 4, text, "Tyrant")).toEqual({ from: 2, to: 4 });
    expect(acceptRange("enter", word, 4, text, "Type")).toEqual({ from: 2, to: 6 });
  });
});

describe("stepSelection — ↑/↓ at the ends, wrap vs caret", () => {
  it("moves one row inside the list in both modes", () => {
    for (const atEnds of ["wrap", "caret"] as const) {
      expect(stepSelection(1, 5, "down", atEnds)).toEqual({ index: 2 });
      expect(stepSelection(1, 5, "up", atEnds)).toEqual({ index: 0 });
    }
  });

  it("wrap: ↓ on the last goes to the first, ↑ on the first goes to the last", () => {
    expect(stepSelection(4, 5, "down", "wrap")).toEqual({ index: 0 });
    expect(stepSelection(0, 5, "up", "wrap")).toEqual({ index: 4 });
  });

  it("caret: ↓ on the last and ↑ on the first leave the list", () => {
    expect(stepSelection(4, 5, "down", "caret")).toEqual({ exit: "down" });
    expect(stepSelection(0, 5, "up", "caret")).toEqual({ exit: "up" });
  });

  it("caret with ONE item: both arrows leave at once (VS Code's one-item behaviour)", () => {
    expect(stepSelection(0, 1, "down", "caret")).toEqual({ exit: "down" });
    expect(stepSelection(0, 1, "up", "caret")).toEqual({ exit: "up" });
  });

  it("wrap with one item stays on it", () => {
    expect(stepSelection(0, 1, "down", "wrap")).toEqual({ index: 0 });
    expect(stepSelection(0, 1, "up", "wrap")).toEqual({ index: 0 });
  });

  it("with nothing selected, ↓ takes the first and ↑ the last", () => {
    expect(stepSelection(-1, 5, "down", "caret")).toEqual({ index: 0 });
    expect(stepSelection(-1, 5, "up", "wrap")).toEqual({ index: 4 });
  });

  it("paging clamps at both ends and never wraps or leaves, whatever atEnds says", () => {
    for (const atEnds of ["wrap", "caret"] as const) {
      expect(stepSelection(2, 20, "down", atEnds, 7)).toEqual({ index: 9 });
      expect(stepSelection(16, 20, "down", atEnds, 7)).toEqual({ index: 19 });
      expect(stepSelection(19, 20, "down", atEnds, 7)).toEqual({ index: 19 });
      expect(stepSelection(3, 20, "up", atEnds, 7)).toEqual({ index: 0 });
    }
  });

  it("zero selectable rows (the No-matches row): wrap stays put, caret leaves", () => {
    expect(stepSelection(0, 0, "down", "wrap")).toEqual({ index: 0 });
    expect(stepSelection(0, 0, "down", "caret")).toEqual({ exit: "down" });
    expect(stepSelection(0, 0, "up", "caret")).toEqual({ exit: "up" });
    expect(stepSelection(0, 0, "down", "caret", 7)).toEqual({ index: 0 });
  });
});

describe("matchRanges — the bold run", () => {
  it("bolds a case-insensitive prefix", () => {
    expect(matchRanges("print_exception", "PRI")).toEqual([0, 3]);
  });

  it("falls back to the first inner occurrence", () => {
    expect(matchRanges("Transform", "form")).toEqual([5, 9]);
  });

  it("bolds nothing for an empty query or no occurrence", () => {
    expect(matchRanges("Pose", "")).toEqual([]);
    expect(matchRanges("Pose", "zz")).toEqual([]);
  });
});

describe("nextWidenState — Ctrl+Space twice widens, again narrows, a new word resets", () => {
  it("toggles widened → narrow → widened on explicit sets", () => {
    let state = { widened: false, wordFrom: 4 };
    state = nextWidenState(state, 4, !state.widened);
    expect(state.widened).toBe(true);
    state = nextWidenState(state, 4, !state.widened);
    expect(state.widened).toBe(false);
    state = nextWidenState(state, 4, !state.widened);
    expect(state.widened).toBe(true);
  });

  it("stays widened while typing inside the same word", () => {
    const state = nextWidenState({ widened: true, wordFrom: 4 }, 4);
    expect(state).toEqual({ widened: true, wordFrom: 4 });
  });

  it("narrows back when the caret's word start changes", () => {
    expect(nextWidenState({ widened: true, wordFrom: 4 }, 11)).toEqual({ widened: false, wordFrom: 11 });
  });

  it("an explicit set wins over a word change in the same transaction", () => {
    expect(nextWidenState({ widened: false, wordFrom: 4 }, 11, true)).toEqual({ widened: true, wordFrom: 11 });
  });
});

describe("completionMenu — the extension itself", () => {
  it("mounts into a plain EditorState with every option set, without a view", () => {
    const state = EditorState.create({
      doc: "pri",
      extensions: completionMenu({
        source: () => ({ options: [{ label: "print" }] }),
        anchor: "cursor",
        atEnds: "caret",
        maxRows: 5,
        badge: () => "fn",
        footer: { hint: "every type", widenedHint: "back" },
      }),
    });
    expect(state.doc.toString()).toBe("pri");
  });

  it("builds independent instances (each menu owns its own widen state)", () => {
    const a = completionMenu({ source: () => null });
    const b = completionMenu({ source: () => null });
    expect(a).not.toBe(b);
    expect(() => EditorState.create({ extensions: a })).not.toThrow();
  });
});
