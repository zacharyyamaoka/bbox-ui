/**
 * packages/panel/src/twoClickEdit.ts
 *
 * The two-click-to-edit rule (docs/TEXTBOX-EDITING-SPEC.md §3, the
 * text-box-editing lane): a pointer-down on an instance selects it, UNLESS
 * it is already the sole selected instance and its component declares
 * `inlineEdit` — then the press means "start typing", not "select again".
 *
 * WHY this is one exported function and not duplicated logic in each host:
 * `renderInstance`'s member wrapper and `dom-preview.tsx`'s root wrapper are
 * structurally different (a `<span>` around a child vs a `<div>` around a
 * root), but the DECISION they make on pointer-down is exactly the same
 * one, and the spec explicitly asks for one helper so the rule cannot drift
 * between "click a slot fill's child" and "click a top-level instance".
 */
export interface TwoClickPointerDown {
  /** The instance the pointer went down on. */
  id: string;
  /** A shift/cmd/ctrl press extends the selection — always a select, never
   *  an edit request, however many times the same instance is pressed. */
  additive: boolean;
  /** The selection as it stands the moment the pointer went down. */
  selectedIds: readonly string[];
  /** Whether this instance's component declares `inlineEdit`. */
  inlineEditable: boolean;
}

/**
 * True when a pointer-down should request editing rather than (re)select.
 */
export function isSecondPressToEdit(params: TwoClickPointerDown): boolean {
  return (
    !params.additive &&
    params.inlineEditable &&
    params.selectedIds.length === 1 &&
    params.selectedIds[0] === params.id
  );
}

/**
 * A pointer-down "claim": lets the INNERMOST instance wrapper under a press
 * (a deeply nested member, then its parent members, then the top-level
 * root) each get a turn to decide "is this press for ME", stopping after
 * the first one that says yes — without `event.stopPropagation()`.
 *
 * WHY not `stopPropagation()`, which is what this replaced: it halts the
 * NATIVE event too, not just React's own bubbling — React 17+ delegates
 * through native listeners, and `SyntheticEvent.stopPropagation()` calls
 * the underlying native `stopPropagation()`. React Flow's node-drag
 * listener (d3-drag, attached natively to the node's own root element) and
 * tldraw's own gesture recognizer (attached natively to `.tl-container`,
 * an ANCESTOR of every rendered instance) both rely on that SAME native
 * bubble to ever see a press that starts on a member's content. Stopping
 * it there silently cancelled every drag that starts on the resting text
 * of a member — including a plain, non-editable one — which is exactly
 * the DoD's "a drag that starts on the resting text ... still moves the
 * node" (docs/TEXTBOX-EDITING-SPEC.md), confirmed broken in both React
 * Flow and tldraw before this fix.
 *
 * A `WeakSet` keyed by the native event is what makes "claimed" survive
 * from the innermost wrapper's handler to an ancestor's: `e.nativeEvent`
 * is the same object at every level of the SAME bubble, and it is
 * naturally garbage-collected once nothing (not even the dispatch queue)
 * still references it.
 */
const claimedPointerDowns = new WeakSet<Event>();

/** Call from the INNERMOST wrapper's `onPointerDown` before acting on it. */
export function claimInstancePointerDown(e: { nativeEvent: Event }): void {
  claimedPointerDowns.add(e.nativeEvent);
}

/** Call from any wrapper's `onPointerDown` before acting on it; bail out
 *  (return, do nothing) if this returns true — a nested wrapper already
 *  selected or requested editing for the more specific instance. */
export function isInstancePointerDownClaimed(e: { nativeEvent: Event }): boolean {
  return claimedPointerDowns.has(e.nativeEvent);
}

// WHY a click/drag disambiguation THRESHOLD, matching this codebase's own
// long-press convention (4px — see the fleet's "long_press is a timer, not
// a stillness" note): a press on an already-selected, inline-editable
// instance is AMBIGUOUS the instant it goes down — it is either the second
// half of the two-click-to-edit gesture, or the start of a drag that must
// "still move the node instead of selecting characters"
// (docs/TEXTBOX-EDITING-SPEC.md DoD). Nothing distinguishes the two until
// either real movement happens or the pointer lifts with none.
const EDIT_ARM_MOVE_THRESHOLD_PX = 4;

interface ArmedEdit {
  x: number;
  y: number;
  fire: () => void;
  teardown: () => void;
}

/**
 * The one press currently "armed" to become an edit request on release,
 * module-scoped rather than per-instance: exactly one pointer gesture is
 * ever in flight for a person's one pointer, so there is never a second
 * armed press to collide with.
 *
 * WHY editing waits for pointer-UP instead of firing on pointer-DOWN like
 * a plain select does (`isSecondPressToEdit` alone, before this file grew
 * these functions): `render-instance.tsx`'s member wrapper must call
 * `preventDefault()` before `onRequestEdit` fires (protecting the fresh
 * control's autofocus from the browser's own "shift focus to the nearest
 * focusable ancestor" default — see that file's own comment) — but
 * `preventDefault()` on a pointerdown ALSO suppresses the browser's
 * compatibility `mousedown` event it would otherwise synthesize, and React
 * Flow's node-drag (d3-drag, installed @xyflow/system 0.0.82) listens for
 * exactly that `mousedown`, natively, on the node's own root element.
 * Measured: calling `preventDefault()` unconditionally on every member
 * pointer-down — including the SECOND press on an already-selected
 * TextBox, which is precisely the case the DoD's drag line describes —
 * silenced `mousedown` for that whole gesture, so React Flow's drag never
 * started (`dx=0.0` every time). Arming instead of acting immediately
 * defers `preventDefault()` to pointer-UP, by which time `mousedown` has
 * ALREADY reached React Flow uncancelled — a genuine drag cancels the
 * arming itself before release, so it never calls `preventDefault()` at all.
 *
 * WHY document-level listeners rather than each wrapper's own
 * onPointerMove/onPointerUp: pointer events (unlike drag/mouse-capture
 * gestures) keep bubbling from whatever element is CURRENTLY under the
 * pointer, not from wherever it went down — a real drag routinely moves
 * the pointer off the member's own (often small) box within the first few
 * pixels, and this file has no reliable way to keep hearing about it from
 * there. `document` sees every move and the eventual release regardless.
 */
let armedEdit: ArmedEdit | null = null;

/**
 * Call from the pointer-down that satisfies `isSecondPressToEdit`, instead
 * of requesting editing immediately. `onEdit` fires — with `preventDefault()`
 * already called for it by this function — on pointer-up, unless the
 * pointer first moves past the click/drag threshold, in which case nothing
 * fires and the press is left to become whatever the host's own drag
 * machinery makes of it.
 */
export function armEditOnRelease(x: number, y: number, onEdit: () => void): void {
  clearArmedEdit();
  const onMove = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - x, e.clientY - y) > EDIT_ARM_MOVE_THRESHOLD_PX) clearArmedEdit();
  };
  const onUp = (e: PointerEvent) => {
    e.preventDefault();
    const fire = armedEdit?.fire;
    clearArmedEdit();
    fire?.();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
  document.addEventListener("pointercancel", clearArmedEdit, { once: true });
  armedEdit = {
    x,
    y,
    fire: onEdit,
    teardown: () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", clearArmedEdit);
    },
  };
}

/** Cancels the currently-armed edit, if any, without firing it — a real
 *  drag past the threshold, an unmount, or anything else that ends the
 *  gesture without it resolving to a click. Safe to call when nothing is
 *  armed. */
export function clearArmedEdit(): void {
  armedEdit?.teardown();
  armedEdit = null;
}
