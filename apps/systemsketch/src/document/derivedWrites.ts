// src/document/derivedWrites.ts — writes the APP makes to the document that
// no person asked for (loading a file, and the repairs that keep stored
// geometry in step with what is rendered), told apart from a person's edit
// at the moment each record is written.
//
// Zach, 2026-09-22, on a review board opened by `?board=`: "the page keeps on
// reloading". Opening the board autosaved it although nobody touched it: the
// load and the measurement write-backs after it both reached the document
// session's `store.listen({ source: "user" })` as edits.
//
// WHY attribution AT THE WRITE, by call extent, and not either of the other
// two mechanisms that were tried or proposed:
//
//   - A record ledger (commit 9df4918, reverted in 782d817) remembered the
//     `[before, after]` objects a derived write produced and let the listener
//     skip batches it could account for. Records are immutable and tldraw's
//     undo re-puts the EXACT original object (`HistoryManager._undo` →
//     `store.applyDiff`), so undoing the deletion of a loaded shape looked
//     like the load re-adding it: the restoration was never saved. Any scheme
//     that classifies by WHAT a change looks like can confuse a person's
//     change with an identical derived one.
//   - `store.mergeRemoteChanges`, so derived writes arrive as
//     `source: "remote"`. The store resets the remote flag BEFORE it runs the
//     after-change side effects (`@tldraw/store` Store.ts:1259-1263), and
//     `flushAtomicCallbacks` says so on purpose — "those extra effects should
//     not be marked as originating remotely" (Store.ts:1222-1225). So a
//     measured corner card re-settling its region's frame
//     (`shapes/region/cornerBlock.ts`'s after-change `reconcileFrame`) would
//     still arrive as a person's edit.
//
// What this does instead: `runDerived` marks the synchronous EXTENT of a
// derived write, and `listenForDocumentEdits` asks "was this record written
// inside that extent?" at the instant the store records it — through the
// store's history interceptor, which fires synchronously for every write,
// cascades included, with the same `user`/`remote` source the listeners get
// (Store.ts:1276-1280; tldraw's own undo stack is built on exactly this hook,
// HistoryManager.ts:45-46). An undo, a redo, a gesture, an applied scene all
// run OUTSIDE any `runDerived` call, so no person's action can be classified
// derived, whatever it writes. The one way to be wrong is a derived write
// performed outside the extent — that saves an unneeded copy, the old
// behaviour, never loses an edit.
//
// It is also what closes the frame gap the old guard had: tldraw delivers
// `store.listen` on the next animation frame (Store.ts:497-505,
// `throttleToNextFrame`), so the session's `setTimeout(0)` suppression was
// released before the load's diff was delivered, and an edit made in the
// same frame as File ▸ New was not dirty yet when the window left. The
// interceptor runs inside the write, so neither gap exists.
import type { Editor, RecordsDiff, TLRecord } from "tldraw";

const derivedDepth = new WeakMap<Editor, number>();

/** Run `fn`; everything it writes — and every side effect those writes set
 *  off before it returns — is the app's, not a person's. */
export function runDerived<T>(editor: Editor, fn: () => T): T {
  derivedDepth.set(editor, (derivedDepth.get(editor) ?? 0) + 1);
  try {
    return fn();
  } finally {
    derivedDepth.set(editor, (derivedDepth.get(editor) ?? 1) - 1);
  }
}

/**
 * A repair: geometry re-derived from what was rendered, written back into
 * the document. Derived (not an autosave) AND `history: "ignore"` (not an
 * undo step) — a reading depends on the VIEWER, fonts and pixel ratio, so a
 * board opened on another screen re-measures without anyone editing it.
 */
export function runRepair(editor: Editor, fn: () => void, options: { ignoreShapeLock?: boolean } = {}): void {
  runDerived(editor, () => editor.run(fn, { history: "ignore", ...options }));
}

type ChangeSource = "user" | "remote";

/** The store's history interceptor. Excluded from tldraw's published
 *  typings (`@tldraw/store` index.d.mts: "Excluded from this release type:
 *  addHistoryInterceptor") but present on every 5.3.2 store, pinned exactly in
 *  package.json; `listenForDocumentEdits` fails loudly if it ever is not. */
interface InterceptableStore {
  addHistoryInterceptor?(fn: (entry: { changes: RecordsDiff<TLRecord> }, source: ChangeSource) => void): () => void;
}

function touchesDocument(changes: RecordsDiff<TLRecord>, documentTypes: ReadonlySet<string>): boolean {
  for (const record of Object.values(changes.added)) if (documentTypes.has(record.typeName)) return true;
  for (const [, after] of Object.values(changes.updated)) if (documentTypes.has(after.typeName)) return true;
  for (const record of Object.values(changes.removed)) if (documentTypes.has(record.typeName)) return true;
  return false;
}

/**
 * Call `onEdit` — synchronously, inside the write — for every local change to
 * a document record made outside `runDerived`. Remote changes (another tab's
 * IndexedDB sync) are not this window's edits, exactly as the
 * `{ source: "user" }` listener this replaces treated them.
 */
export function listenForDocumentEdits(editor: Editor, onEdit: () => void): () => void {
  const store = editor.store as unknown as InterceptableStore;
  if (typeof store.addHistoryInterceptor !== "function") {
    throw new Error("tldraw's store no longer exposes addHistoryInterceptor; autosave cannot tell an edit from a repair");
  }
  const documentTypes = editor.store.scopedTypes.document as ReadonlySet<string>;
  return store.addHistoryInterceptor((entry, source) => {
    if (source !== "user") return;
    if ((derivedDepth.get(editor) ?? 0) > 0) return;
    if (!touchesDocument(entry.changes, documentTypes)) return;
    onEdit();
  });
}
