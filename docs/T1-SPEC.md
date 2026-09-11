# T1 — Six components, a rebuilt Port and Block, and the cascade underneath all of them. Pinned implementation spec.

Status: **pinned**. Every export name, file path, and signature below is final.
Lanes implement against this document without reading each other's code or
coordinating live — that is the whole point of writing it down first.

Zach's brief, verbatim, on the single most important requirement here:

> "the top layers can sit on the lower levels ... I feel instead of
> documenting it though you could almost just like trace it no?"

Every property in this system resolves in three layers, in this order:

```
resolved = instance override  ??  semantic preset  ??  component default
```

with theme **tokens** supplying the actual values underneath. The stored
state vector is the semantic choice, never the resolved paint: a `Pill`
that stores `state: "wired"` and nothing else is a *complete* record — its
line colour, fill colour and fill style are derived, not stored, and a
theme change sweeps every one of them. §1 is the module that makes this
true from the first line of code, not a later retrofit.

Where the six per-component designs (mined for constants, re-cut for the
ruling) and `PORT-SPEC.md` disagree with this document, **this document
wins** — it was written after Zach's cascade ruling; they were written
before it, and are cited here only as measured evidence.

---

## 0. How to read this spec, and the one rule that keeps lanes disjoint

**No two lanes touch the same file.** Where two components independently
wanted the same shared constant (a `sm: 18px` text rung, most often), this
spec deliberately gives each component its **own**, separately-named
constant in its **own** file rather than route two lanes through one
shared file. That is a real, intentional duplication of a design fact
(18px), not an oversight — unifying it later is a legitimate follow-up
(§10) and must not be attempted inside any T1 lane.

`packages/bbox-ui/src/layout.ts` **is frozen for the whole of T1** — no
lane edits it. It keeps exactly what it already exports (`TEXT_SIZES`,
`META_FONT_PX`, `ICON_RATIO`, `glyphPx`, `SIMPLE_BLOCK`, `CHIP`,
`BLOCK_BORDER_PX`, `BLOCK_PADDING_X`, the chip-reservation math). Every
constant `PORT-SPEC.md` proposed changing *inside* `layout.ts` (new
`PORT_DIAMETERS`, narrowed `PortTextLayout`, `inwardTextLayout`,
`portAnchor`, and everything else under `layout.ts`'s old "Port" and "Port
placement" headings) moves instead to a brand-new file, `port.layout.ts`,
owned solely by Lane **P**. The old Port-shaped exports that remain in
`layout.ts` (`PORT_DIAMETERS`, `PortState`, `PORT_STATE_LABELS`,
`PORT_STATES`, `PERSISTABLE_PORT_STATES`, `WIRED_INNER_RATIO`,
`wiredInnerPx`, `PortTextLayout`, `PORT_TEXT_LAYOUTS`, `isOffsetLayout`,
`portFlexDirection`, `PORT_LABEL_GAP`, `PORT_LABEL_OFFSET_GAP`,
`portLabelGap`, `PORT_RING_PX`, `BlockSide`, `PortDirection`, `portAnchor`,
`portDotPlacement`, `PORT_DOT_CENTER_TRANSFORM`, `PortLabelPlacement`,
`PortDotBox`, `portLabelOut`, `portSideForDirection`, `inwardTextLayout`,
`portLabelPlacement`) become **dead** the moment `port.layout.ts` lands —
they are deleted from `layout.ts` in one cleanup edit that only
**Integration** performs, at the very end, after nothing references them
(§8, Lane **I**). This is the one place in T1 where a file most people
would call "shared" is edited twice across the project's life — never
twice *concurrently*.

Every other new shared surface (the cascade, the appearance bundle, the
colour tokens) gets its own new file, owned by exactly one lane, for
exactly the same reason.

**Naming convention, pinned once:** every component's controllable props
live in `<name>.fields.ts` exporting `<NAME>_FIELDS: FieldSpec[]`. A
component with a preset family also exports `<name>.presets.ts` →
`<NAME>_PRESETS: PresetSpec[]`. A component with no presets still exports
an empty `<NAME>_PRESETS: PresetSpec[] = []` from the same file pattern —
every consumer (the generic story generator, the generic inspector) can
always `.map()` over it without a null check. The component itself lives
in `<name>.tsx`. Pure geometry a component needs and no sibling shares
lives in `<name>.layout.ts`. This is `port.fields.ts` / `port.tsx`'s own
shape (T0), generalized.

---

## 1. The cascade contract — `packages/schema`, verbatim

**Lane C. Runs first, alone.** Every other lane imports this module
without reading its implementation — the signatures below are the whole
contract.

### 1.1 `packages/schema/src/resolve.ts` (new)

```ts
/**
 * @bbox-ui/schema — packages/schema/src/resolve.ts
 *
 * The cascade: resolved = instance override ?? semantic preset ??
 * component default. Zero dependencies, same discipline as ./field.ts —
 * no React, no host engine, no Storybook.
 *
 * WHY this exists as code and not a markdown rule (Zach, 2026-09-10:
 * "I feel instead of documenting it though you could almost just like
 * trace it no?"): a resolver that returns a bare value can only ever be
 * asked "what is it now?". One that returns a FieldTrace can also answer
 * "why?" — which layer won, what the other layers held, which preset (if
 * any) supplied it. A component's own render function calls this SAME
 * resolver to compute what it paints (see each component's .tsx), so the
 * trace a panel shows is never a second, informal description of the
 * pixels — it is the computation that produced them.
 */

import type { FieldSpec, FieldValue } from "./field";

export type Layer = "override" | "preset" | "default";

export interface LayerCandidate<TValue = FieldValue> {
  layer: Layer;
  /**
   * What this layer holds for this field on this subject, or `undefined`
   * when the layer has nothing to say: no explicit value on the subject
   * (override), or no preset governs this field / the governing preset's
   * selector doesn't currently match (preset). `default` always has a
   * value — every FieldSpec declares one.
   */
  value: TValue | undefined;
  /** Set only on the `"preset"` candidate, and only when it has a value. */
  presetId?: string;
}

export interface FieldTrace<TValue = FieldValue> {
  field: FieldSpec<TValue>;
  /** The winning value — identical to what `readFields` would return for
   * a single subject. This is what a component actually paints. */
  resolved: TValue;
  winner: Layer;
  /** Set only when `winner === "preset"`. */
  winningPresetId?: string;
  /**
   * Always exactly 3 entries, in cascade order: override, preset, default
   * — the devtools-styles-pane model: the winning declaration plus the
   * losing ones, all visible.
   */
  candidates: [LayerCandidate<TValue>, LayerCandidate<TValue>, LayerCandidate<TValue>];
}

export interface PresetSpec<TValue = FieldValue> {
  /** Must equal one legal value of `selector`'s field (e.g. a PortState
   * member). Also the story name / control option this preset shows up
   * as — see §6. */
  id: string;
  label: string;
  /** The field id whose value selects this preset: active on a subject
   * when `subject[selector] === id`. Almost always `"state"`. */
  selector: string;
  /**
   * Closed set of field ids this preset writes. Real, exported, tested
   * data — never a comment. A field in this list without a matching key
   * in `values` is an authoring bug this module does not itself catch;
   * each component's own `*.fields.test.ts` asserts `governs` and
   * `Object.keys(values)` agree (see §9's Definition of Done).
   */
  governs: string[];
  /** This preset's value for each field named in `governs`. */
  values: Partial<Record<string, TValue>>;
}

/** Plain prop bag — a component's own `props`, a tldraw shape's `props`,
 * anything keyed like React props. Never an Editor, never a shape record.
 * Same shape `readFields` already accepts. */
type Subject = Record<string, unknown>;

/**
 * Resolve one field on one subject through all three layers.
 *
 * Presets are matched by SELECTOR, not by preset identity: two presets
 * that share a `selector` (e.g. every `state` preset) are treated as
 * mutually-exclusive alternatives on purpose — only the one whose `id`
 * equals the subject's current selector value is ever active, so siblings
 * sharing a governed set is the intended shape of a semantic ladder, not
 * a conflict. `assertDisjointPresets` (below) is what actually forbids
 * the real conflict: two DIFFERENT selectors both claiming one field.
 */
export function resolveField<TSubject extends Subject>(
  field: FieldSpec,
  subject: TSubject,
  presets: PresetSpec[],
): FieldTrace {
  const rawOverride = subject[field.id];
  const overrideCandidate: LayerCandidate = {
    layer: "override",
    value: rawOverride === undefined ? undefined : (rawOverride as FieldValue),
  };

  let presetCandidate: LayerCandidate = { layer: "preset", value: undefined };
  const governingPresets = presets.filter((p) => p.governs.includes(field.id));
  for (const preset of governingPresets) {
    if (subject[preset.selector] === preset.id) {
      presetCandidate = {
        layer: "preset",
        value: preset.values[field.id],
        presetId: preset.id,
      };
      break; // assertDisjointPresets guarantees at most one can ever match
    }
  }

  const defaultCandidate: LayerCandidate = { layer: "default", value: field.defaultValue };

  const candidates: FieldTrace["candidates"] = [
    overrideCandidate,
    presetCandidate,
    defaultCandidate,
  ];
  const winning = candidates.find((c) => c.value !== undefined) ?? defaultCandidate;

  return {
    field,
    resolved: winning.value as FieldValue,
    winner: winning.layer,
    winningPresetId: winning.presetId,
    candidates,
  };
}

/** `resolveField` over every field in `fields`, in the order given —
 * the cascade's analogue of `readFields`, but for one subject with full
 * provenance rather than N subjects collapsed to MIXED. Use `readFields`
 * (field.ts) when you only need N-subject agreement; use this when you
 * need to show or act on WHY a value is what it is. */
export function resolveFields<TSubject extends Subject>(
  fields: FieldSpec[],
  subject: TSubject,
  presets: PresetSpec[],
): FieldTrace[] {
  return fields.map((field) => resolveField(field, subject, presets));
}

/**
 * Structural guard for "keep each governed set closed." Throws the
 * instant two presets selected on DIFFERENT fields both claim the same
 * governed property — the real, load-bearing conflict the cascade cannot
 * resolve (which family wins?). Presets that share a `selector` (siblings
 * in one semantic ladder, e.g. every `state` member) are explicitly
 * EXEMPT — they are mutually exclusive by construction, and sharing a
 * governed set is the entire point of a preset family.
 *
 * Call once per component's presets array, from that component's own
 * `*.fields.test.ts` (§9). Never called at runtime/render time.
 */
export function assertDisjointPresets(presets: PresetSpec[]): void {
  const ownerBySelector = new Map<string, string>(); // fieldId -> selector
  for (const preset of presets) {
    for (const fieldId of preset.governs) {
      const existing = ownerBySelector.get(fieldId);
      if (existing !== undefined && existing !== preset.selector) {
        throw new Error(
          `"${fieldId}" is governed by presets selected on two different fields ` +
            `("${existing}" and "${preset.selector}"). A field may be governed by ` +
            `presets from only ONE selector — siblings on the SAME selector (e.g. ` +
            `every "state" preset) may legitimately share a governed set, since ` +
            `only one is ever active. See T1-SPEC.md §1.`,
        );
      }
      ownerBySelector.set(fieldId, preset.selector);
    }
  }
}

/** Every field id governed by at least one preset in `presets` — the set
 * a Storybook gallery story sweeping all presets (§6) must exclude from
 * its Controls, and the set a product-inspector row (§7) renders as
 * "governed" (inherited-looking) rather than freely editable. */
export function governedFieldIds(presets: PresetSpec[]): string[] {
  return Array.from(new Set(presets.flatMap((p) => p.governs)));
}
```

### 1.2 `packages/schema/src/storybook.ts` — one addition

```ts
import type { PresetSpec } from "./resolve";
// … existing imports/CONTROL/toArgTypes/defaultArgs unchanged …

/**
 * The args a story renders with to MATERIALIZE one preset: the
 * component's plain defaults, with the selector field set to the
 * preset's own id, plus the preset's governed values spelled out
 * explicitly (so a story renders correctly even in a host that does not
 * itself call `resolveFields` — Storybook's Controls addon reads `args`
 * directly, it does not run the cascade). This is the function every
 * "one story per preset" gallery (§6) is built from.
 */
export function presetArgs(
  fields: FieldSpec[],
  preset: PresetSpec,
): Record<string, FieldValue> {
  return {
    ...defaultArgs(fields),
    [preset.selector]: preset.id,
    ...(preset.values as Record<string, FieldValue>),
  };
}
```

### 1.3 `packages/schema/src/index.ts` — one addition

```ts
export * from "./field";
export * from "./storybook";
export * from "./resolve";
```

### 1.4 Worked example, so every lane reads the contract the same way

`Pill` (§4.3) stores `state: "wired"` and nothing else. Its `lineColor`
field is governed by the `"wired"` preset, which writes `lineColor:
"primary"` (a **token name**, not a hex — §3). Nobody has overridden
`lineColor` on this instance.

```ts
resolveField(LINE_COLOR_FIELD, { state: "wired" }, PILL_PRESETS)
// => {
//   field: LINE_COLOR_FIELD,
//   resolved: "primary",
//   winner: "preset",
//   winningPresetId: "wired",
//   candidates: [
//     { layer: "override", value: undefined },
//     { layer: "preset",   value: "primary", presetId: "wired" },
//     { layer: "default",  value: "foreground" },
//   ],
// }
```

Now someone reaches past the preset and pins this one Pill's line to the
danger token, without touching its semantic state:

```ts
resolveField(LINE_COLOR_FIELD, { state: "wired", lineColor: "bbox-danger" }, PILL_PRESETS)
// => { resolved: "bbox-danger", winner: "override", candidates: [
//        { layer: "override", value: "bbox-danger" },
//        { layer: "preset",   value: "primary", presetId: "wired" },
//        { layer: "default",  value: "foreground" },
//      ] }
```

The instance now stores `{ state: "wired", lineColor: "bbox-danger" }` —
two fields, not a spread-out paint record. A theme change still sweeps
every OTHER wired Pill's line colour; this one deliberately opted out of
exactly one property, and the trace says so honestly.

---

## 2. The shared appearance bundle, verbatim

`packages/bbox-ui/src/appearance.ts` and `appearance.fields.ts` are new,
owned by **Lane A**, and are the reconciliation of all six designers'
"appearance" proposals into Zach's ruled shape: **one flat property
space** a component spreads into its own field array — never a nested
`appearance` object. This is the shared bundle Zach means by *"appearance
is almost just a class of properties that a lot of different components
can inherit... I only have to write it once."*

### 2.1 What this bundle is (and isn't)

It carries the **semantic, cascade-facing** axis only: which of six
emphasis states a thing is in, an escape-hatch tone, and the diff/lint
lens. It does **not** carry literal paint (a raw colour, a line style,
opacity) — those stay per-component (Pill's own `PILL_PAINT_FIELDS`,
§4.3), because only Pill's board evidence calls for them today, and
Zach's own words rule out a generic raw-colour surface: *"there is like a
good visual color grammar that takes thinking to get right and we should
ship good defaults."* The literal paint fields are the "escape hatch at
the edges"; this bundle is the "opinionated default."

It also does **not** carry a text-size rung. Every text-bearing component
in this spec (`Port`, `TextBox`, `Glyph`) needs its OWN size ladder with
its OWN pixel values (§0's file-ownership rule is exactly why — three
components independently wanting an 18px rung is not a reason to merge
three different ladders into one shared field), so `textSize`/`size`
stays local to each component, never in the shared bundle. This overturns
`PORT-SPEC.md`'s own `APPEARANCE_FIELDS` (which bundled `textSize`
alongside `state`) — a deliberate correction now that the bundle is
genuinely shared across components with genuinely different ladders.

**Included in `APPEARANCE_FIELDS`:** `Port` ✅, `Pill` ✅, `Block` ✅ (its
chip forwards `state`/`tone` into an internal `<Pill>`, §4.8).
**Not included:** `Glyph`, `TextBox`, `RowContainer`, `Stack`, `PortEdge`
— none of them paint a state-bearing surface; each says so in its own §4
entry.

### 2.2 `packages/bbox-ui/src/appearance.ts` (new, Lane A) — verbatim

```ts
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
 * Board vocabulary (Zach, 2026-09-10 ruling): `empty · out of focus ·
 * value set · wired · data received · hidden`. One resting state is in
 * force at a time on anything that includes this bundle.
 */
export type AppearanceState =
  | "empty"
  | "outOfFocus"
  | "valueSet"
  | "wired"
  | "received"
  | "hidden";

export const APPEARANCE_STATES: AppearanceState[] = [
  "empty",
  "outOfFocus",
  "valueSet",
  "wired",
  "received",
  "hidden",
];

/** Board labels verbatim, including Zach's own spelling of "Recived". */
export const APPEARANCE_STATE_LABELS: Record<AppearanceState, string> = {
  empty: "Empty",
  outOfFocus: "Out of Focus",
  valueSet: "Default Value",
  wired: "Wired",
  received: "Data Recived",
  hidden: "Hidden",
};

/**
 * States a document format may persist. `received` means "data flowed
 * through this just now" — only a live host can know that; persisting it
 * would lie after reload. Runtime-only, host-sourced, never written to a
 * document. (`hidden` IS persistable — it is a fact about the document,
 * not the runtime.)
 */
export const PERSISTABLE_APPEARANCE_STATES = [
  "empty",
  "outOfFocus",
  "valueSet",
  "wired",
  "hidden",
] as const;

/** The two-bit reading every state resolves to: a ring/ink emphasis, and
 * whether a fill is present at all. `null` fill means hollow; `null` ring
 * means "not painted" (only `hidden`). Values are TOKEN NAMES (no leading
 * `--`) — resolve with `var(--${token})`, never a literal colour. See §3
 * for the actual token values and the contrast math behind them. */
export interface StateTokenPair {
  ring: string | null;
  fill: string | null;
}

export const STATE_TOKENS: Record<AppearanceState, StateTokenPair> = {
  empty: { ring: "foreground", fill: null },
  outOfFocus: { ring: "muted-foreground", fill: null },
  valueSet: { ring: "muted-foreground", fill: "muted" },
  wired: { ring: "primary", fill: "primary" },
  received: { ring: "bbox-received", fill: "bbox-received" },
  hidden: { ring: null, fill: null },
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
```

### 2.3 `packages/bbox-ui/src/appearance.fields.ts` (new, Lane A) — verbatim

```ts
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";
import {
  APPEARANCE_STATES,
  APPEARANCE_STATE_LABELS,
  LENSES,
  LENS_LABELS,
  TONES,
  TONE_LABELS,
} from "./appearance";

const STATE_OPTIONS: FieldOption[] = APPEARANCE_STATES.map((state) => ({
  value: state,
  label: APPEARANCE_STATE_LABELS[state],
}));

const TONE_OPTIONS: FieldOption[] = TONES.map((tone) => ({
  value: tone,
  label: TONE_LABELS[tone],
}));

const LENS_OPTIONS: FieldOption[] = LENSES.map((lens) => ({
  value: lens,
  label: LENS_LABELS[lens],
}));

export const STATE_FIELD: FieldSpec = {
  id: "state",
  label: "State",
  kind: "segments",
  defaultValue: "empty",
  options: STATE_OPTIONS,
  hint: "`received` is runtime-only — never persisted (PERSISTABLE_APPEARANCE_STATES).",
};

export const TONE_FIELD: FieldSpec = {
  id: "tone",
  label: "Tone",
  kind: "segments",
  defaultValue: "neutral",
  options: TONE_OPTIONS,
  hint: "Escape hatch for a component not colouring by state. Writes an override, not a preset — see appearance.ts's toneOverride.",
};

export const LENS_FIELD: FieldSpec = {
  id: "lens",
  label: "Lens",
  kind: "segments",
  defaultValue: "normal",
  options: LENS_OPTIONS,
};

export const LENS_BEFORE_FIELD: FieldSpec = {
  id: "lensBefore",
  label: "Lens: Before Value",
  kind: "text",
  defaultValue: "",
  hint: "The pre-change value a diff lens compares against. Empty when `lens === \"normal\"`.",
};

/**
 * The shared bundle. Spread into a component's own field array —
 * `[...APPEARANCE_FIELDS, ...OWN_FIELDS]` — never nested under an
 * `appearance` object. See docs/T1-SPEC.md §2 for which components
 * include it and which deliberately don't.
 */
export const APPEARANCE_FIELDS: FieldSpec[] = [
  STATE_FIELD,
  TONE_FIELD,
  LENS_FIELD,
  LENS_BEFORE_FIELD,
];
```

---

## 3. The colour grammar

Six states, each legible at a 12px port dot, on both canvases, reading as
a sequence, and still readable beside a cable of the same colour. The
structure (from `PORT-SPEC.md §1.3`, kept — only the source of the colour
changed under Zach's ruling) is two independent one-bit readings on two
concentric shapes:

- **the ring says how much attention this is asking for** — quiet ink,
  quieter ink, or an active hue;
- **the fill says whether it carries a value** — hollow means nothing is
  in it.

That is what makes it a *sequence* rather than six arbitrary hues: only
**two true hues** exist in the resting ladder (`wired`'s orange,
`received`'s green); everything else is a neutral ink at one of two
weights. A greyscale copy of the whole ladder still reads correctly —
ring-vs-fill survives colour-blindness and print in a way that hue alone
never does.

| State | Ring token | Fill token | Reads as |
|---|---|---|---|
| `empty` | `foreground` | *(none)* | declared, nothing in it |
| `outOfFocus` | `muted-foreground` | *(none)* | present, not the subject |
| `valueSet` | `muted-foreground` | `muted` | carries a literal |
| `wired` | `primary` | `primary` | a cable feeds it |
| `received` | `bbox-received` | `bbox-received` | data flowed just now |
| `hidden` | *(not painted)* | *(not painted)* | rolls into the container's `+N more` |

`tone`'s five members share the same "ring = fill = one token" shape as
`wired`/`received`, for the same reason: a tone is a state look, just
selected directly instead of via `state`.

| Tone | Token | Hue role |
|---|---|---|
| `neutral` | *(none — state drives)* | — |
| `accent` | `bbox-accent` | interaction (a drag hint, a focus preview) |
| `warning` | `bbox-warning` | caution, non-blocking |
| `success` | `bbox-success` | affirmative, distinct concept from `received` even though it starts at the same hue (see §3.3) |
| `danger` | `bbox-danger` | blocking / destructive |

### 3.1 Real values, and how contrast was checked

Every value below was converted OKLCH → sRGB with the standard OKLab
matrices, then checked against WCAG's relative-luminance contrast formula
(`(L1+0.05)/(L2+0.05)`) against both canvases. **Target: ≥ 3:1** — the
WCAG 1.4.11 non-text/graphical-object threshold, the right bar for a
12px ring, not the 4.5:1 body-text bar. Two of bbox-ui's existing tokens
measured **below** that bar and are corrected here; every new token was
chosen to clear it with margin. Computation lives in the shell history
this spec was authored from — Lane A's `test/appearance.test.ts` (§9)
re-derives the same hex values as literal assertions so a future edit to
`theme.css` that drifts is caught mechanically, not by eyeballing.

| Token | Light `oklch()` | Light hex | vs `#fff` | Dark `oklch()` | Dark hex | vs dark bg `#0a0a0a` |
|---|---|---|---|---|---|---|
| `foreground` | `0.19 0 0` (unchanged) | `#141414` | 18.47:1 | `0.98 0 0` (new) | `#f8f8f8` | 18.68:1 |
| `muted-foreground` | `0.51 0 0` (unchanged) | `#666666` | 5.75:1 | `0.708 0 0` (new) | `#a1a1a1` | 7.63:1 |
| `muted` | `0.92 0 0` (unchanged) | `#e4e4e4` | 1.27:1 *(a fill, not read against the canvas alone — always sits inside the `muted-foreground` ring)* | `0.269 0 0` (new) | `#262626` | 1.31:1 |
| `primary` | **`0.65 0.19 48`** (was `0.71`) | `#e76000` | **3.46:1** | `0.78 0.17 48` (new) | `#ff914b` | 8.87:1 |
| `bbox-received` | **`0.60 0.19 145`** (was `0.65`) | `#009b28` | **3.65:1** | `0.78 0.17 145` (new) | `#68d36f` | 10.50:1 |
| `bbox-warning` | `0.65 0.16 85` (new) | `#bb8500` | 3.26:1 | `0.80 0.15 85` (new) | `#eab532` | 10.49:1 |
| `bbox-success` | `0.60 0.19 145` (new — same numbers as `bbox-received`, see §3.3) | `#009b28` | 3.65:1 | `0.78 0.17 145` (new) | `#68d36f` | 10.50:1 |
| `bbox-danger` | `0.55 0.19 25` (new) | `#c92f33` | 5.35:1 | `0.72 0.17 25` (new) | `#fd736d` | 7.41:1 |
| `bbox-accent` | `0.60 0.19 264` (new) | `#4377f0` | 4.08:1 | `0.70 0.17 264` (new) | `#6799ff` | 7.16:1 |

**Two corrections to already-shipped tokens, both real findings, not
guesses:** the shipped `--primary` (`oklch(0.71 0.19 48)`, `#fc740e`)
measures **2.75:1** against white — below the 3:1 floor a `wired` ring
must clear to stay legible on its own (not merely "orange-ish", but
*readable as a ring at 12px* against a white canvas). The shipped
`--bbox-received` (`oklch(0.65 0.19 145)`) measures exactly **3.00:1** —
at the floor, with zero margin. Both are darkened by a small amount
(`0.71→0.65`, `0.65→0.60`) at the same hue and chroma, landing at
3.46:1 and 3.65:1 — still unmistakably "the same orange" and "the same
green," now with real margin. **Lane A makes this edit to `theme.css`.**

### 3.2 Hue spacing, so the sequence doesn't collide

Five hues are in play: `primary` 48°, `bbox-warning` 85°, `bbox-received`
145°, `bbox-accent` 264°, `bbox-danger` 25°. `danger` (25°) sits nearer
`primary` (48°) than any other pair (23° apart) — deliberately accepted,
because the two are never read side-by-side as competing signals on the
same field (a port is either `wired` via `state` or has a `tone`; §2.1's
`toneOverride` makes them mutually exclusive on one field by construction)
and each carries its own ring-vs-fill/shape context besides.

### 3.3 Why `bbox-received` and `bbox-success` share numbers today, and must stay two tokens

They answer different questions — `received` means "data flowed through
this just now" (a `PortState`, runtime-only, `PERSISTABLE_APPEARANCE_STATES`
excludes it); `success` means "this is affirmatively good" (a `Tone`,
author-settable, persisted normally). They happen to render identically
today because green is the obvious choice for both, but that must stay a
*coincidence a designer can undo independently*, not a fact a shared name
would freeze in. Two `theme.css` custom properties, same value, kept
separate on purpose — the same reasoning `theme.css` already applies by
shipping `--bbox-received` as its own token instead of reusing a generic
"green."

### 3.4 `outOfFocus`'s ring, decided

`outOfFocus` reuses `muted-foreground` — the same ring `valueSet` uses —
differing from it only by having no fill. This is `PORT-SPEC.md §7 Q1`'s
own recommended default, taken here as final: the ladder then reads *ring
= attention, fill = carries a value*, one rule instead of six colours to
memorise. No new token. If the two prove confusable side by side in
practice, the fix is one new token later, not a redesign.

### 3.5 `theme.css` — the concrete edit (Lane A)

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.19 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.19 0 0);
  --primary: oklch(0.65 0.19 48);           /* was 0.71 — see T1-SPEC.md §3.1 */
  --primary-foreground: oklch(0.99 0 0);
  --muted: oklch(0.92 0 0);
  --muted-foreground: oklch(0.51 0 0);
  --border: oklch(0.87 0 0);
  --ring: oklch(0.63 0 0);
  --bbox-received: oklch(0.60 0.19 145);    /* was 0.65 — see T1-SPEC.md §3.1 */
  --bbox-warning: oklch(0.65 0.16 85);
  --bbox-success: oklch(0.60 0.19 145);     /* same numbers as --bbox-received today, kept as a separate token — see T1-SPEC.md §3.3 */
  --bbox-danger: oklch(0.55 0.19 25);
  --bbox-accent: oklch(0.60 0.19 264);
}

@theme inline {
  /* … existing --color-* mappings unchanged, plus: */
  --color-bbox-warning: var(--bbox-warning);
  --color-bbox-success: var(--bbox-success);
  --color-bbox-danger: var(--bbox-danger);
  --color-bbox-accent: var(--bbox-accent);
}

/*
 * Dark canvas. Two selectors on purpose: the media query covers the
 * viewer's OS preference (the "system" default — no explicit choice
 * stamped anywhere), and `:not([data-theme="light"])` stops it from
 * fighting an explicit light choice a host stamps on its root. The
 * attribute selector covers an explicit dark choice regardless of OS
 * preference. Every token gets its dark value in BOTH places — never
 * only one — or a toggle and the OS preference disagree.
 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.98 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.98 0 0);
    --primary: oklch(0.78 0.17 48);
    --primary-foreground: oklch(0.145 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --border: oklch(1 0 0 / 12%);
    --ring: oklch(0.556 0 0);
    --bbox-received: oklch(0.78 0.17 145);
    --bbox-warning: oklch(0.80 0.15 85);
    --bbox-success: oklch(0.78 0.17 145);
    --bbox-danger: oklch(0.72 0.17 25);
    --bbox-accent: oklch(0.70 0.17 264);
  }
}

:root[data-theme="dark"] {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.98 0 0);
  --primary: oklch(0.78 0.17 48);
  --primary-foreground: oklch(0.145 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 12%);
  --ring: oklch(0.556 0 0);
  --bbox-received: oklch(0.78 0.17 145);
  --bbox-warning: oklch(0.80 0.15 85);
  --bbox-success: oklch(0.78 0.17 145);
  --bbox-danger: oklch(0.72 0.17 25);
  --bbox-accent: oklch(0.70 0.17 264);
}
```

`--bbox-warning`/`--bbox-success`/`--bbox-danger`/`--bbox-accent` are new
tokens (Pill's paint fields and every component's `tone` field resolve to
them); `--primary`/`--bbox-received` are corrected in place (§3.1); every
other existing token is carried forward unedited. This is Lane A's entire
`theme.css` diff — no lane after it touches this file.

---

## 4. Per-component specs

Every table below has five columns: **name**, **type** (closed unions
written out in full), **default**, **control**, and **layer** — one of
`token` (the field's value space is theme-token names), `preset` (a
preset actively governs this field in the component's normal
configuration, or this field IS a preset selector), `property` (plain
instance data, no preset ever touches it), or `derived` (this field's
sensible default is computed from another field, even though the
`FieldSpec` itself must still declare one static `defaultValue`).

### 4.1 Glyph

A square icon **slot** — like `Port`'s `PortLabel`, it renders whatever
content its consumer hands it and never itself resolves "a Lucide name"
or "an uploaded asset." Generalizes the already-shipped `BlockGlyph`
(`block.tsx`) without touching it.

**Files (Lane G):** `packages/bbox-ui/src/glyph.layout.ts` (new),
`glyph.fields.ts` (new), `glyph.tsx` (new),
`test/glyph.fields.test.ts` (new), `apps/storybook/src/stories/Glyph.stories.tsx` (new).

`glyph.layout.ts`:

```ts
/** Glyph's own size ladder — deliberately NOT TEXT_SIZES (layout.ts is
 * frozen for T1, and Port independently needs its own 18px rung too —
 * see T1-SPEC.md §0). 18/24/36/44 mirror TEXT_SIZES{md,lg,xl}+META_FONT_PX
 * by VALUE, not by import, so BlockGlyph's own ICON_RATIO-derived sizing
 * (22/32/40) is untouched — the two ladders coexist on purpose. */
export const GLYPH_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type GlyphSize = keyof typeof GLYPH_SIZES;
export const GLYPH_SIZE_NAMES: Record<GlyphSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};
```

| name | type | default | control | layer |
|---|---|---|---|---|
| `size` | `"sm" \| "md" \| "lg" \| "xl"` (`GlyphSize`) | `"xl"` | segmented row (4) | property |
| `padding` | `number` (px, all four sides equally) | `0` | number, `min:0`, `max:24`, `step:1` | property |
| `children` | `ReactNode` (opaque) | *(schema demo only, see below)* | `text` | property |

`children`'s `FieldSpec.defaultValue` is `"🔍"` for Storybook/inspector
demoability (`kind: "text"` cannot express "no children") — `Glyph`'s own
real destructured default is no children at all (an empty square),
exactly `Port.fields.ts`'s already-documented `children` deviation.

**Children:** one opaque child — an SVG icon, an emoji character, an
`<img>`, or nothing. Not structural (no array, no ordering).

**Not a prop:** icon *resolution* (a Lucide name → SVG, an uploaded asset
→ URL) — a future `packages/adapter-tldraw`-adjacent layer's job, never
`packages/bbox-ui`'s; the picker UI (search + grid); `x`/`y`/host `w`/`h`;
"always a square" as an interactive drag guarantee (host-owned resize
lock, `isAspectRatioLocked`-shaped); hit-testing/drag/z-order; the
rendered outer footprint (`sizePx + 2×padding`, CSS box-model arithmetic,
not a fourth field); ink colour (`currentColor`, inherited, never a
`Glyph` field).

**No `APPEARANCE_FIELDS`, no presets.** Nothing on the board or in any
donor gives Glyph a state axis.

### 4.2 TextBox

The text-leaf primitive `BlockTitle`/`BlockDescription`/`BlockType`
should eventually be built *from* (not touched in T1 — see §10). Holds
one run of text; controls how it sits in its own box.

**Files (Lane X):** `packages/bbox-ui/src/textBox.layout.ts` (new),
`textBox.fields.ts` (new, includes the `PADDING_FIELDS` bundle — see
below), `textBox.tsx` (new), `test/textBox.fields.test.ts` (new),
`apps/storybook/src/stories/TextBox.stories.tsx` (new).

`textBox.layout.ts`:

```ts
/** TextBox's own ladder — see T1-SPEC.md §0 on why this is not a shared
 * TEXT_SIZES edit. Values match the board's own Text Size row. */
export const TEXT_BOX_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type TextBoxSize = keyof typeof TEXT_BOX_SIZES;

export type TextBoxFont = "sans" | "sketch" | "mono";
export const TEXT_BOX_FONT_STACKS: Record<TextBoxFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  sketch: '"Segoe Print", "Bradley Hand", cursive',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export type TextBoxVerticalAlign = "top" | "middle" | "bottom";
export function textBoxAlignItems(align: TextBoxVerticalAlign): "flex-start" | "center" | "flex-end" {
  return align === "top" ? "flex-start" : align === "bottom" ? "flex-end" : "center";
}

export type TextBoxHorizontalAlign = "left" | "middle" | "right";
export function textBoxJustifyContent(justify: TextBoxHorizontalAlign): "flex-start" | "center" | "flex-end" {
  return justify === "left" ? "flex-start" : justify === "right" ? "flex-end" : "center";
}
```

`textBox.fields.ts` — the `PADDING_FIELDS` bundle (owned here for T1;
promote to its own file the moment a second real consumer needs it — none
does yet, see §4.3/§4.5/§4.6's own "not a prop" notes):

```ts
export const PADDING_FIELDS: FieldSpec[] = [
  { id: "paddingTop", label: "Padding: Top", kind: "number", defaultValue: 0, min: 0, step: 1, unit: "px" },
  { id: "paddingBot", label: "Padding: Bottom", kind: "number", defaultValue: 0, min: 0, step: 1, unit: "px" },
  { id: "paddingLeft", label: "Padding: Left", kind: "number", defaultValue: 0, min: 0, step: 1, unit: "px" },
  { id: "paddingRight", label: "Padding: Right", kind: "number", defaultValue: 0, min: 0, step: 1, unit: "px" },
];
```

| name | type | default | control | layer |
|---|---|---|---|---|
| `size` | `"sm" \| "md" \| "lg" \| "xl"` (`TextBoxSize`) | `"md"` | segments, options `["xl","lg","md","sm"]` (board's own descending order) | property |
| `paddingTop` | `number` (px) | `0` | number, `min:0` | property *(bundle: `PADDING_FIELDS`)* |
| `paddingBot` | `number` (px) | `0` | number, `min:0` | property *(bundle)* |
| `paddingLeft` | `number` (px) | `0` | number, `min:0` | property *(bundle)* |
| `paddingRight` | `number` (px) | `0` | number, `min:0` | property *(bundle)* |
| `font` | `"sans" \| "sketch" \| "mono"` (`TextBoxFont`) | `"sans"` | segments | property |
| `align` | `"top" \| "middle" \| "bottom"` | `"middle"` | segments | property |
| `justify` | `"left" \| "middle" \| "right"` | `"middle"` | segments | property |
| `children` | `string` (control only; real prop is `ReactNode`) | `"Text Box"` | text | property |

**Children:** scalar — one text run, never an array. Same
narrower-than-the-real-prop gap `Port`'s `children` already documents.

**Not a prop:** position/drag/resize/z-order (host); width/height of the
box (auto-sizes to content + its own padding; a *fixed* box is whatever
the consumer wraps it in — no `w`/`h` prop, matching `BlockTitle` et al.
today); edges/cables; multi-subject "Mixed" (a property of a *reading*,
never a component prop); plain DOM passthrough (`className`, `style`,
`onClick`, …) — real props, not enumerated `FieldSpec`s.

**No `APPEARANCE_FIELDS`, no presets.** No board evidence gives TextBox a
state axis; it is pure typography.

### 4.3 Pill

The flagship cascade example: a rounded-outline text slot whose **look is
driven primarily by `state`** (via `APPEARANCE_FIELDS`, shared) with a
**closed set of literal paint fields** as the escape hatch a preset
governs and an instance may individually override.

**Files (Lane L, runs after Lane A):** `packages/bbox-ui/src/pill.fields.ts`
(new), `pill.presets.ts` (new), `pill.tsx` (new), `test/pill.fields.test.ts`
(new), `apps/storybook/src/stories/Pill.stories.tsx` (new).

**Why the literal 13-hue tldraw-style swatch grid the pre-ruling Pill
design proposed is rejected:** it is exactly the raw-colour-first surface
Zach's ruling argues against. Pill's paint fields instead select from
bbox-ui's own **token names** — the same small, curated, "good defaults"
vocabulary every other coloured thing in this spec uses, not an arbitrary
hex.

`pill.fields.ts`:

```ts
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";
import { APPEARANCE_FIELDS } from "./appearance.fields";

/** The token names ANY paint field in this spec may select from — the
 * curated vocabulary, not an arbitrary colour. `"transparent"` is a real,
 * distinct 9th option (a hollow line/fill), not the absence of a value. */
export const PAINT_TOKENS = [
  "foreground",
  "muted-foreground",
  "primary",
  "bbox-received",
  "bbox-warning",
  "bbox-success",
  "bbox-danger",
  "bbox-accent",
  "transparent",
] as const;
export type PaintToken = (typeof PAINT_TOKENS)[number];

const PAINT_TOKEN_OPTIONS: FieldOption[] = PAINT_TOKENS.map((t) => ({ value: t, label: t }));

export type PillLineStyle = "solid" | "dashed" | "dotted" | "none";
export type PillFillStyle = "none" | "semi" | "solid";

/** Pill's own literal escape-hatch fields — governed by PILL_PRESETS in
 * the normal case, individually overridable (§1.4's worked example). */
export const PILL_PAINT_FIELDS: FieldSpec[] = [
  {
    id: "lineStyle", label: "Line Style", kind: "segments", defaultValue: "solid",
    options: ["solid", "dashed", "dotted", "none"].map((v) => ({ value: v, label: v })),
  },
  {
    id: "lineColor", label: "Line Color", kind: "segments", defaultValue: "foreground",
    options: PAINT_TOKEN_OPTIONS,
  },
  {
    id: "lineThickness", label: "Line Thickness", kind: "segments", defaultValue: "med",
    options: ["thin", "med", "thick"].map((v) => ({ value: v, label: v })),
  },
  {
    id: "lineOpacity", label: "Line Opacity", kind: "number", defaultValue: 1,
    min: 0, max: 1, step: 0.1,
  },
  {
    id: "fillStyle", label: "Fill Style", kind: "segments", defaultValue: "none",
    options: ["none", "semi", "solid"].map((v) => ({ value: v, label: v })),
  },
  {
    id: "fillColor", label: "Fill Color", kind: "segments", defaultValue: "transparent",
    options: PAINT_TOKEN_OPTIONS,
  },
  {
    id: "fillOpacity", label: "Fill Opacity", kind: "number", defaultValue: 1,
    min: 0, max: 1, step: 0.1,
  },
];

export const PILL_CHILDREN_FIELD: FieldSpec = {
  id: "children", label: "Label", kind: "text", defaultValue: "Pill",
  hint: "Omitting it renders the bare rounded outline with no label.",
};

export const PILL_FIELDS: FieldSpec[] = [
  ...APPEARANCE_FIELDS,
  ...PILL_PAINT_FIELDS,
  PILL_CHILDREN_FIELD,
];
```

`pill.presets.ts`:

```ts
import type { PresetSpec } from "@bbox-ui/schema";
import { APPEARANCE_STATE_LABELS, APPEARANCE_STATES } from "./appearance";

const GOVERNS = ["lineStyle", "lineColor", "fillStyle", "fillColor"];

const PRESET_PAINT: Record<string, { lineStyle: string; lineColor: string; fillStyle: string; fillColor: string }> = {
  empty: { lineStyle: "solid", lineColor: "foreground", fillStyle: "none", fillColor: "transparent" },
  outOfFocus: { lineStyle: "solid", lineColor: "muted-foreground", fillStyle: "none", fillColor: "transparent" },
  valueSet: { lineStyle: "solid", lineColor: "muted-foreground", fillStyle: "semi", fillColor: "muted-foreground" },
  wired: { lineStyle: "solid", lineColor: "primary", fillStyle: "solid", fillColor: "primary" },
  received: { lineStyle: "solid", lineColor: "bbox-received", fillStyle: "solid", fillColor: "bbox-received" },
  hidden: { lineStyle: "none", lineColor: "transparent", fillStyle: "none", fillColor: "transparent" },
};

export const PILL_PRESETS: PresetSpec[] = APPEARANCE_STATES.map((state) => ({
  id: state,
  label: APPEARANCE_STATE_LABELS[state],
  selector: "state",
  governs: GOVERNS,
  values: PRESET_PAINT[state],
}));
```

| name | type | default | control | layer |
|---|---|---|---|---|
| `state` | `AppearanceState` (6, §2) | `"empty"` | segments | preset *(selector, from bundle)* |
| `tone` | `Tone` (5, §2) | `"neutral"` | segments | property *(writes an override — §2.2's `toneOverride`; from bundle)* |
| `lens` / `lensBefore` | `Lens` (6) / `string` | `"normal"` / `""` | segments / text | property *(from bundle)* |
| `lineStyle` | `"solid" \| "dashed" \| "dotted" \| "none"` | `"solid"` | segments | preset *(governed by every `state` preset)* |
| `lineColor` | `PaintToken` (9, §4.3) | `"foreground"` | segments | preset + token |
| `lineThickness` | `"thin" \| "med" \| "thick"` | `"med"` | segments | property *(no preset governs it — always freely editable)* |
| `lineOpacity` | `number` (0–1) | `1` | number | property |
| `fillStyle` | `"none" \| "semi" \| "solid"` | `"none"` | segments | preset |
| `fillColor` | `PaintToken` (9) | `"transparent"` | segments | preset + token |
| `fillOpacity` | `number` (0–1) | `1` | number | property |
| `children` | `string` (control only) | `"Pill"` | text | property |

**Presets:** `PILL_PRESETS`, one per `AppearanceState`, `selector:
"state"`, each governing `{lineStyle, lineColor, fillStyle, fillColor}`
(never `lineThickness`/`lineOpacity`/`fillOpacity` — those stay freely
editable regardless of state, a deliberate, narrower governed set).

**Children:** scalar — one text slot, the label inside the outline. No
children renders the bare shell (outline + fill, no text) — the `NoLabel`
analogue.

**Not a prop:** position/placement inside a header (`Block`'s job, if/when
`BlockChip` composes `<Pill>` — §4.8); drag/hit-testing/z-order/selection
(host); whether the colour/style pickers render as segmented buttons or a
swatch grid (a panel/story rendering decision — see §7); `variant`
(shadcn's `default`/`secondary`/…) — not built; a legitimate future sugar
layer over these 7 fields, never a replacement; a `size`/`textSize` rung
— no board evidence; per-side padding — no board evidence for Pill
specifically (`TextBox`'s own `PADDING_FIELDS` is not spread here).

### 4.4 RowContainer

A horizontal flex row laying out an ordered, arbitrary list of children.
Paints nothing of its own.

**Files (Lane R):** `packages/bbox-ui/src/rowContainer.fields.ts` (new),
`rowContainer.tsx` (new), `test/rowContainer.fields.test.ts` (new),
`apps/storybook/src/stories/RowContainer.stories.tsx` (new).

| name | type | default | control | layer |
|---|---|---|---|---|
| `readingDirection` | `"ltr" \| "rtl"` | `"ltr"` | segments (2) | property |
| `justify` | `"start" \| "center" \| "end" \| "between"` | `"start"` | segments (4) | property |
| `align` | `"top" \| "middle" \| "bottom"` | `"middle"` | segments (3) | property |
| `height` | `number` (px; `0` = hug contents) | `0` | number, `min:0`, `max:200` | property |
| `gap` | `number` (px) | `8` | number, `min:0`, `max:24` | property |

**Children:** structural — an ordered `ReactNode[]`, DOM order = paint
order for `ltr`; `readingDirection` flips CSS `flex-direction` only, never
reorders the DOM. Not a `FieldSpec` row (`ReactNode` is not a
`FieldValue`) — composed by hand in stories/hosts, exactly `Port`'s own
multi-instance galleries already do.

**Not a prop:** width (fills the parent); orientation/row-vs-column
(that's the separate `Stack`, §4.5 — `BlockHeader`'s existing
`orientation` prop is pre-`RowContainer` tech debt, not evidence for this
field list); line/fill (does not apply — zero fields from
`APPEARANCE_FIELDS`, see below); which children are rendered
(consumer-authored); flex-wrap (no donor evidence; open, see `PORT-SPEC`-
style open-questions convention if a lane discovers a real need);
drag/hit-testing/z-order/selection (host).

**No `APPEARANCE_FIELDS`, no presets.** RowContainer paints nothing — the
one primitive in this family for which the bundle is inapplicable, not
merely unused.

### 4.5 Stack

Lays an ordered run of block-shaped children down one column: spacing
(`gap`, `gutter`), whether a member fills the column or keeps its own
width, and a two-value background "well."

**Files (Lane K):** `packages/bbox-ui/src/stack.fields.ts` (new),
`stack.tsx` (new), `test/stack.fields.test.ts` (new),
`apps/storybook/src/stories/Stack.stories.tsx` (new).

| name | type | default | control | layer |
|---|---|---|---|---|
| `gap` | `number` (px, integer, ≥0) | `12` | number, `min:0` | property |
| `gutter` | `number` (px, integer, ≥0) | `12` | number, `min:0` | property |
| `memberWidth` | `"fill" \| "own"` | `"fill"` | segments (2) | property |
| `insetBackground` | `"white" \| "soft-gray"` | `"white"` | segments (2) | token *(`"white"` = no override; `"soft-gray"` = `bg-muted` — a raised-vs-sunken CONTAINMENT toggle, not the general fill palette — see below)* |

**Children:** structural — an ordered run of stackable members (almost
always `<Block>`), top to bottom, order = array order. Not a `FieldSpec`
row, same reasoning as RowContainer's `children`; composed in stories via
JSX (`<Stack><Block/><Block/></Stack>`), never via a control.

**Not a prop:** `bodyLayout: "free" | "stack"` — `Block`'s field, the
switch deciding whether a `Stack` is used at all, not `Stack`'s own;
Inset/Edge-to-edge preset button (a host convenience that just writes
`gap`/`gutter` to `12/12` or `0/0`, not state `Stack` carries); drag/
reorder gesture (host, dnd-kit-shaped); absolute x/y of each member
(engine-owned); z-order vs. cables (host); auto-resizing the containing
`Block` (`Block`'s `autoResize` field, reading `Stack`'s reported content
height); per-child width override (real donor behaviour, explicitly
deferred there too — stays out of v1); selection (host).

**No `APPEARANCE_FIELDS`, no presets.** `insetBackground` looks
appearance-shaped but is deliberately **not** drawn from the shared
bundle: it is a raised-vs-sunken **containment** toggle, not a colour
choice, and routing it through a general fill/colour control would let
someone pick an arbitrary, semantic-breaking colour for what must stay a
two-value structural fact. If a `Region`/`Panel` primitive ever needs the
same raised/sunken toggle, that is grounds for a small, SEPARATE
"surface variant" bundle later (§10) — not for folding this into
`APPEARANCE_FIELDS`.

### 4.6 PortEdge

A flex lane along one wall of a box, holding real `<Port>` elements as
children. Answers which wall (`edge`) and how the lane distributes its
children (`layout`); cascades a default label placement to any child that
didn't set its own; can append a `+N more` disclosure row.

**Files (Lane E, runs after Lane P — it imports Port's new
`port.layout.ts`):** `packages/bbox-ui/src/portEdge.fields.ts` (new),
`portEdge.tsx` (new), `test/portEdge.fields.test.ts` (new),
`apps/storybook/src/stories/PortEdge.stories.tsx` (new).

| name | type | default | control | layer |
|---|---|---|---|---|
| `edge` | `"left" \| "right" \| "top" \| "bottom"` (`BlockSide`, from the frozen `layout.ts` — unchanged, generic) | `"left"` | segments | property |
| `layout` | `"evenly" \| "custom"` | `"evenly"` | segments | property |
| `textLayout` | `"top" \| "bot" \| "right" \| "left"` (`PortTextLayout`, from Lane P's new `port.layout.ts`) | `"right"` *(the value `inwardTextLayout("left")` produces at this table's own default `edge` — see below)* | segments | derived |
| `hiddenCount` | `number` (integer, ≥0) | `0` | number, `min:0` | property *(host-computed — see below)* |

`textLayout`'s real default is `inwardTextLayout(edge)`
(`port.layout.ts`), so it tracks whichever `edge` is actually in force —
the table's `"right"` is only that function's value AT `edge:"left"`. A
child `<Port>` that sets its own `textLayout` always wins over the
cascade; `PortEdge` only fills the gap on children that didn't set one.

`hiddenCount` is authored/host-supplied, never computed by `PortEdge`
inspecting its own `children` — the identity/visibility of hidden ports
is document/data-model state `PortEdge` structurally cannot see.

**Children:** `React.ReactNode`, expected to be zero or more `<Port>`
elements; order in the array is render order along the edge.
`PortEdge` clones each child only to inject
`textLayout={child.props.textLayout ?? cascadeValue}` — it does not
validate, sort, or otherwise interpret them. When `hiddenCount > 0` it
appends its own trailing `+{hiddenCount} more` row, never a cloned child.

**Not a prop:** per-port dot state/diameter/fill (owned entirely by the
child `Port`); the reorder gesture (host, dnd-kit — no `onReorder`
callback, by design; see §8's open note if a lane finds real need for a
read-only "order changed" signal); hit-testing/z-order/selection (host);
which ports are hidden and why (host/document model — `PortEdge` receives
only the integer); the literal pixel length of the edge (inherited CSS
sizing); per-port custom offsets under `layout:"custom"` (host-set inline
style/dnd-kit transform on each child).

**No `APPEARANCE_FIELDS`, no presets.** `PortEdge` paints nothing besides
the `+N more` text.

### 4.7 Port — rebuilt

Full rebuild per `PORT-SPEC.md`, folded through this spec's cascade/bundle
rulings. Read `PORT-SPEC.md` in full for the measured geometry (dot
diameter, ring widths, hit halo, row pitch, label insets, typography) —
none of that changes here; only the **field/props shape** below is
pinned, superseding `PORT-SPEC.md §3`'s own table where the two disagree
(mainly: `APPEARANCE_FIELDS` no longer carries `textSize`, and `tone`
resolves via `toneOverride` rather than a second preset family).

**Files (Lane P, runs after Lane A):**
`packages/bbox-ui/src/port.layout.ts` (**new** — see §0 for exactly what
moves here from the frozen `layout.ts`), `port.fields.ts` (**replace**),
`port.presets.ts` (new — empty array, see below), `port.tsx`
(**replace**), `test/port.fields.test.ts` (**replace**),
`apps/storybook/src/stories/Port.stories.tsx` (**replace**).

`port.layout.ts` (new file; carries forward, verified-correct-and-
unchanged, everything `layout.ts` currently has under its "Port", "Port
anchors on a block boundary" and "Port placement" headings — `BlockSide`,
`PortDirection`, `portAnchor`, `portSideForDirection`, `inwardTextLayout`,
`PORT_DOT_CENTER_TRANSFORM`, `portDotPlacement`, `PortLabelPlacement`,
`PortDotBox`, `portLabelOut`, `portLabelPlacement`, `BLOCK_BORDER_PX`
*(re-declared here, since the placement math needs it and `layout.ts` is
frozen — Lane P owns its own copy; this is the one deliberate constant
duplication besides the size-rung ones §0 already calls out)* — plus the
redesigned Port-state geometry):

```ts
export const PORT_DIAMETERS = { sm: 8, md: 12, lg: 18 } as const;
export type PortSize = keyof typeof PORT_DIAMETERS | number; // number = "Exact"

export const PORT_SURFACE_RING_PX = 2;
export const PORT_STATE_RING_PX = 3;
export const PORT_HIT_PX = 40;

export const PORT_ROW_PITCH_PX = 44;
export const PORT_HEADER_PITCH_PX = 20;
export const PORT_LABEL_INSET_PX = 12;
export const PORT_LABEL_HEIGHT_PX = 24;

export function portRowCentre(
  slot: number,
  opts: { headerPx: number; gapPx: number; pitchPx: number } = {
    headerPx: 48, gapPx: 8, pitchPx: PORT_ROW_PITCH_PX,
  },
): number {
  return opts.headerPx + opts.gapPx + opts.pitchPx * slot + opts.pitchPx / 2;
}

export type PortTextLayout = "top" | "bot" | "right" | "left"; // narrowed from 6

export const PORT_TEXT_LAYOUTS: PortTextLayout[] = ["top", "bot", "right", "left"];

export const PORT_LABEL_GAP = 8;

export function portFlexDirection(layout: PortTextLayout) {
  switch (layout) {
    case "top": return "column-reverse" as const;
    case "bot": return "column" as const;
    case "right": return "row" as const;
    case "left": return "row-reverse" as const;
  }
}
export function portLabelGap(_layout: PortTextLayout) { return PORT_LABEL_GAP; }

export type PortDirection = "input" | "output";
export type BlockSide = "left" | "right" | "top" | "bottom";
export function portSideForDirection(direction: PortDirection): BlockSide {
  return direction === "input" ? "left" : "right";
}
export function inwardTextLayout(side: BlockSide): PortTextLayout {
  switch (side) {
    case "left": return "right";
    case "right": return "left";
    case "top": return "bot";
    case "bottom": return "top";
  }
}

export type PortRole = "data" | "event" | "configuration" | "state" | "control" | "error";
export const PORT_ROLES: PortRole[] = ["data", "event", "configuration", "state", "control", "error"];

export type PortDecoration = "none" | "mutates" | "variadic-positional" | "variadic-keyword" | "variadic-bundled";
export const PORT_DECORATIONS: PortDecoration[] = ["none", "mutates", "variadic-positional", "variadic-keyword", "variadic-bundled"];

/** Port's own 18px "small" text rung — deliberately NOT a shared
 * TEXT_SIZES edit, see T1-SPEC.md §0. */
export const PORT_TEXT_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type PortTextSize = keyof typeof PORT_TEXT_SIZES;

// portAnchor / portDotPlacement / PORT_DOT_CENTER_TRANSFORM /
// portLabelPlacement / PortDotBox / portLabelOut carried forward verbatim
// from layout.ts's current implementation — same bodies, this file only.
```

| name | type | default | control | layer |
|---|---|---|---|---|
| `name` | `string` | `""` | text | property |
| `type` | `string` | `""` | text | property *(tints nothing — muted text beside the name only)* |
| `defaultValue` | `string` | `""` | text | property |
| `direction` | `"input" \| "output"` | `"input"` | segments | property |
| `edge` | `"left" \| "right" \| "top" \| "bottom"` | `"left"` | segments | property |
| `diameter` | `"sm" \| "md" \| "lg"` | `"md"` (→12px) | segments | property *(a free-numeric "Exact" 4th branch is deferred — no `FieldKind` combines segments+number today, see §10)* |
| `role` | `PortRole` (6) | `"data"` | segments | property |
| `decoration` | `PortDecoration` (5) | `"none"` | segments | property |
| `textLayout` | `"top" \| "bot" \| "right" \| "left"` | `"right"` | segments | derived *(sensible default is `inwardTextLayout(edge)`; table default is that function's value at `edge:"left"`)* |
| `textSize` | `"sm" \| "md" \| "lg" \| "xl"` (`PortTextSize`) | `"sm"` (→18px) | segments | property |
| `state` | `AppearanceState` (6) | `"empty"` | segments | property *(from bundle — see below: no preset governs it, since nothing else is left to override)* |
| `tone` | `Tone` (5) | `"neutral"` | segments | property *(from bundle — consumed directly by `port.tsx`'s paint lookup, §below)* |
| `lens` / `lensBefore` | `Lens` / `string` | `"normal"` / `""` | segments / text | property *(from bundle)* |
| `eligible` / `hinting` / `dragging` | `boolean` × 3 | `false` | toggle | property *(host-computed — never persisted, see below)* |
| `reveal` | `"always" \| "onHover"` | `"always"` | segments | property *(host-computed)* |
| `producers` | `number` (0–9) | `0` | number | property *(host-computed)* |
| `children` | `string` (control only) | `"Port"` | text | property *(escape hatch — see below)* |

**Why Port includes `APPEARANCE_FIELDS` but exports an EMPTY
`PORT_PRESETS: PresetSpec[] = []`:** unlike `Pill`, Port has no separate
settable paint property for a preset to govern — its ring/fill colour is
computed by one hand-written lookup, `portDotStyle(state, tone)` in
`port.tsx`, directly from `STATE_TOKENS`/`TONE_TOKENS` (`appearance.ts`).
There is nothing beneath that lookup for an instance to reach past, so
the generic preset mechanism has nothing to govern on Port. `state`'s own
`FieldTrace` (via `resolveField(STATE_FIELD, props, [])`) is therefore
always `winner: "override"` (when a caller passes `state`) or `"default"`
— correct, not degenerate: Port simply has no field for which the
`"preset"` layer is ever populated, and the inspector (§7) renders that
candidate as empty rather than fabricating one.

`port.tsx`'s paint lookup (illustrative, the real geometry per
`PORT-SPEC.md §2`):

```ts
function portDotStyle(state: AppearanceState, tone: Tone) {
  const toneToken = TONE_TOKENS[tone];
  const { ring, fill } = STATE_TOKENS[state];
  const ringToken = toneToken ?? ring;
  const fillToken = toneToken ?? fill;
  return {
    boxShadow: ringToken == null
      ? undefined
      : `0 0 0 ${PORT_SURFACE_RING_PX}px var(--card), 0 0 0 ${PORT_SURFACE_RING_PX + PORT_STATE_RING_PX}px var(--${ringToken})`,
    background: fillToken ? `var(--${fillToken})` : "transparent",
  };
}
```

**Children:** scalar text escape hatch — `Port`'s real label is the three
typed spans `name`/`type`/`defaultValue` in a direction-mirrored order
(`PORT-SPEC.md §2.1`/§3f), not one text slot; `children`, when supplied,
REPLACES that three-span rendering wholesale (a CodeMirror mount, a
`name: Type = default` one-liner) — same "escape hatch" shape as
`PORT-SPEC.md §7 Q6`'s recommended default.

**Not a prop:** everything `PORT-SPEC.md §6` already lists (bindings,
`judgeConnection`, the store/migrations, row/branch/slot planning, the
Python projection grammar, `portState`/eligibility computation, telemetry
wiring, the gutter bead's command, `effectPortId`, `portLens` selection).

### 4.8 Block — the composition, minimally rebuilt

Block's own container/header/glyph/title/description/type shell
(`block.tsx`) is **not rewritten** in T1 — `BlockGlyph`/`BlockTitle`/
`BlockDescription`/`BlockType` stay exactly as shipped (see §10 for the
deferred TextBox/Glyph-composition follow-up). Two things change,
narrowly:

1. Block gains a real `FieldSpec` array for the first time (T0 never gave
   it one).
2. `BlockChip` becomes a thin wrapper around the new `<Pill>` — the one
   concrete reuse every per-component doc that touched `BlockChip`
   independently recommended — so Block's `state`/`tone` reach its chip
   through the SAME cascade `Pill` already runs, rather than a second,
   parallel colour system.

**Files (Lane B, runs last, after every other component lane):**
`packages/bbox-ui/src/block.fields.ts` (new), `block.presets.ts` (new —
empty array, same reasoning as Port: Block forwards to `<Pill>` rather
than governing its own paint fields), `block.tsx` (**edit** — `BlockChip`
only), `test/block.fields.test.ts` (new),
`apps/storybook/src/stories/Block.stories.tsx` (new).

| name | type | default | control | layer |
|---|---|---|---|---|
| `width` / `height` | `number` (px) | `384` / `258` | number | property *(existing `BlockProps`, unchanged)* |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | segments | property *(existing `BlockHeaderProps`, unchanged)* |
| `state` | `AppearanceState` (6) | `"empty"` | segments | property *(from bundle — forwarded to the internal `<Pill>` chip only when a chip is present, else inert)* |
| `tone` | `Tone` (5) | `"neutral"` | segments | property *(from bundle, forwarded the same way)* |
| `lens` / `lensBefore` | `Lens` / `string` | `"normal"` / `""` | segments / text | property *(from bundle)* |

**`BlockChip`'s edit** (illustrative — geometry from `blockLayout.ts` is
untouched, only the painted shell changes):

```tsx
export function BlockChip({
  state = "empty",
  tone = "neutral",
  className,
  style,
  children,
  ...props
}: BlockChipProps) {
  return (
    <Pill
      state={state}
      tone={tone}
      className={cn("absolute top-1/2 -translate-y-1/2", className)}
      style={{ right: CHIP_RIGHT_IN_HEADER_PX, minWidth: CHIP.minWidth, height: CHIP.height, fontSize: META_FONT_PX, ...style }}
      {...props}
    >
      {children}
    </Pill>
  );
}
```

**Children (of `Block` itself, unchanged):** `BlockHeader`,
`BlockDescription`, `BlockType`, `BlockChip` — real React children,
composed by the consumer, exactly as today. Not restructured in T1.

**Not a prop:** everything already true of `block.tsx` today (position,
drag, resize, z-order — host-owned); `Stack`/`RowContainer` composition
inside `Block`'s body (`bodyLayout: "free" | "stack"`, named in `Stack`'s
own §4.5 as *Block's* field) — **not added to `block.fields.ts` in T1**;
Block's body-layout integration is explicitly deferred (§10), since it
requires touching `block.tsx`'s body rendering, not only its chip, and
this lane is scoped narrowly to unblock the cascade example.

---

## 5. File manifest

One row per file. **Lane** is the sole owner — no two lanes touch the
same path, ever, including at different times, except the two rows
marked **(Integration, cleanup)**, which are edits to files another
lane's absence of touching leaves safely idle until Integration's single
sequential pass.

| Path | Lane | New/Edit | Purpose |
|---|---|---|---|
| `packages/schema/src/resolve.ts` | **C** | new | cascade contract — §1.1 |
| `packages/schema/src/storybook.ts` | **C** | edit | add `presetArgs` — §1.2 |
| `packages/schema/src/index.ts` | **C** | edit | re-export `./resolve` — §1.3 |
| `packages/schema/test/resolve.test.ts` | **C** | new | `resolveField`/`resolveFields`/`assertDisjointPresets`/`governedFieldIds` unit tests |
| `packages/schema/test/storybook.test.ts` | **C** | edit | add `presetArgs` tests |
| `packages/bbox-ui/src/appearance.ts` | **A** | new | shared vocabulary + tokens — §2.2 |
| `packages/bbox-ui/src/appearance.fields.ts` | **A** | new | `APPEARANCE_FIELDS` — §2.3 |
| `packages/bbox-ui/src/theme.css` | **A** | edit | tokens + dark block — §3.5 |
| `packages/bbox-ui/test/appearance.test.ts` | **A** | new | pins state/tone/lens options + resolved hex/contrast numbers (§9) |
| `packages/bbox-ui/src/glyph.layout.ts` | **G** | new | `GLYPH_SIZES` — §4.1 |
| `packages/bbox-ui/src/glyph.fields.ts` | **G** | new | `GLYPH_FIELDS`, `GLYPH_PRESETS: [] ` |
| `packages/bbox-ui/src/glyph.tsx` | **G** | new | `Glyph` |
| `packages/bbox-ui/test/glyph.fields.test.ts` | **G** | new | pins defaults/options |
| `apps/storybook/src/stories/Glyph.stories.tsx` | **G** | new | §6 |
| `packages/bbox-ui/src/textBox.layout.ts` | **X** | new | `TEXT_BOX_SIZES`, font stacks, align/justify maps — §4.2 |
| `packages/bbox-ui/src/textBox.fields.ts` | **X** | new | `TEXT_BOX_FIELDS`, `PADDING_FIELDS`, `TEXT_BOX_PRESETS: []` |
| `packages/bbox-ui/src/textBox.tsx` | **X** | new | `TextBox` |
| `packages/bbox-ui/test/textBox.fields.test.ts` | **X** | new | pins defaults/options |
| `apps/storybook/src/stories/TextBox.stories.tsx` | **X** | new | §6 |
| `packages/bbox-ui/src/pill.fields.ts` | **L** | new | `PILL_FIELDS`, `PILL_PAINT_FIELDS`, `PAINT_TOKENS` — §4.3 |
| `packages/bbox-ui/src/pill.presets.ts` | **L** | new | `PILL_PRESETS` |
| `packages/bbox-ui/src/pill.tsx` | **L** | new | `Pill` |
| `packages/bbox-ui/test/pill.fields.test.ts` | **L** | new | pins defaults/options + `assertDisjointPresets(PILL_PRESETS)` |
| `apps/storybook/src/stories/Pill.stories.tsx` | **L** | new | §6 |
| `packages/bbox-ui/src/rowContainer.fields.ts` | **R** | new | `ROW_CONTAINER_FIELDS`, `ROW_CONTAINER_PRESETS: []` — §4.4 |
| `packages/bbox-ui/src/rowContainer.tsx` | **R** | new | `RowContainer` |
| `packages/bbox-ui/test/rowContainer.fields.test.ts` | **R** | new | pins defaults/options |
| `apps/storybook/src/stories/RowContainer.stories.tsx` | **R** | new | §6 |
| `packages/bbox-ui/src/stack.fields.ts` | **K** | new | `STACK_FIELDS`, `STACK_PRESETS: []` — §4.5 |
| `packages/bbox-ui/src/stack.tsx` | **K** | new | `Stack` |
| `packages/bbox-ui/test/stack.fields.test.ts` | **K** | new | pins defaults/options |
| `apps/storybook/src/stories/Stack.stories.tsx` | **K** | new | §6 |
| `packages/bbox-ui/src/portEdge.fields.ts` | **E** | new | `PORT_EDGE_FIELDS`, `PORT_EDGE_PRESETS: []` — §4.6 |
| `packages/bbox-ui/src/portEdge.tsx` | **E** | new | `PortEdge` |
| `packages/bbox-ui/test/portEdge.fields.test.ts` | **E** | new | pins defaults/options |
| `apps/storybook/src/stories/PortEdge.stories.tsx` | **E** | new | §6 |
| `packages/bbox-ui/src/port.layout.ts` | **P** | new | rebuilt Port geometry — §4.7 |
| `packages/bbox-ui/src/port.fields.ts` | **P** | replace | `PORT_FIELDS` — §4.7 |
| `packages/bbox-ui/src/port.presets.ts` | **P** | new | `PORT_PRESETS: []` |
| `packages/bbox-ui/src/port.tsx` | **P** | replace | rebuilt `Port`/`PortDot`/`PortLabel` |
| `packages/bbox-ui/test/port.fields.test.ts` | **P** | replace | pins defaults/options against the rebuilt component |
| `apps/storybook/src/stories/Port.stories.tsx` | **P** | replace | §6 |
| `packages/bbox-ui/src/block.fields.ts` | **B** | new | `BLOCK_FIELDS` — §4.8 |
| `packages/bbox-ui/src/block.presets.ts` | **B** | new | `BLOCK_PRESETS: []` |
| `packages/bbox-ui/src/block.tsx` | **B** | edit | `BlockChip` → wraps `<Pill>`; everything else byte-identical |
| `packages/bbox-ui/test/block.fields.test.ts` | **B** | new | pins defaults/options |
| `apps/storybook/src/stories/Block.stories.tsx` | **B** | new | §6 |
| `demos/inspector/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/index.css` | **D** | new | product inspector shell — §7 |
| `demos/inspector/src/schema/registerComponent.ts` | **D** | new | `ComponentEntry` type + `registerComponent` — §7.2 |
| `demos/inspector/src/FieldTraceRow.tsx` | **D** | new | one field's trace, collapsed + expanded — §7.3 |
| `demos/inspector/src/ComponentInspector.tsx` | **D** | new | generic panel over one registered component — §7.3 |
| `demos/inspector/src/App.tsx` | **I** | new | component picker + registry wiring (touches every component's exports — Integration-owned) |
| `packages/bbox-ui/src/layout.ts` | **I** (cleanup, sequenced after **P**) | edit | delete the superseded old Port section only (§0) |
| `packages/bbox-ui/src/index.ts` | **I** | edit | export every new module — §8 |
| `pnpm-workspace.yaml` | **I** | edit | add `- demos/inspector` |
| `registry.json`, `public/r/**`, root `package.json`, `apps/storybook/.storybook/**` | **frozen** | — | not touched by any lane (§10) |

---

## 6. The story set per component

Every component's `apps/storybook/src/stories/<Name>.stories.tsx` has
exactly this shape — mechanical, so a lane copies `Pill.stories.tsx`'s
pattern (the richest — has real presets) rather than inventing one:

1. **`meta`** — `args: defaultArgs(<NAME>_FIELDS)`, `argTypes:
   toArgTypes(<NAME>_FIELDS)`. Identical shape to T0's `Port.stories.tsx`.

2. **`Primary`** — carries the play function. For a component with no
   natural "click the dot" interaction (`Glyph`, `TextBox`,
   `RowContainer`, `Stack`), the play function instead asserts the
   rendered DOM matches `args` (e.g. `Stack`: computed `gap` equals
   `args.gap`) — never omitted; every component gets one interaction/
   assertion story, per T0's own precedent.

3. **`Presets`** — present only on a component whose `<NAME>_PRESETS` is
   non-empty (`Pill`, and later anything else that grows one). **Generated
   by mapping over the array**, not hand-written per preset:

   ```tsx
   const GOVERNED = governedFieldIds(PILL_PRESETS);
   export const Presets: Story = {
     parameters: { controls: { exclude: GOVERNED } },
     render: (args) => (
       <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
         {PILL_PRESETS.map((preset) => (
           <Pill key={preset.id} {...presetArgs(PILL_FIELDS, preset)}>
             {preset.label}
           </Pill>
         ))}
       </div>
     ),
   };
   ```

   Adding a preset to `<NAME>_PRESETS` therefore changes this story's
   rendered rows, this story's excluded-controls set, AND (§7) the
   product inspector's preset picker — with **zero edits to this file**.
   This is the literal mechanism behind Definition of Done item 3 (§9).

   **Named honesty note, pinned so no lane tries to "fix" it:** Storybook's
   static story indexer needs literally-named exports; a *named* story
   per preset (`export const Wired = …`) would therefore need its export
   name hand-added whenever a preset is added — a real technical
   constraint of CSF, not an oversight. The single `Presets` gallery story
   above is how this spec satisfies "generated from the array" without
   fighting that constraint: ONE static export, whose *body* is fully
   dynamic.

4. **One gallery story per remaining `segments` field NOT already fully
   covered by `Presets`** — identical to T0's `AllSizes`/`AllTextLayouts`
   pattern: sweep one field over its own `options`, exclude that field
   from Controls, render every other field from `args`.

5. **Edge-case stories** where a component has one worth naming:
   `NoLabel` (`Pill`, `Port`), `Empty` (`Stack` — zero children),
   `ManyChildren` (`RowContainer`, `Stack` — enough to show wrapping/
   scroll behaviour if any).

`apps/storybook/package.json`'s dependencies are unedited by any T1 lane
— T0 already added `@bbox-ui/schema` there, and no new external package
is needed for stories.

---

## 7. The product inspector

**Package/location:** a new, separate demo, `demos/inspector/` — not a
retrofit of `demos/port-inspector` (T0's Port-only panel, left as a
historical artifact — see §10) and not `apps/playground`'s existing
`@bbox-ui/inspector`-based `StylePanel` (tldraw-coupled, a different,
override-unaware system). This is the surface Zach cares about most: it
must show the trace, not only the value.

### 7.1 Shape: a generic engine (Lane D) + one wiring file (Integration)

The whole panel is **one generic engine that works for every component**,
because `resolveFields`/`FieldSpec`/`PresetSpec` are already fully
generic — there is no per-component custom rendering code to write.
**Lane D** builds this engine knowing nothing about `Port`/`Pill`/etc.
by name; **Integration** (§8) writes the one small file that registers
each real component's `<NAME>_FIELDS`/`<NAME>_PRESETS` and wires the
picker, *after* every component lane has landed — this is why
`demos/inspector/src/App.tsx` is Integration-owned in the manifest (§5)
while every other file under `demos/inspector/` is Lane D's.

`demos/inspector/src/schema/registerComponent.ts` (Lane D):

```ts
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";

export interface ComponentEntry {
  name: string;
  fields: FieldSpec[];
  presets: PresetSpec[];
  /** Renders one subject for the live preview strip — kept generic by
   * taking already-resolved props, never importing a specific component
   * type into this shared file. */
  render: (props: Record<string, unknown>) => React.ReactNode;
}

export function registerComponent(entry: ComponentEntry): ComponentEntry {
  return entry;
}
```

`demos/inspector/src/App.tsx` (Integration, illustrative shape):

```tsx
import { registerComponent } from "./schema/registerComponent";
import { PORT_FIELDS, PORT_PRESETS, Port } from "@bbox-ui/core";
import { PILL_FIELDS, PILL_PRESETS, Pill } from "@bbox-ui/core";
// … one import + one registerComponent(...) call per shipped component …

const REGISTRY = [
  registerComponent({ name: "Port", fields: PORT_FIELDS, presets: PORT_PRESETS, render: (p) => <Port {...p} /> }),
  registerComponent({ name: "Pill", fields: PILL_FIELDS, presets: PILL_PRESETS, render: (p) => <Pill {...p} /> }),
  // Glyph, TextBox, RowContainer, Stack, PortEdge, Block …
];
```

### 7.2 The trace UI (Lane D)

`demos/inspector/src/FieldTraceRow.tsx` — one row per field, collapsed by
default, expandable:

- **Collapsed:** the field's label, its **resolved** value (rendered the
  same way `PortInspectorPanel` (T0) already renders a value — a
  segmented row with the active option highlighted, or a text input), and
  a small badge naming the winning layer (`override` / `preset:
  <presetLabel>` / `default`) — devtools' own convention of showing the
  winning declaration inline, one line, no click needed.
- **Expanded** (click the badge, or a per-row disclosure triangle): all
  three `candidates` listed in cascade order, each showing its layer
  name, its held value (or "—" when `undefined`), and the preset's label
  when `presetId` is set. The winning candidate is visually marked (bold
  / a leading dot), exactly the devtools styles-pane model this spec is
  built on. A field whose `preset` candidate is always empty (e.g. every
  `Port` field — §4.7) renders that row as `—`, never fabricated.
- **`MIXED` across a multi-selection:** unchanged behaviour from T0 — a
  field where subjects disagree shows "Mixed" and a blanked control
  (`readFields`/`MIXED`, `field.ts`); provenance (per-subject traces) is
  only shown for a **single** selected subject, since "which layer won"
  is not itself an aggregable fact across N disagreeing subjects. This is
  an explicit, deliberate scope line — `resolveFields` still runs once
  per subject under the hood so a 2+-selection can report MIXED
  correctly, but the trace disclosure UI only opens for exactly one
  selected subject.

`demos/inspector/src/ComponentInspector.tsx` (Lane D) — the panel itself:
a component picker (reads `REGISTRY` by `name`), a live preview strip
(calls `entry.render` per selected subject), and one `FieldTraceRow` per
field in `entry.fields`, using `entry.presets` for the trace. Multi-
selection reuses `readFields` for the collapsed value/MIXED reading and
`resolveFields` (on the single subject, when exactly one is selected) for
the expandable trace — both already generic, no per-component branching.

### 7.3 How this differs from T0's `PortInspectorPanel`

| | T0 `PortInspectorPanel` | T1 `ComponentInspector` |
|---|---|---|
| Components | `Port` only, hand-imported | any registered component |
| Value shown | the resolved value only | resolved value + expandable 3-layer trace |
| "Overridden vs inherited" | explicitly out of scope (T0 §9) | the collapsed one-bit view of the full chain (§ intro) |
| Preset picker | none (Port had none) | a segmented row per preset-bearing selector field, generated from `entry.presets` |

---

## 8. Build order and lanes

```
        ┌─ C (cascade) ──────────────────────────────────────────────┐
        │  alone, first — everything imports packages/schema         │
        └──────────────────────────────────────────────────────────┬─┘
                                                                     │
        ┌─ A (appearance + tokens) ───────────────────────┐         │
        │  imports C only                                 │         │
        └──────────────────────────────────────────────┬──┘         │
                                                         │           │
   ┌── G (Glyph) ──┐ ┌── X (TextBox) ─┐ ┌── R (RowContainer) ─┐ ┌── K (Stack) ──┐
   │ imports C only│ │ imports C only │ │ imports C only      │ │ imports C only│
   └───────────────┘ └────────────────┘ └─────────────────────┘ └───────────────┘
             (four lanes above start the instant C lands; A is not a dependency)

        ┌─ D (inspector engine) ────────────────────────────┐
        │  imports C only, no component knowledge            │
        └────────────────────────────────────────────────────┘
             (starts the instant C lands)

        ┌─ P (Port rebuild) ─┐        ┌─ L (Pill) ─┐
        │ imports A          │        │ imports A   │
        └──────────┬─────────┘        └─────────────┘
                   │
        ┌─ E (PortEdge) ─────┐
        │ imports P's         │
        │ port.layout.ts      │
        └────────────────────┘

   B (Block) — after every other component lane (G, X, L, R, K, E, P) lands;
   composes Pill (its chip) and needs nothing else new from the others.

   I (Integration) — last, alone: index.ts, layout.ts cleanup, pnpm-workspace.yaml,
   demos/inspector/src/App.tsx, full test suite.
```

Sequencing rule, stated once: **C → A → {G, X, R, K, D in parallel with
A's tail; P, L once A lands} → E (after P) → B (after everything else) →
I.** G/X/R/K/D do not wait on A at all (they only need C) and can start
immediately once C lands; they are drawn after A above purely for layout
readability.

---

## 9. Definition of done

Every command exits 0; every observation holds. Run in this order.

1. `pnpm --filter @bbox-ui/schema run typecheck && pnpm --filter @bbox-ui/schema run test` — exit 0, including new `resolve.test.ts`. Observation: `assertDisjointPresets` throws for a synthetic two-selector overlap fixture in the test, and does **not** throw for a synthetic same-selector sibling-sharing fixture (the exact distinction §1.1 draws).
2. `pnpm --filter @bbox-ui/core run typecheck && pnpm --filter @bbox-ui/core run test` — exit 0. Every `*.fields.test.ts` (Glyph/TextBox/Pill/RowContainer/Stack/PortEdge/Port/Block) passes, each reading its defaults/options off the REAL component (calling it as a plain function, T0's own `port.fields.test.ts` pattern) — never a retyped literal.
3. **Pill's own test additionally asserts:** every `governs` entry in `PILL_PRESETS` has a matching key in that preset's `values`; `assertDisjointPresets(PILL_PRESETS)` does not throw; `resolveField` on `lineColor` with `{state:"wired"}` returns `winner:"preset", winningPresetId:"wired", resolved:"primary"`; the same call with `{state:"wired", lineColor:"bbox-danger"}` returns `winner:"override", resolved:"bbox-danger"` — the §1.4 worked example, executed, not merely asserted in prose.
4. `pnpm --filter bbox-storybook run typecheck` — exit 0.
5. `pnpm run build` (root) — exit 0. Observation: `git status --porcelain registry.json public/r` is **empty** — T1 touches neither (§10).
6. `pnpm run test` (root, `-r`) — exit 0 across every package, including the untouched `registrySnapshot.test.ts` and every existing `adapter-tldraw`/`adapter-reactflow` test (§0's Integration fallout note: if the `layout.ts` cleanup breaks an adapter import, Integration fixes the adapter's import path as part of this step, before declaring done).
7. `pnpm --filter bbox-storybook run storybook` — serves; every new `*.stories.tsx` file appears in the sidebar under `Components/<Name>`; `Pill`'s `Presets` story renders six rows with none of `lineStyle`/`lineColor`/`fillStyle`/`fillColor` editable in Controls (they're excluded) while `lineThickness`/`lineOpacity`/`fillOpacity` remain editable.
8. **The one-edit observation, exercised, not asserted:** add a 7th synthetic entry to `PILL_PRESETS` in a scratch branch (e.g. `id: "test"`, reusing `wired`'s governed values) and confirm, with no other file touched: it appears as a 7th row in `Pill`'s `Presets` story; it appears as a 7th option in `demos/inspector`'s Pill state selector; `governedFieldIds(PILL_PRESETS)` still returns the same 4 ids. Revert the scratch edit.
9. `pnpm --filter demo-inspector run dev` — serves. Selecting a single `Pill` subject with `state: "wired"` and expanding the `lineColor` row shows three candidates (override empty, preset "wired" → `primary`, default → `foreground`) with the middle one marked as the winner; setting an explicit `lineColor` override on that subject moves the winner marker to the top row without changing the other two candidates' displayed values.
10. Selecting two `Port` subjects with differing `state` shows the `state` row as `Mixed`; selecting exactly one of them expands correctly with `preset` always `—` (§4.7's honest-empty case).
11. All servers/headless Chrome instances started for steps 7 and 9 are stopped; `ss -ltnp | grep -E "5420|5421|5422"` (or whichever ports Lane D's `vite.config.ts` and Storybook use) returns nothing.

---

## 10. Non-goals

- **Edges / cables** — no connection, wiring, or edge-drawing work; `PortEdge` lays out `<Port>` children, it does not draw a cable between two of them.
- **The Python meaning** of any port/type/signature — unchanged from `PORT-SPEC.md §6`'s own non-goal list.
- **Registry items** — `registry.json` / `public/r/**` untouched, same reasoning as T0 §9: these new modules are consumed via the pnpm workspace only.
- **The CodeField merge** — unrelated to this task.
- **Unifying the three independent 18px "small" text ladders** (`Glyph`'s `GLYPH_SIZES.sm`, `TextBox`'s `TEXT_BOX_SIZES.sm`, `Port`'s `PORT_TEXT_SIZES.sm`) into one shared constant. Deliberately kept separate for T1 (§0); a real, worthwhile follow-up once all three have shipped and nobody's frozen test blocks the merge.
- **Rebuilding `BlockTitle`/`BlockDescription`/`BlockType` atop `TextBox`**, or `BlockGlyph` atop `Glyph` — both explicitly flagged as follow-ups in §4.1/§4.2, not attempted here; their existing ladders don't match the new components' ladders, and reconciling them is a separate, real design decision.
- **`Block`'s `bodyLayout: "free" | "stack"` integration** — `Stack`/`RowContainer` ship as standalone, composable primitives; wiring them into `Block`'s body as a live layout mode is deferred (§4.8).
- **A `"swatches"`/colour-picker `FieldKind`** — `Pill`'s paint fields use `kind: "segments"` over the curated `PAINT_TOKENS` list (9 options), which is small enough to read as a segmented row; a dedicated swatch-grid control kind remains a real, later, `packages/schema`-level decision, same status T0 §9 already gave it.
- **A combined segments+number `FieldKind`** for Port's `diameter` "Exact" branch — deferred; `diameter` ships as a 3-way segmented field only in T1.
- **A shared "surface variant" (raised/sunken) bundle** for `Stack`'s `insetBackground` and any future `Region`/`Panel` — flagged in §4.5 as a plausible later bundle, not built now.
- **Retrofitting T0's `demos/port-inspector`** — left exactly as T0 shipped it, a historical single-component artifact; `demos/inspector` (§7) is the new, general surface.
- **Merging to `main`** — a separate, later, human decision, unchanged from T0's own standing rule.
