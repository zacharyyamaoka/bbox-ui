/**
 * packages/bbox-ui/src/block.fields.ts
 *
 * `Block`'s first `FieldSpec` array (T1-SPEC.md §4.8 — Block was never
 * given one in T0). Two of `Block`'s/`BlockHeader`'s own real props
 * (`width`/`height`, `orientation`) plus the shared `APPEARANCE_FIELDS`
 * bundle. `state`/`tone`/`lens`/`lensBefore` are NOT props of `Block`
 * itself — they route through the SAME cascade to whichever child is a
 * `<BlockChip>` (now a thin `<Pill>` wrapper, `./block.tsx`), so a story
 * or host wires them onto that child; wherever no chip is composed, they
 * are simply inert (§4.8's own "forwarded … only when a chip is present,
 * else inert").
 *
 * WHY no `bodyLayout`/paint fields here: `Block`'s body-layout integration
 * (`Stack`/`RowContainer` composition) and its own literal paint fields are
 * explicitly deferred, non-goals for this lane (T1-SPEC.md §4.8, §10) —
 * this array is intentionally narrow, not an oversight.
 */
import type { FieldSpec } from "@bbox-ui/schema";
import { APPEARANCE_FIELDS } from "./appearance.fields";
import { SIMPLE_BLOCK } from "./layout";

export const WIDTH_FIELD: FieldSpec = {
  id: "width",
  label: "Width",
  kind: "number",
  defaultValue: SIMPLE_BLOCK.width,
  unit: "px",
  group: "size",
};

export const HEIGHT_FIELD: FieldSpec = {
  id: "height",
  label: "Height",
  kind: "number",
  defaultValue: SIMPLE_BLOCK.height,
  unit: "px",
  group: "size",
};

export const BLOCK_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type BlockOrientation = (typeof BLOCK_ORIENTATIONS)[number];

export const ORIENTATION_FIELD: FieldSpec = {
  id: "orientation",
  label: "Orientation",
  kind: "segments",
  defaultValue: "horizontal",
  options: BLOCK_ORIENTATIONS.map((o) => ({
    value: o,
    label: o === "horizontal" ? "Horizontal" : "Vertical",
  })),
};

/**
 * Own fields first, then the shared bundle — matching the row order
 * T1-SPEC.md §4.8's own per-field table pins (width/height, orientation,
 * then state/tone/lens/lensBefore), the reverse of `Pill`'s own
 * bundle-first ordering (`pill.fields.ts`) since here the bundle fields
 * don't belong to `Block` itself.
 */
export const BLOCK_FIELDS: FieldSpec[] = [
  WIDTH_FIELD,
  HEIGHT_FIELD,
  ORIENTATION_FIELD,
  ...APPEARANCE_FIELDS,
];
