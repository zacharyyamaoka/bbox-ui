import { insertBlankLine } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { singleLineGuard } from "../src/codeFieldGuards";

describe("singleLineGuard — the transaction-filter guarantee (finding 3)", () => {
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

  it("strips every newline even from a multi-line paste dispatched as one transaction", () => {
    const state = EditorState.create({ doc: "", extensions: [singleLineGuard(() => false)] });
    const next = state.update({ changes: { from: 0, insert: "a\nb\nc" } }).state;
    expect(next.doc.toString()).toBe("abc");
  });

  it("is a no-op when the transaction introduces no newline", () => {
    const state = EditorState.create({ doc: "ab", extensions: [singleLineGuard(() => false)] });
    const next = state.update({ changes: { from: 2, insert: "c" } }).state;
    expect(next.doc.toString()).toBe("abc");
  });
});
