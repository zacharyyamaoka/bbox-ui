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
 *     nothing at focus (Mixed) and ends empty does nothing on blur: the
 *     only keystroke that can get there without committing is a
 *     non-committing one (a lone "."), and the originals are still intact.
 *  3. Typing respects min, max AND step exactly as the spinner does: 1.5
 *     into a step-1 field commits 2, not a value the arrows can never reach.
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
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

/** Snap to the step grid anchored at `min` (or 0), then clamp — the spinner's
 *  own arithmetic, so typing can never produce a value the arrows cannot. */
export function snapTo(n: number, range: NumberRange): number {
  const { min, max, step } = range;
  let v = n;
  if (step && step > 0) {
    const base = min ?? 0;
    // Work in integer units of the step's precision: 0.35 / 0.1 is
    // 3.4999999999999996 in floating point and rounds the wrong way, while
    // 35 / 10 is exactly 3.5. Same reason the result is re-rounded below.
    const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length, (String(base).split(".")[1] ?? "").length);
    const scale = 10 ** decimals;
    const k = Math.round(Math.round((v - base) * scale) / Math.round(step * scale));
    v = Number((base + k * step).toFixed(decimals));
  }
  return clampTo(v, min, max);
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
}

export type NumberInputEvent =
  | { type: "focus"; value: number | undefined }
  | { type: "change"; next: string }
  | { type: "blur" }
  | { type: "value"; value: number | undefined }; // an outside change

export type NumberInputEffect = { kind: "commit"; value: number } | { kind: "clear" };

export function initialNumberInput(value: number | undefined): NumberInputState {
  return { draft: value === undefined ? "" : String(value), focused: false, dirty: false, startedWithValue: false };
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
      const n = commitFor(event.next, ctx.min, ctx.max, ctx.step);
      return { state: { ...state, draft: event.next, dirty: true }, effects: n === null ? [] : [{ kind: "commit", value: n }] };
    }
    case "blur": {
      const out = blurOutcome({ ...state, hasClear: ctx.hasClear, defaultValue: ctx.defaultValue, min: ctx.min, max: ctx.max, step: ctx.step });
      const next: NumberInputState = { ...state, focused: false };
      switch (out.kind) {
        case "none":
          return { state: next, effects: [] };
        case "clear":
          return { state: { ...next, draft: "" }, effects: [{ kind: "clear" }] };
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
  const ctx = { defaultValue, hasClear: !!onClear, min, max, step };

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
      step={step ?? 1}
      placeholder={placeholder}
      style={style}
      onFocus={() => dispatch({ type: "focus", value })}
      onChange={(e) => dispatch({ type: "change", next: e.target.value })}
      onBlur={() => {
        // After blur with nothing typed, resync the draft to whatever is stored.
        const { state: next, effects } = reduceNumberInput(state, { type: "blur" }, ctx);
        setState(next.dirty ? next : { ...next, draft: value === undefined ? "" : String(value) });
        for (const e of effects) {
          if (e.kind === "commit") onCommit(e.value);
          else onClear?.();
        }
      }}
      {...rest}
    />
  );
}
