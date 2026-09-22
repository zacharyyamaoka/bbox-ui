// src/document/derivedWrites.ts — writes the APP makes to the document that
// no person asked for: loading a file, and the repairs that keep stored
// geometry in step with what is rendered (a measured box, a corner card put
// back on its slot, a region re-settled under the drawing in force).
//
// Zach, 2026-09-22, on a review board opened by `?board=`: "the page keeps on
// reloading, what is going on?" Opening the board autosaved it — the load's
// own diff and the measurement write-backs after it both arrived at the
// document session's store listener as `source: "user"` — Vite saw a file
// under its root change, reloaded the page, the reopened board saved again,
// every ~4s. Opening a file and doing nothing must leave its bytes alone.
//
// WHY provenance by RECORD IDENTITY rather than a "repairing now" flag: the
// session's `store.listen` callback does not run inside the write. tldraw
// accumulates changes and flushes listeners on the next animation frame
// (`@tldraw/store` Store.ts, `historyReactor` → `throttleToNextFrame` →
// `_flushHistory`), squashed per source — so by the time the listener runs,
// any flag is long released, and one batch can hold a repair AND a real edit.
// The session's old guard released its flag after `setTimeout(0)`, which a
// frame outlives: that race is what let the load itself schedule a save.
// Records are immutable, so the exact `[before, after]` objects a derived
// write produced are a fingerprint the squashed batch still carries.
//
// WHY `store.extractingChanges` and not reading the touched ids back: a
// repair cascades — a measured corner card re-settles its region's frame in
// an after-change handler (`shapes/region/cornerBlock.ts`'s `reconcileFrame`)
// — and those records must count as derived too. `extractingChanges` is
// public tldraw API and sees every record the write touched, cascades
// included.
//
// FAIL-SAFE DIRECTION, stated because it is the whole point: anything this
// module cannot prove derived counts as a person's edit, so the worst case of
// a gap here is the old behaviour (an unneeded save), never a lost edit.
import type { Editor, RecordsDiff, TLRecord } from "tldraw";

/** `after → before` for every record a derived write produced; `null` means
 *  the derived write CREATED it. */
const derivedFrom = new WeakMap<TLRecord, TLRecord | null>();
/** Records a derived write removed, as they were when it removed them. */
const derivedRemovals = new WeakSet<TLRecord>();

/** A chain longer than this is not a chain this app writes; give up and call
 *  it a person's edit (the fail-safe direction). */
const MAX_CHAIN = 64;

function remember(diff: RecordsDiff<TLRecord>): void {
  for (const record of Object.values(diff.added)) derivedFrom.set(record, null);
  for (const [before, after] of Object.values(diff.updated)) derivedFrom.set(after, before);
  for (const record of Object.values(diff.removed)) derivedRemovals.add(record);
}

/** Does walking back from `record` through derived writes alone reach
 *  `origin` (`null` = "a derived write created it")? */
function derivedChainReaches(record: TLRecord, origin: TLRecord | null): boolean {
  let current: TLRecord | null = record;
  for (let step = 0; step < MAX_CHAIN; step += 1) {
    if (current === origin) return true;
    if (current === null) return false;
    const previous = derivedFrom.get(current);
    if (previous === undefined) return false;
    current = previous;
  }
  return false;
}

/**
 * Run `fn` and remember everything it wrote as derived — not a person's edit.
 * The caller decides the history mode; `runRepair` below is the common case.
 */
export function runDerived<T>(editor: Editor, fn: () => T): T {
  let result!: T;
  const diff = editor.store.extractingChanges(() => {
    result = fn();
  });
  remember(diff);
  return result;
}

/**
 * A repair: geometry the app re-derives from what it rendered, written back
 * with `history: "ignore"` (never an undo step) and remembered as derived
 * (never an autosave on its own). It still reaches disk — with the next real
 * edit, which serializes the whole store.
 */
export function runRepair(editor: Editor, fn: () => void, options: { ignoreShapeLock?: boolean } = {}): void {
  runDerived(editor, () => editor.run(fn, { ...options, history: "ignore" }));
}

/**
 * True when EVERY change in `changes` (a listener's squashed batch) was made
 * by derived writes alone. One change this module cannot account for makes
 * the whole batch a person's edit.
 */
export function isDerivedOnly(changes: RecordsDiff<TLRecord>): boolean {
  for (const record of Object.values(changes.added)) {
    if (!derivedChainReaches(record, null)) return false;
  }
  for (const [before, after] of Object.values(changes.updated)) {
    // A load removes and re-adds a record with the same id (the page, the
    // document); squashed, that reads as an update whose chain starts at a
    // derived creation from a derived removal.
    if (derivedChainReaches(after, before)) continue;
    if (derivedRemovals.has(before) && derivedChainReaches(after, null)) continue;
    return false;
  }
  for (const record of Object.values(changes.removed)) {
    if (!derivedRemovals.has(record)) return false;
  }
  return true;
}
