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
 * `VIEW_FIELD` and the six face fields below (P2 "views are presets",
 * reports/view-switching-proposals-2026-09-11.html) are new: `view`
 * selects one of `block.presets.ts`'s three `BLOCK_PRESETS`, each
 * governing a closed set over the six face fields plus width/height. The
 * face fields' own defaults equal the "simple" preset's values, so a bare
 * `BlockFace` (`./blockFace.tsx`) resolves identically through preset or
 * default — the same "bare == the obvious preset" invariant `port.fields.ts`
 * already carries for `size`.
 *
 * WHY no `bodyLayout`/paint fields here: `Block`'s body-layout integration
 * (`Stack`/`Flex` composition) and its own literal paint fields are
 * explicitly deferred, non-goals for this lane (T1-SPEC.md §4.8, §10) —
 * this array is intentionally narrow, not an oversight.
 */
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";
import { APPEARANCE_FIELDS } from "./appearance.fields";
import { SIMPLE_BLOCK } from "./layout";
import { BLOCK_RADIUS_DEFAULT } from "./block";
import { BLOCK_VIEWS, BLOCK_VIEW_LABELS } from "./block.view";

/* ------------------------------------------------------------------ */
/* view — the selector (P2 "views are presets")                        */
/* ------------------------------------------------------------------ */

const VIEW_OPTIONS: FieldOption[] = BLOCK_VIEWS.map((view) => ({
  value: view,
  label: BLOCK_VIEW_LABELS[view],
}));

export const VIEW_FIELD: FieldSpec = {
  id: "view",
  label: "View",
  kind: "segments",
  defaultValue: "simple",
  options: VIEW_OPTIONS,
  hint: "Selects the Simple / Port / Expanded preset; every governed row below traces back to it.",
};

/* ------------------------------------------------------------------ */
/* The six face fields a view preset governs                           */
/* ------------------------------------------------------------------ */

export const BLOCK_HEADER_MODES = ["centered", "band"] as const;
export type BlockHeaderMode = (typeof BLOCK_HEADER_MODES)[number];
export const BLOCK_HEADER_MODE_LABELS: Record<BlockHeaderMode, string> = {
  centered: "Centered",
  band: "Band",
};

export const BLOCK_PORTS_MODES = ["anonymous", "rows", "walls"] as const;
export type BlockPortsMode = (typeof BLOCK_PORTS_MODES)[number];
export const BLOCK_PORTS_MODE_LABELS: Record<BlockPortsMode, string> = {
  anonymous: "Anonymous",
  rows: "Rows",
  walls: "Walls",
};

export const BLOCK_MEMBERS_MODES = ["hidden", "shown"] as const;
export type BlockMembersMode = (typeof BLOCK_MEMBERS_MODES)[number];
export const BLOCK_MEMBERS_MODE_LABELS: Record<BlockMembersMode, string> = {
  hidden: "Hidden",
  shown: "Shown",
};

export const BLOCK_TYPE_PLACEMENTS = ["bottom", "header"] as const;
export type BlockTypePlacement = (typeof BLOCK_TYPE_PLACEMENTS)[number];
export const BLOCK_TYPE_PLACEMENT_LABELS: Record<BlockTypePlacement, string> = {
  bottom: "Bottom",
  header: "Header",
};

/**
 * Defaults equal the "simple" preset's own values (see `block.presets.ts`)
 * — a `BlockFace` with no `view`/override set resolves through the
 * `default` cascade layer to exactly what `view: "simple"` resolves
 * through the `preset` layer, so the two are indistinguishable to a
 * reader, exactly Pill's own paint-field default discipline.
 */
export const HEADER_FIELD: FieldSpec = {
  id: "header",
  label: "Header",
  kind: "segments",
  defaultValue: "centered",
  options: BLOCK_HEADER_MODES.map((v) => ({ value: v, label: BLOCK_HEADER_MODE_LABELS[v] })),
  hint: "Centered: Simple's hand-rolled icon+title stack. Band: an edge-to-edge Bar.",
};

export const PORTS_FIELD: FieldSpec = {
  id: "ports",
  label: "Ports",
  kind: "segments",
  defaultValue: "anonymous",
  options: BLOCK_PORTS_MODES.map((v) => ({ value: v, label: BLOCK_PORTS_MODE_LABELS[v] })),
  hint: "Anonymous: stable ids only, nothing painted. Rows: a list in the body. Walls: dots on the boundary.",
};

export const MEMBERS_FIELD: FieldSpec = {
  id: "members",
  label: "Members",
  kind: "segments",
  defaultValue: "hidden",
  options: BLOCK_MEMBERS_MODES.map((v) => ({ value: v, label: BLOCK_MEMBERS_MODE_LABELS[v] })),
  hint: "Shown mounts the body region; hidden paints nothing (the member list itself is untouched).",
};

export const DESCRIPTION_FIELD: FieldSpec = {
  id: "description",
  label: "Description",
  kind: "toggle",
  defaultValue: true,
};

export const TYPE_PLACEMENT_FIELD: FieldSpec = {
  id: "typePlacement",
  label: "Type Placement",
  kind: "segments",
  defaultValue: "bottom",
  options: BLOCK_TYPE_PLACEMENTS.map((v) => ({ value: v, label: BLOCK_TYPE_PLACEMENT_LABELS[v] })),
};

export const FOOTER_FIELD: FieldSpec = {
  id: "footer",
  label: "Footer",
  kind: "toggle",
  defaultValue: false,
};

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

export const RADIUS_FIELD: FieldSpec = {
  id: "radius",
  label: "Radius",
  kind: "number",
  defaultValue: BLOCK_RADIUS_DEFAULT,
  min: 0,
  max: 32,
  unit: "px",
  hint: "0 is edge-to-edge. The header and footer clip to it.",
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
 * `view` first (the selector), then the six face fields it governs, then
 * Block's own geometry fields, then the shared bundle — matching
 * T1-SPEC.md §4.8's original row order (width/height, orientation, then
 * state/tone/lens/lensBefore) for everything after the new view fields,
 * the reverse of `Pill`'s own bundle-first ordering (`pill.fields.ts`)
 * since here the bundle fields don't belong to `Block` itself.
 */
export const BLOCK_FIELDS: FieldSpec[] = [
  VIEW_FIELD,
  HEADER_FIELD,
  PORTS_FIELD,
  MEMBERS_FIELD,
  DESCRIPTION_FIELD,
  TYPE_PLACEMENT_FIELD,
  FOOTER_FIELD,
  WIDTH_FIELD,
  HEIGHT_FIELD,
  RADIUS_FIELD,
  ORIENTATION_FIELD,
  ...APPEARANCE_FIELDS,
];
