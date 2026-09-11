/**
 * packages/bbox-ui/src/pill.fields.ts
 *
 * `Pill`'s controllable props as data. `Pill` is the flagship cascade
 * example (docs/T1-SPEC.md §4.3): its look is driven primarily by `state`
 * (via the shared `APPEARANCE_FIELDS` bundle) with a closed set of literal
 * paint fields — `PILL_PAINT_FIELDS` — as the escape hatch a preset governs
 * and an instance may individually override (see `./pill.tsx` and
 * `./pill.presets.ts`).
 *
 * WHY the literal 13-hue tldraw-style swatch grid the pre-ruling Pill
 * design proposed is rejected: it is exactly the raw-colour-first surface
 * Zach's ruling argues against ("there is like a good visual color grammar
 * that takes thinking to get right and we should ship good defaults").
 * Pill's paint fields instead select from bbox-ui's own curated TOKEN
 * NAMES, not an arbitrary hex.
 */
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

/**
 * T1-SPEC.md §4.3 pins these three as inline literal unions with no
 * exported array (`"solid" | "dashed" | "dotted" | "none"` etc., built
 * inline as `[...].map(...)`). Pulled out as real exported `as const`
 * arrays here — same values, same order, same behaviour — purely so
 * `pill.fields.test.ts` can pin `FieldSpec.options` against a real runtime
 * union (the T0/Port convention: `PORT_STATES`, `PORT_TEXT_LAYOUTS`, …)
 * instead of a second hand-typed literal that could silently drift from
 * the first. Reported as a lane-scoped deviation, not a spec disagreement.
 */
export const PILL_LINE_STYLES = ["solid", "dashed", "dotted", "none"] as const;
export type PillLineStyle = (typeof PILL_LINE_STYLES)[number];

export const PILL_FILL_STYLES = ["none", "semi", "solid"] as const;
export type PillFillStyle = (typeof PILL_FILL_STYLES)[number];

export const PILL_LINE_THICKNESSES = ["thin", "med", "thick"] as const;
export type PillLineThickness = (typeof PILL_LINE_THICKNESSES)[number];

/** Pill's own literal escape-hatch fields — governed by PILL_PRESETS in
 * the normal case, individually overridable (see the §1.4 worked example,
 * `pill.tsx`'s cascade call, and `pill.fields.test.ts`). */
export const PILL_PAINT_FIELDS: FieldSpec[] = [
  {
    id: "lineStyle",
    label: "Line Style",
    kind: "segments",
    defaultValue: "solid",
    options: PILL_LINE_STYLES.map((v) => ({ value: v, label: v })),
  },
  {
    id: "lineColor",
    label: "Line Color",
    kind: "segments",
    defaultValue: "foreground",
    options: PAINT_TOKEN_OPTIONS,
  },
  {
    id: "lineThickness",
    label: "Line Thickness",
    kind: "segments",
    defaultValue: "med",
    options: PILL_LINE_THICKNESSES.map((v) => ({ value: v, label: v })),
  },
  {
    id: "lineOpacity",
    label: "Line Opacity",
    kind: "number",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    id: "fillStyle",
    label: "Fill Style",
    kind: "segments",
    defaultValue: "none",
    options: PILL_FILL_STYLES.map((v) => ({ value: v, label: v })),
  },
  {
    id: "fillColor",
    label: "Fill Color",
    kind: "segments",
    defaultValue: "transparent",
    options: PAINT_TOKEN_OPTIONS,
  },
  {
    id: "fillOpacity",
    label: "Fill Opacity",
    kind: "number",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.1,
  },
];

export const PILL_CHILDREN_FIELD: FieldSpec = {
  id: "children",
  label: "Label",
  kind: "text",
  defaultValue: "Pill",
  hint: "Omitting it renders the bare rounded outline with no label.",
};

export const PILL_FIELDS: FieldSpec[] = [
  ...APPEARANCE_FIELDS,
  ...PILL_PAINT_FIELDS,
  PILL_CHILDREN_FIELD,
];
