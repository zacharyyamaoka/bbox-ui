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
  SLOT_ALIGNS,
  SLOT_ORIGINS,
  SLOT_ORIGIN_LABELS,
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

const SLOT_ORIGIN_OPTIONS: FieldOption[] = SLOT_ORIGINS.map((origin) => ({
  value: origin,
  label: SLOT_ORIGIN_LABELS[origin],
}));

const SLOT_ALIGN_OPTIONS: FieldOption[] = SLOT_ALIGNS.map((align) => ({
  value: align,
  // Neutral spellings: the control cannot know which axis is free until a
  // subject has an origin, and "Start/Middle/End" is true on both.
  label: align === "center" ? "Middle" : align === "start" ? "Start" : "End",
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
export const LABELED_PORT_FIELDS: FieldSpec[] = [
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
    id: "labelOrigin",
    label: "Label Origin",
    kind: "segments",
    // The SIDE the label anchors to. `textLayout` above is the Simple-tier
    // PRESET over this plus the two offsets below (Zach, 2026-09-15:
    // "thoose are just presets!") — pick "Right Offset" there and it
    // resolves to origin `right` with a lifted `labelOffsetY`. Omit and
    // the preset decides; set it and you have reached past the preset,
    // which is what Expert is for.
    defaultValue: "right",
    options: SLOT_ORIGIN_OPTIONS,
    hint: "Which side of the dot the label anchors to. Label Slot Location is the preset over this and the two offsets.",
    tier: "expert",
  },
  {
    id: "labelAlign",
    label: "Label Align",
    kind: "segments",
    // WHICH EDGE of the slot is the reference point, on the axis the
    // origin leaves free (Zach, 2026-09-15: "we need to be able to align
    // to the slot left edge, middle or right edge"). `end` on a side
    // origin is what makes "clear of the trace wire" a STATIC offset
    // instead of one derived from the slot's own height — see SlotAlign's
    // own WHY in port.layout.ts.
    defaultValue: "center",
    options: SLOT_ALIGN_OPTIONS,
    hint: "Which part of the slot lands on the origin's line. On a Left/Right origin these read Top/Middle/Bottom; on Top/Bottom, Left/Middle/Right.",
    tier: "expert",
  },
  {
    id: "labelOffsetX",
    label: "Label Offset X",
    kind: "number",
    // NEGATIVE allowed, deliberately (Zach: "lets support both positive
    // and negative offsets") — the old enum could not express one at all.
    min: -64,
    max: 64,
    step: 1,
    defaultValue: 0,
    hint: "Horizontal displacement in screen space: + moves right, - moves left, on every origin.",
    tier: "expert",
  },
  {
    id: "labelOffsetY",
    label: "Label Offset Y",
    kind: "number",
    // Spans negative too: a lift clear of a trace wire IS a negative Y,
    // since +Y is down. Renamed from `labelOffset`, which could only ever
    // be a positive lift and only on the two "Offset" layouts.
    min: -64,
    max: 64,
    step: 1,
    // The value `defaultPortLabelLift` computes at Port's own default
    // diameter ("md", 12px): 6 + PORT_RING_OVERHANG_PX (5) + PORT_LABEL_GAP
    // (8). Same static-approximation convention `textLayout`'s default
    // follows against `inwardTextLayout(edge)` — and, like it, the panel
    // shows the REAL resolved number via `portResolutionSubject`, so a
    // Port at another size reads honestly instead of trusting this literal.
    // The static gap a lifted label carries in `TEXT_LAYOUT_AS_PLACEMENT`, at
    // default text size — negative, because the lift is upward. The panel
    // shows the REAL resolved number via `portResolutionSubject`, which is
    // what keeps it honest at any other text size.
    defaultValue: -23,
    hint: "Vertical displacement, + down. A lifted label carries a negative value that puts its bottom edge clear of the dot's centre line, where a trace wire runs.",
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
  // The secondary slot's own origin + offsets — the SAME three controls
  // the label has, over the SAME `SlotOrigin` type. That symmetry is the
  // point of the unification: one model for both slots, so "left" means
  // the same thing in both and neither needs its own vocabulary.
  {
    id: "secondaryOrigin",
    label: "Secondary Origin",
    kind: "segments",
    defaultValue: "left",
    options: SLOT_ORIGIN_OPTIONS,
    hint: "Which side of the dot the secondary slot hugs. Secondary Slot is the preset over this and the two offsets.",
    tier: "expert",
  },
  {
    id: "secondaryAlign",
    label: "Secondary Align",
    kind: "segments",
    // WHICH EDGE of the slot is the reference point, on the axis the
    // origin leaves free (Zach, 2026-09-15: "we need to be able to align
    // to the slot left edge, middle or right edge"). `end` on a side
    // origin is what makes "clear of the trace wire" a STATIC offset
    // instead of one derived from the slot's own height — see SlotAlign's
    // own WHY in port.layout.ts.
    defaultValue: "center",
    options: SLOT_ALIGN_OPTIONS,
    hint: "Which part of the slot lands on the origin's line. On a Left/Right origin these read Top/Middle/Bottom; on Top/Bottom, Left/Middle/Right.",
    tier: "expert",
  },
  {
    id: "secondaryOffsetX",
    label: "Secondary Offset X",
    kind: "number",
    min: -64,
    max: 64,
    step: 1,
    defaultValue: 0,
    hint: "Horizontal displacement in screen space: + moves right, - moves left, on every origin.",
    tier: "expert",
  },
  {
    id: "secondaryOffsetY",
    label: "Secondary Offset Y",
    kind: "number",
    min: -64,
    max: 64,
    step: 1,
    defaultValue: 0,
    hint: "Vertical displacement, + down.",
    tier: "expert",
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
    hint: "Fallback label for a host with no label slot (the tldraw/React Flow adapters, blockFace, Storybook). A host that supplies a real label slot overrides this outright — edit the slot's own CodeField member instead.",
    // DEMOTED to Expert 2026-09-15, when the label became a real slot whose
    // text is an ordinary, deletable member (Zach: "even the text is just a
    // member in the label slot that can be deleted"). It is NOT dead — every
    // prop-only host still renders its label from this string, and Storybook
    // drives it through exactly this field — but in /create the label slot
    // always exists and always wins, so a "Custom Label" row sitting in
    // Simple would be a control that silently does nothing, which is the
    // one thing this panel keeps designing out.
    tier: "expert",
  },
  {
    id: "placeholder",
    label: "Placeholder",
    kind: "text",
    defaultValue: "",
    hint: "Shown in the fallback label's CodeField when Custom Label is empty. Same prop-only-host scope as Custom Label above.",
    tier: "expert",
  },
];

/**
 * The bare `Port` primitive's own fields — the geometry and paint of the
 * dot, nothing else (Zach, 2026-09-15: "Port is just the actual like Port
 * geometry its self in isolation").
 *
 * WHY this is SELECTED out of `LABELED_PORT_FIELDS` rather than written
 * as its own literal: every one of these describes the same prop on both
 * components — `LabeledPort` forwards them straight down to the `Port` it
 * composes. Two hand-written literals would be two places for a default,
 * an option set or a tier to drift, and the drift would be silent because
 * each list is internally consistent. Selecting keeps one source.
 *
 * WHAT IS DELIBERATELY ABSENT, and why each: `direction`/`edge`/
 * `textLayout`/`labelOffset`/`textSize`/`secondarySlotLayout`/`children`/
 * `placeholder`/`disabled` are all statements about a LABEL or a SLOT,
 * which a bare Port does not have. `reveal`/`producers` are container
 * facts (a visibility policy, a many-to-one count) that only mean
 * something once a port is arranged with other things.
 *
 * `size` and `lens` are absent for a sharper reason (adversarial judge,
 * 2026-09-15): `PortProps` declares NEITHER, so listing them put two
 * controls in the bench that moved nothing and spread two inert
 * attributes onto the root `<span>`. `size` is the cascade RUNG a header
 * hands down, and it governs `diameter` + `textSize` together — half of
 * that pair is a label fact, so the rung belongs to the composite, which
 * resolves it and passes the bare Port a settled `diameter`. `lens` paints
 * nothing anywhere yet (docs/T1-SPEC.md §3 defines no lens tokens), so on
 * a primitive it would be a control that does nothing by construction.
 *
 * `test/port.fields.test.ts` pins this structurally: every id here must be
 * a prop `Port` actually DESTRUCTURES, proved by checking none of them
 * survives onto the rendered root. That is what makes this list unable to
 * drift back out of sync with the component.
 */
const PORT_FIELD_IDS = [
  "diameter",
  "state",
  "tone",
  "hidden",
  "dimmed",
  "hinting",
] as const;

export const PORT_FIELDS: FieldSpec[] = PORT_FIELD_IDS.map((id) => {
  const found = LABELED_PORT_FIELDS.find((f) => f.id === id);
  // Not a defensive `?? fallback`: a missing id means the composite
  // renamed or dropped a field the primitive still claims to expose, and
  // failing loudly at import is the only way that stays visible.
  if (!found) throw new Error(`PORT_FIELD_IDS names "${id}", which LABELED_PORT_FIELDS does not declare`);
  return found;
});
