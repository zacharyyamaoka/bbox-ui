/**
 * packages/bbox-ui/src/bar.fields.ts
 *
 * `Bar`'s controllable props as data. `edge`, `left`, `center` and `right`
 * are deliberately absent: the edge follows from which slot the bar fills
 * and the three cells are slots of its own — structural, never a row.
 */
import type { FieldSpec } from "@bbox-ui/schema";

import { APPEARANCE_FIELDS } from "./appearance.fields";
import { BAR_LINE_FIELDS } from "./bar.presets";
import { BAR_SIZE_LABELS, BAR_SIZES } from "./bar";

export const BAR_SIZE_FIELD: FieldSpec = {
  id: "size",
  label: "Size",
  kind: "segments",
  defaultValue: "md",
  options: BAR_SIZES.map((s) => ({ value: s, label: BAR_SIZE_LABELS[s] })),
  // The rung a header hands down: every slot inside inherits it, and each
  // member inside those may override it locally.
  cascades: true,
  hint: "Sets the bar's height and is the size its members inherit.",
};

export const BAR_FIELDS: FieldSpec[] = [
  { id: "hidden", label: "Hidden", kind: "toggle", defaultValue: false, hint: "The Block draws nothing for this region; its members are kept." },
  { id: "line", label: "Line", kind: "toggle", defaultValue: true, hint: "The dividing line toward the body." },
  BAR_SIZE_FIELD,
  { id: "padding", label: "Padding", kind: "number", defaultValue: 6, min: 0, max: 32, unit: "px" },
  ...APPEARANCE_FIELDS,
  ...BAR_LINE_FIELDS,
];

export { BAR_PRESETS } from "./bar.presets";
