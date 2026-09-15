/**
 * packages/bbox-ui/src/port.fields.ts
 *
 * `Port`'s controllable props as data — the rebuilt shape, pinned by
 * docs/T1-SPEC.md §4.7 (superseding `PORT-SPEC.md §3`'s own table where
 * the two disagree: `APPEARANCE_FIELDS` no longer carries `textSize` —
 * every text-bearing component gets its own ladder, T1-SPEC.md §2.1 —
 * and `tone` resolves via `toneOverride`, not a second preset family).
 * ONE FLAT PROPERTY SPACE (Zach's ruling): `APPEARANCE_FIELDS` is spread
 * directly into `PORT_FIELDS` rather than nested under an `appearance`
 * key. Every `id` below is a real `PortProps` key (see `./port.tsx`);
 * `readFields`/`resolveField` look subjects up by that key directly.
 * `test/port.fields.test.ts` pins every default/option against the real
 * component and layout module — never a retyped literal.
 */
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";

import { APPEARANCE_FIELDS } from "./appearance.fields";
import {
  BLOCK_SIDES,
  BLOCK_SIDE_LABELS,
  PORT_DIAMETER_LABELS,
  PORT_DIAMETERS,
  PORT_DIRECTION_LABELS,
  PORT_DIRECTIONS,
  PORT_REVEAL_LABELS,
  PORT_REVEALS,
  PORT_SIZE_RUNG_LABELS,
  PORT_SIZE_RUNGS,
  PORT_TEXT_LAYOUT_LABELS,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_SIZE_LABELS,
  PORT_TEXT_SIZES,
  SECONDARY_SLOT_LAYOUT_LABELS,
  SECONDARY_SLOT_LAYOUTS,
  type PortTextSize,
} from "./port.layout";

const DIRECTION_OPTIONS: FieldOption[] = PORT_DIRECTIONS.map((direction) => ({
  value: direction,
  label: PORT_DIRECTION_LABELS[direction],
}));

const EDGE_OPTIONS: FieldOption[] = BLOCK_SIDES.map((side) => ({
  value: side,
  label: BLOCK_SIDE_LABELS[side],
}));

const SIZE_OPTIONS: FieldOption[] = PORT_SIZE_RUNGS.map((size) => ({
  value: size,
  label: PORT_SIZE_RUNG_LABELS[size],
}));

const DIAMETER_OPTIONS: FieldOption[] = (
  Object.keys(PORT_DIAMETERS) as (keyof typeof PORT_DIAMETERS)[]
).map((size) => ({
  value: size,
  label: `${PORT_DIAMETER_LABELS[size]} · ${PORT_DIAMETERS[size]}px`,
}));

const TEXT_LAYOUT_OPTIONS: FieldOption[] = PORT_TEXT_LAYOUTS.map((layout) => ({
  value: layout,
  label: PORT_TEXT_LAYOUT_LABELS[layout],
}));

const TEXT_SIZE_OPTIONS: FieldOption[] = (
  Object.keys(PORT_TEXT_SIZES) as PortTextSize[]
).map((size) => ({
  value: size,
  label: `${PORT_TEXT_SIZE_LABELS[size]} · ${PORT_TEXT_SIZES[size]}px`,
}));

const REVEAL_OPTIONS: FieldOption[] = PORT_REVEALS.map((reveal) => ({
  value: reveal,
  label: PORT_REVEAL_LABELS[reveal],
}));

const SECONDARY_SLOT_LAYOUT_OPTIONS: FieldOption[] = SECONDARY_SLOT_LAYOUTS.map((layout) => ({
  value: layout,
  label: SECONDARY_SLOT_LAYOUT_LABELS[layout],
}));

/**
 * `Port`'s full field list, in panel order (docs/T1-SPEC.md §4.7's own
 * table order, narrowed 2026-09-12 per the port-props ruling: `role`/
 * `decoration` removed — vestigial, SystemSketch's business, not this
 * package's — and `eligible`/`dragging` folded into `dimmed`; see each
 * removal's own WHY in `port.layout.ts`/`port.tsx`; FURTHER NARROWED
 * 2026-09-12 by the two-slot proposal: `name`/`type`/`defaultValue`
 * removed — folded into the `children` field below, a single one-line
 * string the label slot's real `CodeField` now edits, see `port.tsx`'s
 * own module doc): identity/own fields, then the shared `APPEARANCE_FIELDS`
 * bundle (this is what colours the dot — `state`, `tone`, plus
 * `lens`/`lensBefore`), then the author-set, persisted `hidden`/`disabled`,
 * then the host-computed interaction axis (now including
 * `secondarySlotLayout`), then the `children`/`placeholder` label fields.
 */
export const PORT_FIELDS: FieldSpec[] = [
  {
    id: "direction",
    label: "Direction",
    kind: "segments",
    defaultValue: "input",
    options: DIRECTION_OPTIONS,
  },
  {
    id: "edge",
    label: "Edge",
    kind: "segments",
    defaultValue: "left",
    options: EDGE_OPTIONS,
  },
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "md",
    options: SIZE_OPTIONS,
    cascades: true,
    hint: "Sets diameter and text size together; the rung a header hands down.",
    // EXPLICIT "advanced", overriding the cascade-selector rule that would
    // otherwise land this in Simple (same rule `state` gets it from) — Zach,
    // 2026-09-14: "No need for size control here. Already I would expect
    // the port to be sized correctly." A cascade selector being prominent
    // is right for MOST components; Port's own diagram of what Simple
    // should hold names Label/Label Slot Location/State only.
    tier: "advanced",
  },
  {
    id: "diameter",
    label: "Diameter",
    kind: "segments",
    defaultValue: "md",
    options: DIAMETER_OPTIONS,
    hint: 'A free-numeric "Exact" 4th branch is deferred — no FieldKind combines segments+number today, see docs/T1-SPEC.md §10.',
  },
  {
    id: "textLayout",
    label: "Label Slot Location",
    kind: "segments",
    defaultValue: "right",
    options: TEXT_LAYOUT_OPTIONS,
    hint: 'Sensible default is `inwardTextLayout(edge)`; this table default is that function\'s value at `edge: "left"`.',
    // EXPLICIT "simple" — Zach, 2026-09-14, naming Port's Simple tab
    // directly: "Label Slot Location — Where is the slot located (Bot,
    // Top, Right, Right Offset, Left, Left Offset)". Without this it fell
    // into Advanced by shape-inference alone (an ungoverned closed-value
    // field, `fieldTiers.ts` rule 4) — exactly the gap that made moving it
    // require the Advanced tab instead of the one he actually wanted.
    tier: "simple",
  },
  {
    id: "labelOffset",
    label: "Offset Distance",
    kind: "number",
    min: 0,
    max: 64,
    step: 1,
    // The value `defaultPortLabelLift` computes at Port's own default
    // diameter ("md", 12px): 6 + PORT_RING_OVERHANG_PX (5) + PORT_LABEL_GAP
    // (8). Same static-approximation convention `textLayout`'s default
    // follows against `inwardTextLayout(edge)` — and, like it, the panel
    // shows the REAL resolved number via `portResolutionSubject`, so a
    // Port at another size reads honestly instead of trusting this literal.
    defaultValue: 19,
    hint: "How far a Right/Left Offset label's bottom edge clears the dot's centre line — the gap a trace wire passes through. Only an Offset layout has a lift to tune. Omit for the auto default: half the dot, plus its painted ring, plus the standard label gap.",
    tier: "expert",
  },
  {
    id: "textSize",
    label: "Text Size",
    kind: "segments",
    // "md" (24px), not textSize's own "sm" rung — kept equal to what a
    // truly bare `Port` actually renders now that `size` (defaultValue
    // "md") always cascades a matching preset onto this field (mirrors
    // pill.fields.ts's own paint-field defaults, engineered to equal the
    // "empty" preset's output for the identical reason).
    defaultValue: "md",
    options: TEXT_SIZE_OPTIONS,
  },
  ...APPEARANCE_FIELDS,
  {
    id: "hidden",
    label: "Hidden",
    kind: "toggle",
    defaultValue: false,
    hint: "The dot and label draw nothing; a container counts it into \"+N more\" (same shape as bar.fields.ts's own `hidden`).",
  },
  {
    id: "disabled",
    label: "Disabled",
    kind: "toggle",
    defaultValue: false,
    hint: "No caret, no edits on the label's CodeField — a read-only port.",
  },
  {
    id: "dimmed",
    label: "Dimmed",
    kind: "toggle",
    defaultValue: false,
    hint: "Host-computed — out of focus, or mid-drag and not a legal target. Never persisted.",
    randomize: false,
  },
  {
    id: "hinting",
    label: "Hinting",
    kind: "toggle",
    defaultValue: false,
    hint: "Host-computed drag-time state — never persisted. Previews becoming `wired`: wears `wired`'s ink regardless of the resting `state`.",
    randomize: false,
  },
  {
    id: "reveal",
    label: "Reveal",
    kind: "segments",
    defaultValue: "always",
    options: REVEAL_OPTIONS,
    hint: "Host-computed visibility policy — never persisted.",
    randomize: false,
  },
  {
    id: "producers",
    label: "Producers",
    kind: "number",
    defaultValue: 0,
    min: 0,
    max: 9,
    step: 1,
    hint: "Host-computed many-to-one count — never persisted. 2 or more composes PortCountBadge as the secondary slot's default content.",
    randomize: false,
  },
  {
    id: "secondarySlotLayout",
    label: "Secondary Slot",
    kind: "segments",
    // No real JS default in port.tsx (the prop is `secondarySlotLayout?:
    // SecondarySlotLayout`, left `undefined` so `defaultSecondarySlotLayout`
    // — the side OPPOSITE the label — can run) — "leftOffset" here is
    // that function's OWN value at Port's real default textLayout ("right"),
    // same convention `textLayout`'s own declared default above follows
    // against `inwardTextLayout(edge)`.
    defaultValue: "leftOffset",
    options: SECONDARY_SLOT_LAYOUT_OPTIONS,
    hint: "Where the producer-count badge (or any other secondary-slot content a host composes) sits, hugging the dot. Omit for the auto default: the corner opposite wherever the label is flowing.",
  },
  {
    id: "children",
    // WHY not bare "Label", which it was: a Port's panel already carries a
    // "Name", and a row called Label directly under a row called Name reads
    // as the same idea twice. This one is not the name — it REPLACES the
    // whole name/type/default rendering, which is what "Custom" says.
    label: "Custom Label",
    kind: "text",
    // The label slot's ENTIRE content now — one line ("a port is one line
    // of code", `get_aruco: ArucoSrv`) — REPLACES the removed `name`/
    // `type`/`defaultValue` fields (port.tsx's own module doc). An empty
    // string is CodeField's own honest empty state (a blank field showing
    // `placeholder`), not a special "fall through to something else" case
    // the way the old three-span rendering needed.
    defaultValue: "",
    hint: "The CodeField's whole value — a real, editable single-line code text box (grammar-free; wiring the Python name: Type = default grammar/autocomplete is a later step).",
  },
  {
    id: "placeholder",
    label: "Placeholder",
    kind: "text",
    defaultValue: "",
    hint: "Shown in the label's CodeField when Label is empty.",
  },
];
