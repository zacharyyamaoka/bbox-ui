// src/chrome/FocusLens/focusVisibility.ts — the ISOLATE half of the focus lens
// (parity item P-025, "focus DIMS, isolate HIDES").
//
// WHY hiding goes through tldraw's own `getShapeVisibility` seam rather than
// through the CSS the DIM half uses: dimming is paint, and paint is all it has
// to be. Hiding is not. A shape painted at `visibility: hidden` is still there
// as far as the engine is concerned — tldraw hit-tests GEOMETRICALLY, off the
// shape records, never off the DOM — so an "isolated" board would still let a
// marquee grab the shapes the user just asked to put away, and a click on empty
// space would select an invisible block. `getShapeVisibility` is the seam
// tldraw provides for exactly this ("the shape will be hidden... shapes remain
// in the store and participate in all other operations"), and `isShapeHidden`
// is what the rest of the engine consults.
//
// WHY a module-level atom rather than React state: `getShapeVisibility` is a
// prop of `<Tldraw>` in `App.tsx`, and the lens lives in the chrome, three
// trees away — the same two-surface problem `chrome/ShareMenu/preferences.ts`
// and `interfaceScaleHost.tsx` already solve this way. It has to be an ATOM and
// not a plain variable because tldraw caches this predicate per shape
// (`Editor.getIsShapeHiddenCache`); a value read from a signal invalidates that
// cache when it changes, and a value read from a closure variable does not —
// the board would go on painting the old answer forever.
import { atom, type Editor, type TLShape } from "tldraw";

const EMPTY: ReadonlySet<string> = new Set();

const hiddenShapeIds = atom<ReadonlySet<string>>("ss focus hidden shapes", EMPTY);

/** What the isolate lens is putting away right now. Empty = nothing hidden. */
export function setFocusHiddenShapeIds(ids: ReadonlySet<string>): void {
  const current = hiddenShapeIds.get();
  if (current.size === ids.size && [...ids].every((id) => current.has(id))) return;
  hiddenShapeIds.set(ids.size === 0 ? EMPTY : new Set(ids));
}

export function clearFocusHiddenShapeIds(): void {
  setFocusHiddenShapeIds(EMPTY);
}

/** `<Tldraw getShapeVisibility={…}>`. `"inherit"` is tldraw's own default, so
 *  with nothing hidden this answers exactly what it would without us. */
export function focusShapeVisibility(shape: TLShape, _editor: Editor): "hidden" | "inherit" {
  return hiddenShapeIds.get().has(shape.id) ? "hidden" : "inherit";
}
