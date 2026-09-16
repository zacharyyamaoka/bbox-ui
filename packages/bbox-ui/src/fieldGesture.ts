/**
 * The live-commit contract `CodeField` follows.
 *
 * WHY a gesture object instead of "call `onWrite` on change, `onEditEnd` on
 * blur": a text field's edit is a *gesture* with three boundaries — it
 * begins, it produces values, and it ends exactly once — and how the field
 * was left (blur, Enter, Escape, the host unmounting the panel) only
 * decides *when* the gesture ends, never *whether* the value survives. The
 * browser will not tell you about the last one: no `blur` fires for a
 * focused element removed from the DOM, so a naive commit-on-blur field
 * silently drops whatever was typed the instant its panel unmounts. This
 * class is driven from the React lifecycle instead (`CodeField`'s unmount
 * effect calls `commit()`), where that boundary is observable.
 *
 * Two write policies, both loss-free:
 *
 * - `live` — every keystroke writes straight into the caller's store, so
 *   the store is the only copy of the text and there is nothing left to
 *   lose. `CodeField` uses this exclusively (see WHY below).
 * - `exit` — the value is buffered and written once, at the end boundary,
 *   for a write that is genuinely expensive. Still loss-free, because
 *   unmount is itself an end boundary.
 *
 * `begin` fires lazily, on the first keystroke that actually changes the
 * value, so a field that was merely focused leaves no trace in undo
 * history. `end` is the commit boundary a caller can hang a semantic
 * "rename" or a debounced round trip off, without the live write ever
 * having to wait for it.
 */

export type FieldCommitMode = "live" | "exit";

export interface FieldGestureHooks {
  /** Write the value. Per keystroke in `live`, once at the end in `exit`. */
  write(value: string): void;
  /**
   * Open one undoable step. Called lazily — on the first keystroke that
   * really changes the value — so merely focusing a field leaves no trace.
   */
  begin?(): void;
  /** The commit boundary. Fires exactly once per gesture, whatever ended it. */
  end?(value: string, startValue: string): void;
}

export class FieldGesture {
  mode: FieldCommitMode;

  private readonly hooks: FieldGestureHooks;
  private editing = false;
  private began = false;
  private start = "";
  private current = "";

  constructor(hooks: FieldGestureHooks, mode: FieldCommitMode = "live") {
    this.hooks = hooks;
    this.mode = mode;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  get startValue(): string {
    return this.start;
  }

  get value(): string {
    return this.current;
  }

  /** Enter the field. Idempotent: re-entering keeps the original pre-edit value. */
  focus(value: string): void {
    if (this.editing) return;
    this.editing = true;
    this.began = false;
    this.start = value;
    this.current = value;
  }

  /** One keystroke, paste, or IME commit. */
  change(value: string): void {
    if (!this.editing) this.focus(this.current);
    if (value === this.current) return;
    this.current = value;
    if (this.mode !== "live") return;
    this.ensureBegun();
    this.hooks.write(value);
  }

  /**
   * End the gesture and keep the value. Every exit route calls this — blur,
   * Enter, Escape, and the unmount cleanup — so it must stay idempotent.
   */
  commit(): void {
    if (!this.editing) return;
    if (this.mode === "exit" && this.current !== this.start) {
      this.ensureBegun();
      this.hooks.write(this.current);
    }
    const value = this.current;
    const start = this.start;
    this.editing = false;
    this.began = false;
    this.hooks.end?.(value, start);
  }

  private ensureBegun(): void {
    if (this.began) return;
    this.began = true;
    this.hooks.begin?.();
  }
}
