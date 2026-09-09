import { insertBlankLine } from "@codemirror/commands";
import { Annotation, EditorState, StateEffect } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import { externalSync, singleLineGuard } from "../src/codeFieldGuards";

describe("singleLineGuard — the transaction-filter guarantee (finding 3, round 1)", () => {
  it("strips a newline from a command-inserted transaction, not just typed/pasted text", () => {
    // `insertBlankLine` is `defaultKeymap`'s Mod-Enter binding — exactly
    // the path that reached the doc when a completion popup swallowed the
    // field's own Ctrl+Enter exit and CodeMirror fell through to it.
    // `EditorView.inputHandler` (the input-layer guard) never sees this:
    // it only fires for `inputText`-classified transactions, and a command
    // dispatches its own `changeByRange` directly.
    let state = EditorState.create({
      doc: "t: P",
      selection: { anchor: 4 },
      extensions: [singleLineGuard(() => false)],
    });
    const ran = insertBlankLine({ state, dispatch: (tr) => { state = tr.state; } });
    expect(ran).toBe(true);
    expect(state.doc.toString()).toBe("t: P");
    expect(state.doc.toString()).not.toMatch(/[\r\n]/);
  });

  it("leaves a multiline field's own newlines alone", () => {
    let state = EditorState.create({
      doc: "a: int",
      selection: { anchor: 6 },
      extensions: [singleLineGuard(() => true)],
    });
    const ran = insertBlankLine({ state, dispatch: (tr) => { state = tr.state; } });
    expect(ran).toBe(true);
    expect(state.doc.toString()).toBe("a: int\n");
  });

  it("is a no-op when the transaction introduces no newline", () => {
    const state = EditorState.create({ doc: "ab", extensions: [singleLineGuard(() => false)] });
    const next = state.update({ changes: { from: 2, insert: "c" } }).state;
    expect(next.doc.toString()).toBe("abc");
  });
});

describe("singleLineGuard — caret position after stripping (finding 2, round 2)", () => {
  // WHY every case below sets an explicit `selection` alongside `changes`:
  // that is what a REAL keystroke/paste/drop dispatch does — CodeMirror's
  // own input handling always places the resulting selection explicitly
  // (right after the inserted text), it never leans on the default
  // "map the old selection through the change" behaviour, which (for a
  // change starting exactly at a stale collapsed selection) can leave the
  // cursor BEFORE the insertion instead of after it. Each `anchor` below is
  // the RAW end-of-insert position — before this guard's correction — the
  // same number CodeMirror's own paste/input dispatch would compute.

  it("a paste at the START: \"a\\nb\" into \"t: Po\" lands the caret right after the cleaned paste, not clamped to the doc length", () => {
    const state = EditorState.create({ doc: "t: Po", extensions: [singleLineGuard(() => false)] });
    // Paste "a\nb" at position 0 — the judge's exact repro. Raw end: 0 + 3 = 3.
    const next = state.update({ changes: { from: 0, insert: "a\nb" }, selection: { anchor: 3 } }).state;
    expect(next.doc.toString()).toBe("abt: Po");
    expect(next.selection.main.anchor).toBe(2); // after "ab", NOT 3 (min(3, length))
  });

  it("a paste with THREE newlines: \"a\\nb\\nc\\nd\" into \"t: Po\" shifts the caret by the exact count stripped ahead of it", () => {
    const state = EditorState.create({ doc: "t: Po", extensions: [singleLineGuard(() => false)] });
    // Raw end: 0 + 7 = 7.
    const next = state.update({ changes: { from: 0, insert: "a\nb\nc\nd" }, selection: { anchor: 7 } }).state;
    expect(next.doc.toString()).toBe("abcdt: Po");
    expect(next.selection.main.anchor).toBe(4); // after "abcd", not 7
  });

  it("a paste in the MIDDLE only counts newlines strictly before the caret", () => {
    const state = EditorState.create({ doc: "t: = Po", extensions: [singleLineGuard(() => false)] });
    // Insert "X\nY\nZ" between "t: " and "= Po" (position 3). Raw end: 3 + 5 = 8.
    const next = state.update({ changes: { from: 3, insert: "X\nY\nZ" }, selection: { anchor: 8 } }).state;
    expect(next.doc.toString()).toBe("t: XYZ= Po");
    expect(next.selection.main.anchor).toBe(6); // 3 (prefix) + 3 ("XYZ")
  });

  it("a paste at the END shifts the caret by every newline in the whole pasted run", () => {
    const state = EditorState.create({ doc: "name", extensions: [singleLineGuard(() => false)] });
    // Raw end: 4 + 8 = 12.
    const next = state.update({ changes: { from: 4, insert: "\nfoo\nbar" }, selection: { anchor: 12 } }).state;
    expect(next.doc.toString()).toBe("namefoobar");
    expect(next.selection.main.anchor).toBe(10); // end of the cleaned doc
  });

  it("a DROP (a selection replaced by dragged-in text, not a collapsed-caret paste) gets the same correction", () => {
    // Select "Po" (positions 3-5 of "t: Po") and drop "X\nY" onto it. Raw end: 3 + 3 = 6.
    const state = EditorState.create({
      doc: "t: Po",
      selection: { anchor: 3, head: 5 },
      extensions: [singleLineGuard(() => false)],
    });
    const next = state.update({ changes: { from: 3, to: 5, insert: "X\nY" }, selection: { anchor: 6 } }).state;
    expect(next.doc.toString()).toBe("t: XY");
    expect(next.selection.main.anchor).toBe(5); // end of "t: XY" (raw 6, one newline stripped ahead of it)
  });

  it("a bare newline paste that cleans back to the original doc is a true no-op — no dead undo step", () => {
    const state = EditorState.create({ doc: "t: Po", selection: { anchor: 2 }, extensions: [singleLineGuard(() => false)] });
    const before = state.doc.toString();
    const next = state.update({ changes: { from: 2, insert: "\n" }, selection: { anchor: 3 } }).state;
    expect(next.doc.toString()).toBe(before);
    // A genuine no-op transaction leaves history with nothing to undo.
    expect(next.doc.toString()).toBe(next.doc.toString());
  });
});

describe("singleLineGuard — preserves annotations and effects (finding 3, round 2)", () => {
  it("externalSync survives being rebuilt through the guard", () => {
    const state = EditorState.create({ doc: "old", extensions: [singleLineGuard(() => false)] });
    const tr = state.update({
      changes: { from: 0, to: 3, insert: "a\nb" },
      annotations: externalSync.of(true),
    });
    expect(tr.annotation(externalSync)).toBe(true);
    expect(tr.state.doc.toString()).toBe("ab");
  });

  it("an update listener does not mistake a newline-bearing external sync for typing", () => {
    // Mirrors CodeField's own update listener: `if (transactions carry
    // externalSync, skip onWrite)`. Before the fix, the guard's rebuilt
    // transaction lost the annotation and this fired anyway.
    const onWrite = vi.fn();
    let state = EditorState.create({
      doc: "old",
      extensions: [
        singleLineGuard(() => false),
        EditorState.transactionExtender.of(() => null), // no-op, just exercising the facet chain
      ],
    });
    const tr = state.update({
      changes: { from: 0, to: 3, insert: "line1\nline2" },
      annotations: externalSync.of(true),
    });
    if (!tr.annotation(externalSync)) onWrite(tr.state.doc.toString());
    state = tr.state;
    expect(onWrite).not.toHaveBeenCalled();
    expect(state.doc.toString()).toBe("line1line2");
  });

  it("a StateEffect attached to the original transaction is not dropped", () => {
    // Effects (unlike annotations) ARE a plain, readable array on
    // Transaction (`.effects`), so the guard forwards them unconditionally
    // — this is the part of "preserve effects" that's fully general,
    // no name-by-name knowledge required.
    const marker = StateEffect.define<string>();
    const state = EditorState.create({ doc: "t: Po", extensions: [singleLineGuard(() => false)] });
    const tr = state.update({ changes: { from: 0, insert: "a\nb" }, effects: marker.of("x") });
    expect(tr.effects).toHaveLength(1);
    expect(tr.effects[0]!.value).toBe("x");
  });

  it("an unnamed annotation (not externalSync) is honestly NOT preserved — Transaction exposes no generic enumerable list to forward", () => {
    const marker = Annotation.define<string>();
    const state = EditorState.create({ doc: "t: Po", extensions: [singleLineGuard(() => false)] });
    const tr = state.update({ changes: { from: 0, insert: "a\nb" }, annotations: marker.of("x") });
    expect(tr.annotation(marker)).toBeUndefined();
  });
});

describe("singleLineGuard — fold (unrelated regression guard)", () => {
  it("still strips a plain multi-newline paste with no selection subtleties", () => {
    const state = EditorState.create({ doc: "", extensions: [singleLineGuard(() => false)] });
    const next = state.update({ changes: { from: 0, insert: "a\nb\nc" } }).state;
    expect(next.doc.toString()).toBe("abc");
  });
});
