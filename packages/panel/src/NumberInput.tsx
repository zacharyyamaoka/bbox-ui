import { useEffect, useState, type CSSProperties } from "react";

/**
 * A number box you can actually empty.
 *
 * WHY a draft string and not a controlled `value={Number(x)}`: a controlled
 * number input that writes the field's default back the moment the box reads
 * "" cannot be cleared — delete the 0 and it is 0 again, so typing 50 lands
 * as "050". Zach, 2026-09-11: "the padding control seems buggy, I cannot
 * delete the initial 0."
 *
 * Three rules the first version got wrong, each found by the judge:
 *
 * 1. Leaving the box writes NOTHING unless the user typed. A Mixed row is
 *    born empty, and "empty on blur means restore the default" turned one
 *    Tab keystroke through a multi-selection into an override of the default
 *    on every selected instance, destroying the values that made it Mixed.
 * 2. Clearing a value and leaving means "remove my override", not "store an
 *    override equal to the default". The latter is a phantom: the row's dot
 *    says override, the generated code omits the prop, and in a panel without
 *    a clear button there is no way out. `onClear` is that path; without it
 *    the default is committed.
 * 3. Typing respects min/max exactly as the spinner and the scrub do. The box
 *    accepting 1000 for a field declared 0..24 painted 1000px while the
 *    arrows clamped at 24 — three answers to one question in one row.
 *
 * Every panel's number box is this component; a structural test refuses a
 * second controlled `type="number"` anywhere in the panel.
 */
export function NumberInput({
  value,
  defaultValue,
  min,
  max,
  step,
  placeholder,
  style,
  onCommit,
  onClear,
  ...rest
}: {
  value: number | undefined;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  style?: CSSProperties;
  onCommit: (value: number) => void;
  /** Remove the stored value instead of committing the default when the user
   *  clears the box and leaves. */
  onClear?: () => void;
  "data-slot"?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);

  // An outside change (a preset, a clear, another subject) replaces the draft
  // unless the user is mid-edit, in which case their keystrokes win.
  useEffect(() => {
    if (!focused) setDraft(value === undefined ? "" : String(value));
  }, [value, focused]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step ?? 1}
      placeholder={placeholder}
      style={style}
      onFocus={() => {
        setFocused(true);
        setDirty(false);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        setDirty(true);
        if (next.trim() === "") return; // let it be empty; blur decides
        const n = Number(next);
        if (Number.isFinite(n)) onCommit(clamp(n));
      }}
      onBlur={() => {
        setFocused(false);
        if (!dirty) {
          // Nothing typed: leaving is not an edit. Resync and go.
          setDraft(value === undefined ? "" : String(value));
          return;
        }
        const n = Number(draft);
        if (draft.trim() === "" || !Number.isFinite(n)) {
          if (onClear) {
            onClear();
            setDraft("");
          } else {
            onCommit(defaultValue);
            setDraft(String(defaultValue));
          }
          return;
        }
        // A typed value outside the range was committed clamped; show what
        // was actually stored rather than what was typed.
        const c = clamp(n);
        if (c !== n) setDraft(String(c));
      }}
      {...rest}
    />
  );
}
