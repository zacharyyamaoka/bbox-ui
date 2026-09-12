import { useEffect, useState, type CSSProperties } from "react";

/**
 * A number box you can actually empty.
 *
 * WHY a draft string and not a controlled `value={Number(x)}`: a controlled
 * number input that writes the field's default back the moment the box reads
 * "" cannot be cleared — delete the 0 and it is 0 again, so typing 50 lands
 * as "050". Zach, 2026-09-11: "the padding control seems buggy, I cannot
 * delete the initial 0." The box keeps what was typed while it has focus,
 * commits every parseable value as it is typed, and only on blur turns an
 * empty box back into the default. Both panels that had this bug now share
 * this one component rather than two copies of the fix.
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
  "data-slot"?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);

  // An outside change (a preset, a clear, another subject) replaces the draft
  // unless the user is mid-edit, in which case their keystrokes win.
  useEffect(() => {
    if (!focused) setDraft(value === undefined ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step ?? 1}
      placeholder={placeholder}
      style={style}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next.trim() === "") return; // let it be empty; blur decides
        const n = Number(next);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() === "" || !Number.isFinite(Number(draft))) {
          setDraft(String(defaultValue));
          onCommit(defaultValue);
        }
      }}
      {...rest}
    />
  );
}
