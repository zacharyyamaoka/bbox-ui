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
 *
 * WHY blur never commits `defaultValue` when `value` is `undefined`,
 * regardless of `commitDefaultOnBlur`: `undefined` means Mixed — the
 * selection currently disagrees, so the box opens empty on purpose, with
 * nothing typed. A stray click into a Mixed box followed by a click
 * elsewhere is a blur with an empty, untouched draft; the old unconditional
 * commit read that as "reset to the default" and taught every selected
 * instance the same value from a click that never typed anything
 * (glyph-finish audit round 2, a two-instance Mixed padding row: select
 * both, click in, click away, no typing — instance 1's real 10 became 0).
 * `commitDefaultOnBlur` only ever decides what happens when `value` WAS
 * defined and the box is now empty.
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
  commitDefaultOnBlur = true,
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
  /** `false` for a host fact (`HostFactsSection`): `defaultValue` there is
   *  HOST_FIELDS' placeholder (0 for x/y/rotation), never a real position,
   *  so committing it on an emptied box would silently move or rotate the
   *  instance to the origin instead of leaving it where it actually is.
   *  With this `false`, an emptied-and-blurred box with a real prior
   *  `value` reverts to that value and commits nothing; the default `true`
   *  keeps every existing component-field caller's original behaviour
   *  (a real documented default IS the right thing to fall back to). */
  commitDefaultOnBlur?: boolean;
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
          if (value === undefined) {
            // Mixed, nothing typed — no shared value to revert to and
            // nothing safe to commit. Leave the selection disagreeing.
            setDraft("");
          } else if (commitDefaultOnBlur) {
            setDraft(String(defaultValue));
            onCommit(defaultValue);
          } else {
            setDraft(String(value));
          }
        }
      }}
      {...rest}
    />
  );
}
