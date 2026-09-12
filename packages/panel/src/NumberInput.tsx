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
 * The behaviour is a pure state machine (`reduceNumberInput`) and the React
 * component below is only the adapter that feeds it DOM events and performs
 * its effects. WHY: the first pure-function cut tested the rules but not the
 * wiring, and two mutants — "always treat the box as having held a value"
 * and "never commit while typing" — survived with a green suite. Testing the
 * machine with the same event sequence a user produces covers both.
 *
 * Rules, each found by a judge:
 *  1. Leaving writes NOTHING unless the user typed. A Mixed row is born
 *     empty; a Tab through it is not an edit.
 *  2. Clearing a displayed value and leaving removes the override (`clear`),
 *     never stores an override equal to the default. A box that showed
 *     nothing at focus (Mixed) and ends empty does nothing on blur. This is
 *     NOT a safety promise: typing commits per keystroke, so "3, Backspace,
 *     leave" has already written 3 to every selected instance and the
 *     originals are gone. The rule only stops the blur from ALSO clearing.
 *  3. Typing respects min, max AND step exactly as the spinner does. The
 *     grid is one declaration read by both: a field that declares no step
 *     steps by 1 in the browser, so it snaps by 1 here too — round 4 found
 *     12.5 stored in a step-less field that the arrows could never reach.
 *  4. After blur the box shows what is stored, whatever route got there. A
 *     Mixed box that committed while typing and was then erased went blank
 *     over a stored value because the "nothing to do" outcome skipped the
 *     resync (round 4).
 *
 * Every panel's number box is this component; a structural test refuses a
 * second controlled `type="number"` anywhere in the panel.
 */

export interface NumberRange {
  min?: number;
  max?: number;
  step?: number;
}

/** The one clamp every number surface uses — the box, the spinner and the
 *  scrub label. Two clamps for one rule is how they disagree. */
export function clampTo(n: number, min?: number, max?: number): number {
  // An inverted range (max < min) is not a range; the browser leaves the
  // value alone, so this does too rather than returning max below min.
  if (min !== undefined && max !== undefined && max < min) return n;
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

/**
 * Snap to the step grid anchored at `min` (or 0), staying inside [min, max]
 * ON the grid — the spinner's own arithmetic, so typing can never produce a
 * value the arrows cannot.
 *
 * Two float traps, both found by judges: 0.35 / 0.1 is 3.4999… so the
 * midpoint is nudged by an epsilon before rounding; and quantising the typed
 * value to the step's precision BEFORE dividing rounded 0.9 up to a whole
 * step of 2, so the division is done on the raw value. When `max` is not on
 * the grid the largest on-grid value below it wins, as `stepDown` does.
 */
export function snapTo(n: number, range: NumberRange): number {
  const { min, max } = range;
  // No step, or a non-positive one, is the browser's default grid of 1.
  const step = range.step !== undefined && range.step > 0 ? range.step : 1;
  const base = min ?? 0;
  let k = Math.round((n - base) / step + 1e-9);
  if (min !== undefined) k = Math.max(k, 0);
  if (max !== undefined) k = Math.min(k, Math.floor((max - base) / step + 1e-9));
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length, (String(base).split(".")[1] ?? "").length);
  return Number((base + k * step).toFixed(decimals));
}

/** What typing `next` into the box commits, or null for "nothing yet". */
export function commitFor(next: string, min?: number, max?: number, step?: number): number | null {
  if (next.trim() === "") return null;
  const n = Number(next);
  return Number.isFinite(n) ? snapTo(n, { min, max, step }) : null;
}

export type BlurOutcome =
  | { kind: "none" }
  | { kind: "clear" }
  | { kind: "commit"; value: number }
  | { kind: "show"; value: number };

export function blurOutcome(args: {
  dirty: boolean;
  draft: string;
  startedWithValue: boolean;
  hasClear: boolean;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}): BlurOutcome {
  if (!args.dirty) return { kind: "none" };
  const n = Number(args.draft);
  if (args.draft.trim() === "" || !Number.isFinite(n)) {
    if (!args.startedWithValue) return { kind: "none" };
    return args.hasClear ? { kind: "clear" } : { kind: "commit", value: args.defaultValue };
  }
  const c = snapTo(n, { min: args.min, max: args.max, step: args.step });
  return c !== n ? { kind: "show", value: c } : { kind: "none" };
}

// ---------------------------------------------------------------- machine

export interface NumberInputState {
  draft: string;
  focused: boolean;
  dirty: boolean;
  startedWithValue: boolean;
  /** The DOM holds text the browser cannot parse (a lone "-"): it reports
   *  value "" but is NOT empty, so an erase must not be inferred from it. */
  badInput: boolean;
}

export type NumberInputEvent =
  | { type: "focus"; value: number | undefined }
  | { type: "change"; next: string; fromSpinner?: boolean; badInput?: boolean }
  | { type: "blur"; value: number | undefined } // the stored value at that moment
  | { type: "value"; value: number | undefined }; // an outside change

export type NumberInputEffect = { kind: "commit"; value: number } | { kind: "clear" };

export function initialNumberInput(value: number | undefined): NumberInputState {
  return { draft: value === undefined ? "" : String(value), focused: false, dirty: false, startedWithValue: false, badInput: false };
}

export function reduceNumberInput(
  state: NumberInputState,
  event: NumberInputEvent,
  ctx: { defaultValue: number; hasClear: boolean } & NumberRange,
): { state: NumberInputState; effects: NumberInputEffect[] } {
  switch (event.type) {
    case "focus":
      return { state: { ...state, focused: true, dirty: false, startedWithValue: event.value !== undefined }, effects: [] };
    case "value":
      // Outside changes replace the draft unless the user is mid-edit.
      return state.focused
        ? { state, effects: [] }
        : { state: { ...state, draft: event.value === undefined ? "" : String(event.value) }, effects: [] };
    case "change": {
      // A Mixed box refuses the native spinner: stepping "up" from empty
      // invents a value from the range and would write it to every selected
      // instance — the same destruction the ± buttons and the scrub refuse
      // (round 6). Typing into it is still a deliberate write.
      if (event.fromSpinner && !state.startedWithValue && !state.dirty) return { state, effects: [] };
      // Unparseable text ("-" alone) is not an erase: keep the box as the
      // user left it, commit nothing, and let blur discard it (round 6).
      if (event.badInput) return { state: { ...state, dirty: true, badInput: true }, effects: [] };
      const n = commitFor(event.next, ctx.min, ctx.max, ctx.step);
      return { state: { ...state, draft: event.next, dirty: true, badInput: false }, effects: n === null ? [] : [{ kind: "commit", value: n }] };
    }
    case "blur": {
      const next: NumberInputState = { ...state, focused: false, dirty: false, badInput: false };
      if (state.badInput) {
        // Leaving with unparseable text drops it and shows the store.
        return { state: { ...next, draft: event.value === undefined ? "" : String(event.value) }, effects: [] };
      }
      const out = blurOutcome({ ...state, hasClear: ctx.hasClear, defaultValue: ctx.defaultValue, min: ctx.min, max: ctx.max, step: ctx.step });
      switch (out.kind) {
        case "none":
          // Resync to the store whatever the route: a Mixed box that
          // committed while typing and was then erased must read the 3 it
          // stored, not "" over it.
          return { state: { ...next, draft: event.value === undefined ? "" : String(event.value) }, effects: [] };
        case "clear":
          // Show the value the blur carried, not "": when clearing does not
          // move the resolved value (nothing was stored, or the override
          // equalled the default) no value change arrives to resync the box,
          // and it sat blank over a resolved 0 (round 5). When clearing does
          // move it, the value effect brings the new resolution.
          return { state: { ...next, draft: event.value === undefined ? "" : String(event.value) }, effects: [{ kind: "clear" }] };
        case "commit":
          return { state: { ...next, draft: String(out.value) }, effects: [{ kind: "commit", value: out.value }] };
        case "show":
          return { state: { ...next, draft: String(out.value) }, effects: [] };
      }
    }
  }
}

// -------------------------------------------------------------- component

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
  const [state, setState] = useState(() => initialNumberInput(value));
  // One grid for the DOM attribute and the commit path: the browser steps by
  // 1 when no step is declared, so the commit path must too.
  const grid = step ?? 1;
  const ctx = { defaultValue, hasClear: !!onClear, min, max, step: grid };

  function dispatch(event: NumberInputEvent) {
    const { state: next, effects } = reduceNumberInput(state, event, ctx);
    setState(next);
    for (const e of effects) {
      if (e.kind === "commit") onCommit(e.value);
      else onClear?.();
    }
  }

  useEffect(() => {
    setState((s) => reduceNumberInput(s, { type: "value", value }, ctx).state);
    // ctx values are primitives read at call time; value is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="number"
      value={state.draft}
      min={min}
      max={max}
      step={grid}
      placeholder={placeholder}
      style={style}
      onFocus={() => dispatch({ type: "focus", value })}
      onChange={(e) => {
        // Chrome's spin buttons fire an input event with no inputType;
        // keystrokes carry "insertText"/"deleteContentBackward".
        const native = e.nativeEvent as InputEvent;
        dispatch({
          type: "change",
          next: e.target.value,
          fromSpinner: !native.inputType,
          badInput: e.target.validity.badInput,
        });
      }}
      onKeyDown={(e) => {
        // The keyboard spinner, same rule as the ± buttons: inert on Mixed.
        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && value === undefined && !state.dirty) e.preventDefault();
      }}
      onBlur={() => dispatch({ type: "blur", value })}
      {...rest}
    />
  );
}
