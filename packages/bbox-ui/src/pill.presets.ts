/**
 * packages/bbox-ui/src/pill.presets.ts
 *
 * `PILL_PRESETS` — one per `AppearanceState`, each a `state`-selected,
 * mutually exclusive alternative governing Pill's four line/fill paint
 * fields (never `lineThickness`/`lineOpacity`/`fillOpacity` — those stay
 * freely editable regardless of state, a deliberate, narrower governed
 * set; see docs/T1-SPEC.md §4.3).
 *
 * NOTE (deviation, reported loudly per the T1 lane brief): `valueSet`'s
 * `fillColor` below is `"muted-foreground"`, copied verbatim from
 * T1-SPEC.md's own pinned `pill.presets.ts` code block (§4.3) — but
 * T1-SPEC.md §2.2's `STATE_TOKENS.valueSet` (appearance.ts, already
 * shipped by Lane A) instead pairs a `"muted-foreground"` ring with a
 * `"muted"` fill, and §3's colour-grammar table repeats that "muted" fill
 * reading. This is a disagreement inside the spec itself (verbatim code
 * vs. its own worked table), not a spec-vs-real-component conflict this
 * lane has standing to resolve — kept exactly as pinned; see the lane
 * report for the flag.
 */
import type { PresetSpec } from "@bbox-ui/schema";
import { APPEARANCE_STATE_LABELS, APPEARANCE_STATES } from "./appearance";

const GOVERNS = ["lineStyle", "lineColor", "fillStyle", "fillColor"];

const PRESET_PAINT: Record<
  string,
  { lineStyle: string; lineColor: string; fillStyle: string; fillColor: string }
> = {
  empty: { lineStyle: "solid", lineColor: "foreground", fillStyle: "none", fillColor: "transparent" },
  outOfFocus: {
    lineStyle: "solid",
    lineColor: "muted-foreground",
    fillStyle: "none",
    fillColor: "transparent",
  },
  valueSet: {
    lineStyle: "solid",
    lineColor: "muted-foreground",
    fillStyle: "semi",
    fillColor: "muted-foreground",
  },
  wired: { lineStyle: "solid", lineColor: "primary", fillStyle: "solid", fillColor: "primary" },
  received: {
    lineStyle: "solid",
    lineColor: "bbox-received",
    fillStyle: "solid",
    fillColor: "bbox-received",
  },
  hidden: { lineStyle: "none", lineColor: "transparent", fillStyle: "none", fillColor: "transparent" },
};

export const PILL_PRESETS: PresetSpec[] = APPEARANCE_STATES.map((state) => ({
  id: state,
  label: APPEARANCE_STATE_LABELS[state],
  selector: "state",
  governs: GOVERNS,
  values: PRESET_PAINT[state],
}));
