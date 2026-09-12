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
