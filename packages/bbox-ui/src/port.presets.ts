/**
 * packages/bbox-ui/src/port.presets.ts
 *
 * `PORT_PRESETS` — one per `PortSizeRung` ("size", `port.fields.ts`'s own
 * cascading field), each a `size`-selected, mutually exclusive alternative
 * governing `diameter` and `textSize` together (Zach, 2026-09-11: "one
 * size rung, the same four names on every leaf" — a header hands its own
 * `size` down to its Ports, and one control should move both the dot and
 * its label instead of the two drifting independently). Port's colour is
 * still the hand-written `portDotStyle(state, tone)` lookup (./port.tsx)
 * this file's own earlier version described — that part is unaffected;
 * only the SIZE ladder now has a real governed set.
 *
 * Port's own diameter ladder tops out at "lg" (18px, `PORT_DIAMETERS`) —
 * it has no separate "xl" dot — so the "xl" size rung pairs that largest
 * real diameter with the largest text ("xl", 44px) rather than inventing
 * a fourth dot size nothing else on the board uses.
 */
import type { PresetSpec } from "./schema";

import {
  PORT_SIZE_RUNGS,
  PORT_SIZE_RUNG_LABELS,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_LAYOUT_LABELS,
  SECONDARY_LAYOUT_AS_ORIGIN,
  SECONDARY_SLOT_LAYOUTS,
  SECONDARY_SLOT_LAYOUT_LABELS,
  TEXT_LAYOUT_AS_PLACEMENT,
  type PortSizeRung,
} from "./port.layout";

const GOVERNS = ["diameter", "textSize"];

// WHY a total Record and not a ternary/lookup shortcut: a loose index
// signature would let a fifth rung typecheck clean and throw at render
// time reading `.diameter` off `undefined` — same defensive shape as
// pill.presets.ts's own PRESET_PAINT.
const PRESET_SIZE: Record<PortSizeRung, { diameter: string; textSize: string }> = {
  sm: { diameter: "sm", textSize: "sm" },
  md: { diameter: "md", textSize: "md" },
  lg: { diameter: "lg", textSize: "lg" },
  // Port has no "xl" diameter of its own — 18px ("lg") stays its largest
  // dot, so the "xl" rung pairs that ceiling diameter with "xl" text.
  xl: { diameter: "lg", textSize: "xl" },
};

export const PORT_PRESETS: PresetSpec[] = PORT_SIZE_RUNGS.map((size) => ({
  id: size,
  label: PORT_SIZE_RUNG_LABELS[size],
  selector: "size",
  governs: GOVERNS,
  values: PRESET_SIZE[size],
}));

/**
 * The two SLOT-PLACEMENT ladders — `textLayout` governing the label slot's
 * placement fields, `secondarySlotLayout` governing the secondary slot's.
 *
 * WHY these exist at all, when `LabeledPort` already resolves the same
 * thing with `labelOrigin ?? TEXT_LAYOUT_AS_PLACEMENT[layout].origin`:
 * because a runtime `??` is invisible to the SCHEMA layer, and the schema
 * layer is what decides whether a field gets materialised as an explicit
 * value. `defaultArgs` omits governed fields precisely so a selector can
 * still select (see its own WHY) — but it can only omit what a
 * `PresetSpec` declares. Left undeclared, every placement field shipped
 * its default as an explicit arg that outranked the preset, which is how
 * `labelOffsetY` came to pin a plain `right` label 23px high (2026-09-15).
 *
 * WHY a projection of `TEXT_LAYOUT_AS_PLACEMENT` rather than its own
 * table: so the ladder the component renders from and the ladder the
 * inspector reasons about cannot drift. There is still exactly ONE table
 * of placements in this repo; this is a second VIEW of it, and
 * `port.fields.test.ts` asserts the view still matches the component's
 * own fallback chain for every member.
 *
 * `labelOffsetX`, `secondaryAlign` and both secondary offsets stay
 * UNGOVERNED on purpose: they take the same static value on every rung,
 * so they have a real default rather than a preset-varying one, and
 * materialising them changes nothing.
 */
export const LABEL_PLACEMENT_PRESETS: PresetSpec[] = PORT_TEXT_LAYOUTS.map((layout) => ({
  id: layout,
  label: PORT_TEXT_LAYOUT_LABELS[layout],
  selector: "textLayout",
  governs: ["labelOrigin", "labelAlign", "labelOffsetY"],
  values: {
    labelOrigin: TEXT_LAYOUT_AS_PLACEMENT[layout].origin,
    labelAlign: TEXT_LAYOUT_AS_PLACEMENT[layout].align,
    labelOffsetY: TEXT_LAYOUT_AS_PLACEMENT[layout].offsetY,
  },
}));

export const SECONDARY_PLACEMENT_PRESETS: PresetSpec[] = SECONDARY_SLOT_LAYOUTS.map((layout) => ({
  id: layout,
  label: SECONDARY_SLOT_LAYOUT_LABELS[layout],
  selector: "secondarySlotLayout",
  governs: ["secondaryOrigin"],
  values: { secondaryOrigin: SECONDARY_LAYOUT_AS_ORIGIN[layout] },
}));

/**
 * Every preset a `LabeledPort` answers to — the array `defaultArgs` and
 * any inspector must be handed, since each selector governs a DISJOINT
 * set (`assertDisjointPresets` proves it in the tests).
 *
 * `PORT_PRESETS` stays the size ladder alone: it is what a bare `Port`
 * (geometry only, no slots) resolves `diameter` through, and that
 * primitive has no placement fields to govern.
 */
export const LABELED_PORT_PRESETS: PresetSpec[] = [
  ...PORT_PRESETS,
  ...LABEL_PLACEMENT_PRESETS,
  ...SECONDARY_PLACEMENT_PRESETS,
];
