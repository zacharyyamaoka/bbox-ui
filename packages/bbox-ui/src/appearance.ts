/**
 * bbox-ui appearance — the shared semantic emphasis axis.
 *
 * WHY a separate file from layout.ts: layout.ts is portable GEOMETRY
 * (frozen for T1, see docs/T1-SPEC.md §0); this is portable SEMANTICS —
 * which of six emphasis states a thing is in, and the token names (not
 * hex values) that state resolves to. Both are React-free, engine-free.
 */

/* -------------------------------------------------------------- */
/* State — the six-rung emphasis ladder                            */
/* -------------------------------------------------------------- */

/**
 * Board vocabulary (Zach, 2026-09-10 ruling), NARROWED 2026-09-12 (Zach's
 * ruling on the port-props proposal — see docs/T1-SPEC.md §2.4): `empty ·
 * value set · wired · data received`. This is the VALUE axis only — "what
 * is in the port/pill" — and it is the only axis a document persists.
 *
 * `outOfFocus` and `hidden` used to be two more rungs of this same union,
 * but neither is a fact about what a thing IS: `outOfFocus` is a fact
 * about what the HOST is doing to it right now (dimmed while ineligible
 * mid-drag, or simply out of focus) and never survives a reload, while
 * `hidden` is a visibility toggle a container counts into "+N more" —
 * painting nothing is not a seventh kind of content. Splitting them out
 * stops one enum from doing three unrelated jobs: see `Port`'s own
 * `dimmed` (host-set, boolean, never persisted) and `hidden` (author-set,
 * boolean, persisted, same shape as `bar.fields.ts`'s existing `hidden`)
 * in `./port.tsx`/`./port.fields.ts`.
 */
export type AppearanceState = "empty" | "valueSet" | "wired" | "received";

export const APPEARANCE_STATES: AppearanceState[] = ["empty", "valueSet", "wired", "received"];

/** Board labels verbatim, including Zach's own spelling of "Recived". */
export const APPEARANCE_STATE_LABELS: Record<AppearanceState, string> = {
  empty: "Empty",
  valueSet: "Default Value",
  wired: "Wired",
  received: "Data Recived",
};

/**
 * States a document format may persist. `received` means "data flowed
 * through this just now" — only a live host can know that; persisting it
 * would lie after reload. Runtime-only, host-sourced, never written to a
 * document.
 */
export const PERSISTABLE_APPEARANCE_STATES = ["empty", "valueSet", "wired"] as const;

/** The three-channel reading every state resolves to: a ring/ink emphasis,
 * whether a fill is present, and whether the small inner "core" dot lights
 * up. `null` in any channel means "that layer does not paint at all" —
 * `wired` keeps a hollow ring (PORT-SPEC's disc) and lights only the core,
 * distinguishing it from `received`'s fully solid circle at a glance
 * without inventing a seventh state. Values are TOKEN NAMES (no leading
 * `--`) — resolve with `var(--${token})`, never a literal colour. See §3
 * for the actual token values and the contrast math behind them. */
export interface StateTokenPair {
  ring: string | null;
  fill: string | null;
  core: string | null;
}

export const STATE_TOKENS: Record<AppearanceState, StateTokenPair> = {
  empty: { ring: "foreground", fill: null, core: null },
  valueSet: { ring: "muted-foreground", fill: "muted", core: null },
  wired: { ring: "primary", fill: null, core: "primary" },
  received: { ring: "bbox-received", fill: "bbox-received", core: "bbox-received" },
};

/* -------------------------------------------------------------- */
/* Tone — the escape hatch for a component not colouring by state  */
/* -------------------------------------------------------------- */

export type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

export const TONES: Tone[] = ["neutral", "accent", "warning", "success", "danger"];

export const TONE_LABELS: Record<Tone, string> = {
  neutral: "Neutral",
  accent: "Accent",
  warning: "Warning",
  success: "Success",
  danger: "Danger",
};

/** `null` for `neutral` — it means "let state drive," not "paint nothing." */
export const TONE_TOKENS: Record<Tone, string | null> = {
  neutral: null,
  accent: "bbox-accent",
  warning: "bbox-warning",
  success: "bbox-success",
  danger: "bbox-danger",
};

/**
 * `tone` is NOT a preset — it is sugar that WRITES the override layer.
 * WHY: `state` and `tone` would otherwise be two preset families both
 * claiming the same paint fields, which `assertDisjointPresets` (§1)
 * correctly forbids (two different selectors, one governed property).
 * Modelling `tone` as "component logic that computes an override" instead
 * keeps the trace honest: when `tone !== "neutral"` wins, the field's
 * FieldTrace reports `winner: "override"`, which is literally true — a
 * tone reaches past whatever the state preset would have supplied,
 * exactly as a hand-typed override would. See each consuming component's
 * `.tsx` (Pill §4.3, Block §4.8) for the one-line call site; the pattern
 * is always: `{ ...instanceProps, ...toneOverride(tone, governedFieldIds) }`
 * spread onto the subject BEFORE calling `resolveFields`.
 */
export function toneOverride(
  tone: Tone,
  fieldIds: readonly string[],
): Record<string, string> | undefined {
  const token = TONE_TOKENS[tone];
  if (!token) return undefined;
  return Object.fromEntries(fieldIds.map((id) => [id, token]));
}

/* -------------------------------------------------------------- */
/* Lens — the diff/lint overlay, layered over everything above     */
/* -------------------------------------------------------------- */

export type Lens = "normal" | "added" | "removed" | "changed" | "error" | "warning";

export const LENSES: Lens[] = ["normal", "added", "removed", "changed", "error", "warning"];

export const LENS_LABELS: Record<Lens, string> = {
  normal: "Normal",
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  error: "Error",
  warning: "Warning",
};

/**
 * A paint token name → the CSS that paints it.
 *
 * WHY "primary" is special-cased and everything else is `var(--<token>)`:
 * "wired" paints with the design system's own accent, not with whatever the
 * HOST uses for its buttons. Inside bbox-ui.com, shadcn's neutral --primary is
 * near-black, so a wired Pill became a black capsule with dark ink on it and
 * a wired Port dot went black. --bbox-primary is ours; the fallback keeps a
 * host that defines only --primary looking exactly as before.
 *
 * Both Pill's paint map and Port's tone blend go through here — a second
 * template string building `var(--${token})` is how the Port kept the bug an
 * hour after the Pill lost it.
 */
export function paintVar(token: string): string {
  return token === "primary" ? "var(--bbox-primary, var(--primary))" : `var(--${token})`;
}
