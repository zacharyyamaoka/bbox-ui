import {
  Annotation,
  EditorState,
  Transaction,
  type AnnotationType,
  type Extension,
} from "@codemirror/state";

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

/**
 * The named annotations this guard knows how to detect and re-apply on a
 * transaction it has to rebuild: CodeMirror's own `Transaction.time` /
 * `userEvent` / `addToHistory` / `remote`, plus `externalSync` above.
 *
 * WHY this matters beyond bookkeeping: `userEvent` and `addToHistory` are
 * what `history()` groups undo steps by. Losing them made a rebuilt
 * transaction look like an ORDINARY edit with no origin and no history
 * opinion — inside CodeMirror's 500ms `newGroupDelay`, that merged
 * silently into whatever adjacent edit was already open. Type `P`, then
 * paste `a\nb` (copying a lane line with an empty selection is linewise
 * and carries a trailing `\n`, so this is common here): one Ctrl+Z used to
 * discard the typing AND the paste together, leaving `t: ` instead of
 * undoing the paste alone. `time` matters too — it feeds the SAME grouping
 * window, so a rebuilt transaction stamped with a fresh `Date.now()`
 * instead of the original's timestamp can drift outside the window the
 * original edit was actually inside.
 */
function knownAnnotations(tr: Transaction): Annotation<unknown>[] {
  const carried: Annotation<unknown>[] = [];
  function add<T>(type: AnnotationType<T>): void {
    const value = tr.annotation(type);
    if (value !== undefined) carried.push(type.of(value));
  }
  add(Transaction.time);
  add(Transaction.userEvent);
  add(Transaction.addToHistory);
  add(Transaction.remote);
  add(externalSync);
  return carried;
}

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
 * Things earlier passes at this got wrong, all fixed here:
 *
 * - The caret was clamped to the CLEANED text's length instead of shifted
 *   by how many stripped characters sat ahead of it.
 * - The replacement spec silently dropped every annotation and effect —
 *   `externalSync` (an external value-sync misread as typing) and, worse,
 *   CodeMirror's OWN `userEvent`/`addToHistory`/`time` (undo-grouping
 *   corruption — see `knownAnnotations`'s doc). `effects` are forwarded
 *   unconditionally (a plain array on `Transaction`, unlike annotations,
 *   which have no generic enumerable list); `scrollIntoView` likewise.
 * - A transaction that, once cleaned, changes the DOCUMENT not at all
 *   (pasting a bare `"\n"`, or pasting text that survives cleaning back to
 *   exactly what a replaced selection already said) either dispatched a
 *   pointless full document-replace (a dead undo step) or, at the other
 *   extreme, dropped the transaction so completely that a REPLACED
 *   SELECTION was left standing open instead of collapsed to where the
 *   paste actually ended — the very next keystroke would have overwritten
 *   the pasted text a second time. Both are handled by always computing
 *   the corrected selection and only including `changes` when the doc
 *   actually differs.
 */
export function singleLineGuard(isMultiline: () => boolean): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (isMultiline() || !tr.docChanged) return tr;
    const text = tr.newDoc.toString();
    if (!/[\r\n]/.test(text)) return tr;
    const cleaned = text.replace(/[\r\n]+/g, "");
    const { anchor, head } = tr.newSelection.main;
    const shift = (pos: number) => Math.max(0, Math.min(pos - newlinesBefore(text, pos), cleaned.length));
    const selection = { anchor: shift(anchor), head: shift(head) };
    const preserved = {
      effects: tr.effects,
      annotations: knownAnnotations(tr),
      scrollIntoView: tr.scrollIntoView,
    };
    if (cleaned === tr.startState.doc.toString()) {
      // Nothing textual changes, but the selection still has to land where
      // a real edit would have — a paste that replaced a selection with
      // (once cleaned) the same text it already held must still collapse
      // the selection to the end of the paste, not leave the old range
      // standing open for the next keystroke to clobber.
      return { selection, ...preserved };
    }
    return {
      changes: { from: 0, to: tr.startState.doc.length, insert: cleaned },
      selection,
      ...preserved,
    };
  });
}
