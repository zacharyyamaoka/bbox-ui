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
  PORT_DECORATIONS,
  PORT_DECORATION_LABELS,
  PORT_DIAMETER_LABELS,
  PORT_DIAMETERS,
  PORT_DIRECTION_LABELS,
  PORT_DIRECTIONS,
  PORT_REVEAL_LABELS,
  PORT_REVEALS,
  PORT_ROLE_LABELS,
  PORT_ROLES,
  PORT_TEXT_LAYOUT_LABELS,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_SIZE_LABELS,
  PORT_TEXT_SIZES,
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

const DIAMETER_OPTIONS: FieldOption[] = (
  Object.keys(PORT_DIAMETERS) as (keyof typeof PORT_DIAMETERS)[]
).map((size) => ({
  value: size,
  label: `${PORT_DIAMETER_LABELS[size]} · ${PORT_DIAMETERS[size]}px`,
}));

const ROLE_OPTIONS: FieldOption[] = PORT_ROLES.map((role) => ({
  value: role,
  label: PORT_ROLE_LABELS[role],
}));

const DECORATION_OPTIONS: FieldOption[] = PORT_DECORATIONS.map((decoration) => ({
  value: decoration,
  label: PORT_DECORATION_LABELS[decoration],
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

/**
 * `Port`'s full field list, in panel order (docs/T1-SPEC.md §4.7's own
 * table order): identity/own fields, then the shared `APPEARANCE_FIELDS`
 * bundle (this is what colours the dot — `state`, `tone`, plus `lens`/
 * `lensBefore`), then the host-computed interaction axis, then the
 * `children` escape hatch.
 */
export const PORT_FIELDS: FieldSpec[] = [
  {
    id: "name",
    label: "Name",
    kind: "text",
    defaultValue: "",
  },
  {
    id: "type",
    label: "Type",
    kind: "text",
    defaultValue: "",
    hint: "Muted type text beside the name — tints nothing. Colour comes from `state`, not from this (Zach, 2026-09-10 ruling).",
  },
  {
    id: "defaultValue",
    label: "Default Value",
    kind: "text",
    defaultValue: "",
    hint: "The `= v` chip's content, capped at 88px with a visible ellipsis.",
  },
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
    id: "diameter",
    label: "Diameter",
    kind: "segments",
    defaultValue: "md",
    options: DIAMETER_OPTIONS,
    hint: 'A free-numeric "Exact" 4th branch is deferred — no FieldKind combines segments+number today, see docs/T1-SPEC.md §10.',
  },
  {
    id: "role",
    label: "Role",
    kind: "segments",
    defaultValue: "data",
    options: ROLE_OPTIONS,
    hint: 'Non-"data" roles show only as a small text cue above the dot — the colour channel is spoken for by `state` (PORT-SPEC.md §1.3.3).',
  },
  {
    id: "decoration",
    label: "Decoration",
    kind: "segments",
    defaultValue: "none",
    options: DECORATION_OPTIONS,
    hint: "`mutates` and every `variadic-*` paint through one shared ring — mutually exclusive by construction, one enum instead of two booleans.",
  },
  {
    id: "textLayout",
    label: "Text Layout",
    kind: "segments",
    defaultValue: "right",
    options: TEXT_LAYOUT_OPTIONS,
    hint: 'Sensible default is `inwardTextLayout(edge)`; this table default is that function\'s value at `edge: "left"`.',
  },
  {
    id: "textSize",
    label: "Text Size",
    kind: "segments",
    defaultValue: "sm",
    options: TEXT_SIZE_OPTIONS,
  },
  ...APPEARANCE_FIELDS,
  {
    id: "eligible",
    label: "Eligible",
    kind: "toggle",
    defaultValue: false,
    hint: "Host-computed drag-time state — never persisted.",
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
    id: "dragging",
    label: "Dragging",
    kind: "toggle",
    defaultValue: false,
    hint: "Host-computed drag-time state — never persisted.",
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
    hint: "Host-computed many-to-one count — never persisted. 2 or more shows the count badge.",
    randomize: false,
  },
  {
    id: "children",
    label: "Label",
    kind: "text",
    // NOT a deviation (unlike Glyph's/T0 Port's own `children` field):
    // `PortLabel` treats an empty string exactly like an omitted prop
    // (`children || ordered`, ./port.tsx) — both fall through to the
    // three-span name/type/default-chip rendering — so "" IS Port's real
    // resolved behavior at this default, not a demoable stand-in for one.
    defaultValue: "",
    hint: "Escape hatch: when non-empty, REPLACES the name/type/default-chip rendering wholesale (a CodeMirror mount, a `name: Type = default` one-liner).",
  },
];
