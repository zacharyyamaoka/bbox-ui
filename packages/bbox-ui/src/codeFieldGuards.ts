import { Annotation, EditorState, type Extension } from "@codemirror/state";

/**
 * Marks `CodeField`'s own imperative doc swaps (the `value`-prop sync) so
 * the change listener never echoes them back as typing. Lives here, not in
 * `codeField.tsx`, so `singleLineGuard` below can recognise and re-apply it
 * on a transaction it has to rebuild — annotations are not part of
 * CodeMirror's public `Transaction` surface (only `.annotation(type)` for a
 * type you already know to ask for, never an enumerable list), so the only
 * ones a filter can honestly preserve are ones it knows about by name.
 */
export const externalSync = Annotation.define<boolean>();

/** How many `\r`/`\n` characters sit in `text` before `pos` — the amount a position must shift left to land on the equivalent spot once those characters are removed. */
function newlinesBefore(text: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) count++;
  }
  return count;
}

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
 *
 * Three things a first pass at this got wrong, all fixed here:
 *
 * - The caret was clamped to the CLEANED text's length instead of shifted
 *   by how many stripped characters sat ahead of it — pasting `"a\nb"` at
 *   the start of `"t: Po"` produced `"abt: Po"` with the caret landing
 *   after the whole clamp (position 3, mid-word) instead of position 2
 *   (right after "ab", where the paste actually ended).
 * - The replacement spec silently dropped the incoming transaction's
 *   annotations and effects. Concretely: the `value`-prop sync dispatches
 *   with `externalSync.of(true)` so the update listener knows not to treat
 *   it as typing; if that sync happened to carry a newline (a host writing
 *   multi-line text into a field that just became single-line, say), the
 *   annotation vanished, the listener mistook the correction for a
 *   keystroke, and `onWrite` fired with text the host never typed.
 * - A transaction that, once cleaned, changes nothing (e.g. pasting a bare
 *   `"\n"`) still dispatched a full document-replace — a no-op edit that
 *   still burns an undo step.
 */
export function singleLineGuard(isMultiline: () => boolean): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (isMultiline() || !tr.docChanged) return tr;
    const text = tr.newDoc.toString();
    if (!/[\r\n]/.test(text)) return tr;
    const cleaned = text.replace(/[\r\n]+/g, "");
    if (cleaned === tr.startState.doc.toString()) return []; // a true no-op: nothing left to apply
    const { anchor, head } = tr.newSelection.main;
    const shift = (pos: number) => Math.max(0, Math.min(pos - newlinesBefore(text, pos), cleaned.length));
    const sync = tr.annotation(externalSync);
    return {
      changes: { from: 0, to: tr.startState.doc.length, insert: cleaned },
      selection: { anchor: shift(anchor), head: shift(head) },
      effects: tr.effects,
      annotations: sync === undefined ? undefined : externalSync.of(sync),
    };
  });
}
