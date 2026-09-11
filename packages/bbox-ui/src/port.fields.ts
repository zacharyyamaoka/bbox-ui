/**
 * packages/bbox-ui/src/port.fields.ts
 *
 * `Port`'s controllable props as data — the declaration half of the
 * schema-driven loop (T0). Every `id` below is a REAL `PortProps` key (see
 * `./port.tsx`); `readFields`/`toArgTypes` look subjects up by that key
 * directly, so there is no separate id-to-prop mapping to keep in sync.
 * Every enum and default mirrors `./layout.ts` — this file adds no new
 * vocabulary, it only describes the vocabulary that already exists.
 *
 * WHY these five fields only: the component-proposal's Section 3 gallery
 * sketched a richer future Port (`diameter` override, `hitRadius`,
 * `polarity`, `visible`) — none of those props exist on the real `Port`
 * component today. T0 describes the component that exists, not the one
 * imagined; see docs/T0-SPEC.md §9 for the explicit scope cut.
 */
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";

import {
  PORT_DIAMETERS,
  PORT_STATE_LABELS,
  PORT_STATES,
  PORT_TEXT_LAYOUTS,
  TEXT_SIZE_NAMES,
  TEXT_SIZES,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "./layout";

const STATE_OPTIONS: FieldOption[] = PORT_STATES.map((state) => ({
  value: state,
  label: PORT_STATE_LABELS[state as PortState],
}));

const SIZE_OPTIONS: FieldOption[] = (Object.keys(PORT_DIAMETERS) as PortSize[]).map(
  (size) => ({ value: size, label: `${size} · ${PORT_DIAMETERS[size]}px` }),
);

/**
 * Board labels (see `layout.ts`'s own `PortTextLayout` comment: "Top",
 * "Bot", "Right", "Left", "Right (Offset)", "Left Offset"). No exported
 * labels record exists there yet, so this is the one place that names them
 * for a panel.
 */
const TEXT_LAYOUT_LABELS: Record<PortTextLayout, string> = {
  top: "Top",
  bot: "Bot",
  right: "Right",
  left: "Left",
  "right-offset": "Right (Offset)",
  "left-offset": "Left Offset",
};

const TEXT_LAYOUT_OPTIONS: FieldOption[] = PORT_TEXT_LAYOUTS.map((layout) => ({
  value: layout,
  label: TEXT_LAYOUT_LABELS[layout],
}));

const TEXT_SIZE_OPTIONS: FieldOption[] = (Object.keys(TEXT_SIZES) as TextSize[]).map(
  (size) => ({ value: size, label: TEXT_SIZE_NAMES[size] }),
);

/**
 * `Port`'s five controllable props, in the order a panel should draw them.
 * Every `defaultValue` equals that prop's real default in `port.tsx` —
 * `test/port.fields.test.ts` pins this so the two files cannot drift.
 *
 * The one exception is `children` (see its own comment below): `port.tsx`
 * destructures `state`, `size`, `textLayout` and `textSize` with real
 * `= "..."` defaults, but `children` has none — omitting it renders the
 * bare dot with no label at all (`children != null && <PortLabel>...`),
 * not the literal string "Port".
 */
export const PORT_FIELDS: FieldSpec[] = [
  {
    id: "state",
    label: "State",
    kind: "segments",
    defaultValue: "empty",
    options: STATE_OPTIONS,
    hint: "`received` is runtime-only — never persisted (see PERSISTABLE_PORT_STATES).",
  },
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "md",
    options: SIZE_OPTIONS,
  },
  {
    id: "textLayout",
    label: "Text Layout",
    kind: "segments",
    defaultValue: "right",
    options: TEXT_LAYOUT_OPTIONS,
  },
  {
    id: "textSize",
    label: "Text Size",
    kind: "segments",
    defaultValue: "md",
    options: TEXT_SIZE_OPTIONS,
  },
  {
    id: "children",
    label: "Label",
    kind: "text",
    // NOTE (deviation, see docs/T0-SPEC.md §3 discussion): `Port` has no
    // real destructured default for `children` — passing none yields
    // `undefined` and the component renders the bare dot with no label
    // (the `NoLabel` story's exact case). `FieldValue` has no way to
    // express "undefined" for a `kind: "text"` control, so "Port" is a
    // deliberate demoable placeholder chosen for Storybook/inspector
    // ergonomics, not a literal reproduction of port.tsx's own
    // destructuring. `port.fields.test.ts` asserts this consciously
    // instead of asserting it equals a "real default" that does not exist.
    defaultValue: "Port",
    hint: "The text slot. Empty renders the bare dot — see the `NoLabel` story.",
  },
];
