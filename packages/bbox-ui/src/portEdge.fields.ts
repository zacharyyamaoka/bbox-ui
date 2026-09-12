/**
 * packages/bbox-ui/src/portEdge.fields.ts
 *
 * `PortEdge`'s controllable props as data — the declaration half of the
 * schema-driven loop (T0's pattern, generalized in T1). Every `id` below
 * is a REAL `PortEdgeProps` key (see `./portEdge.tsx`); `readFields`/
 * `toArgTypes` look subjects up by that key directly.
 *
 * No `APPEARANCE_FIELDS`, no presets: `PortEdge` paints nothing besides
 * its own `+N more` disclosure text (T1-SPEC.md §4.6) — `PORT_EDGE_PRESETS`
 * is the empty-array shape every consumer (the generic story generator,
 * the generic inspector) can still `.map()` over without a null check.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import {
  BLOCK_SIDES,
  BLOCK_SIDE_LABELS,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_LAYOUT_LABELS,
} from "./port.layout";

/**
 * DEVIATION from T1-SPEC.md §4.6's own text ("BlockSide, from the frozen
 * layout.ts — unchanged, generic"): the real, landed `port.layout.ts`
 * re-declares `BlockSide` itself (`BLOCK_SIDES`/`BLOCK_SIDE_LABELS`
 * alongside it) — the same "one deliberate constant duplication" pattern
 * `port.layout.ts`'s own file banner already documents for
 * `BLOCK_BORDER_PX`. §0's master export-lifetime list also names
 * `BlockSide` as one of the exports that dies from `layout.ts` once
 * `port.layout.ts` lands. Importing the frozen `layout.ts` copy here
 * would therefore import an export Integration is going to delete out
 * from under this file; the source (and §0) wins over §4.6's own prose.
 */
const EDGE_OPTIONS: FieldOption[] = BLOCK_SIDES.map((side) => ({
  value: side,
  label: BLOCK_SIDE_LABELS[side],
}));

/** Not `PortEdgeLayout`-shared with anything else — this component's own
 * two distribution modes. */
export type PortEdgeLayout = "evenly" | "custom";

const LAYOUTS: PortEdgeLayout[] = ["evenly", "custom"];

const LAYOUT_LABELS: Record<PortEdgeLayout, string> = {
  evenly: "Evenly",
  custom: "Custom",
};

const LAYOUT_OPTIONS: FieldOption[] = LAYOUTS.map((layout) => ({
  value: layout,
  label: LAYOUT_LABELS[layout],
}));

const TEXT_LAYOUT_OPTIONS: FieldOption[] = PORT_TEXT_LAYOUTS.map((layout) => ({
  value: layout,
  label: PORT_TEXT_LAYOUT_LABELS[layout],
}));

/**
 * `PortEdge`'s four controllable props, in the order a panel should draw
 * them. Every `defaultValue` equals that prop's real default in
 * `portEdge.tsx` — `test/portEdge.fields.test.ts` pins this — with one
 * documented exception (`textLayout`, below).
 */
export const PORT_EDGE_FIELDS: FieldSpec[] = [
  {
    id: "edge",
    label: "Edge",
    kind: "segments",
    defaultValue: "left",
    options: EDGE_OPTIONS,
  },
  {
    id: "layout",
    label: "Layout",
    kind: "segments",
    defaultValue: "evenly",
    options: LAYOUT_OPTIONS,
    hint: "\"custom\" leaves per-port offsets to the host (inline style / dnd-kit transform) — PortEdge applies no distribution of its own.",
  },
  {
    id: "textLayout",
    label: "Text Layout",
    kind: "segments",
    // NOTE (deviation, see T1-SPEC.md §4.6): PortEdge's real default for
    // this field is not a static value — it's `inwardTextLayout(edge)`
    // (`./port.layout`), so it tracks whichever `edge` is actually in
    // force. "right" is only that function's value AT this table's own
    // default, `edge:"left"`. A child `<Port>` that sets its own
    // `textLayout` always wins over this cascade value; PortEdge only
    // fills the gap on children that didn't set one.
    defaultValue: "right",
    options: TEXT_LAYOUT_OPTIONS,
    hint: "Cascades to any child Port that didn't set its own textLayout. Real default is inwardTextLayout(edge), not a fixed value.",
  },
  {
    id: "hiddenCount",
    label: "Hidden Count",
    kind: "number",
    defaultValue: 0,
    min: 0,
    step: 1,
    hint: "Host/document-supplied — PortEdge cannot see which ports are hidden or why; it only renders the trailing \"+N more\" row.",
  },
];

/** `PortEdge` governs nothing through the preset layer — see this file's
 * own top comment. */
export const PORT_EDGE_PRESETS: PresetSpec[] = [];
