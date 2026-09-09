import { EditorState, type Extension } from "@codemirror/state";

/**
 * A single-line `CodeField` must never contain a newline, by ANY path —
 * not just typed or pasted text (`EditorView.inputHandler` catches that
 * one, and stays for the tighter cursor placement it can do on a normal
 * keystroke) but also a COMMAND that inserts one directly, like
 * `defaultKeymap`'s `insertBlankLine` (reachable on Ctrl/Cmd+Enter when a
 * completion popup happens to be open and swallows the field's own exit
 * binding first). A `transactionFilter` sees every transaction regardless
 * of what produced it, so this is the actual guarantee, not a best effort
 * at the input layer.
 */
export function singleLineGuard(isMultiline: () => boolean): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (isMultiline() || !tr.docChanged) return tr;
    const text = tr.newDoc.toString();
    if (!/[\r\n]/.test(text)) return tr;
    const cleaned = text.replace(/[\r\n]+/g, "");
    return {
      changes: { from: 0, to: tr.startState.doc.length, insert: cleaned },
      selection: { anchor: Math.min(tr.newSelection.main.anchor, cleaned.length) },
    };
  });
}
