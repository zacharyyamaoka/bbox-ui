/**
 * packages/bbox-ui/src/region.fields.ts
 *
 * `Region`'s controllable props as data. `kind` (For/While/If) is its only
 * closed-vocabulary field; `width`/`height`/`radius` are plain geometry,
 * the same shape as `block.fields.ts`'s own `WIDTH_FIELD`/`HEIGHT_FIELD`/
 * `RADIUS_FIELD`. See `region.presets.ts` for why a Region has no `view`
 * selector of its own.
 */
import type { FieldSpec } from "@bbox-ui/schema";

export const REGION_KINDS = ["for", "while", "if"] as const;
export type RegionKind = (typeof REGION_KINDS)[number];
export const REGION_KIND_LABELS: Record<RegionKind, string> = {
  for: "For",
  while: "While",
  if: "If",
};

export const REGION_KIND_FIELD: FieldSpec = {
  id: "kind",
  label: "Kind",
  kind: "segments",
  defaultValue: "for",
  options: REGION_KINDS.map((k) => ({ value: k, label: REGION_KIND_LABELS[k] })),
};

// Paired on one row, same discipline as WIDTH_FIELD/HEIGHT_FIELD's shared
// `group: "size"` — these two are one value (the region's box), not two
// fields that merely happen to be adjacent (`FieldSpec.group`'s own WHY,
// packages/schema/src/field.ts).
export const REGION_WIDTH_FIELD: FieldSpec = {
  id: "width",
  label: "Width",
  kind: "number",
  defaultValue: 560,
  unit: "px",
  group: "layout",
};

export const REGION_HEIGHT_FIELD: FieldSpec = {
  id: "height",
  label: "Height",
  kind: "number",
  defaultValue: 360,
  unit: "px",
  group: "layout",
};

export const REGION_RADIUS_FIELD: FieldSpec = {
  id: "radius",
  label: "Radius",
  kind: "number",
  defaultValue: 8,
  min: 0,
  max: 32,
  unit: "px",
};

export const REGION_FIELDS: FieldSpec[] = [
  REGION_KIND_FIELD,
  REGION_WIDTH_FIELD,
  REGION_HEIGHT_FIELD,
  REGION_RADIUS_FIELD,
];
