/**
 * packages/bbox-ui/src/stack.fields.ts
 *
 * `Stack`'s controllable props as data — every `id` below is a real
 * `StackProps` key (see `./stack.tsx`); `readFields`/`toArgTypes` look
 * subjects up by that key directly. Every enum and default mirrors
 * `./stack.tsx` — `test/stack.fields.test.ts` pins this against the real
 * component, not a retyped literal.
 *
 * `STACK_PRESETS` is empty: Stack paints nothing beyond its own structure
 * and the `insetBackground` containment toggle, which is itself excluded
 * from the shared `APPEARANCE_FIELDS` bundle (see `./stack.tsx`'s own
 * comment on `StackInsetBackground`) — there is no semantic state ladder
 * here for a preset to govern. Still exported (empty, never omitted) so
 * every generic consumer (the story generator, the product inspector) can
 * `.map()` over it without a null check, per docs/T1-SPEC.md §0.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import { STACK_INSET_BACKGROUNDS, STACK_MEMBER_WIDTHS } from "./stack";

const MEMBER_WIDTH_LABELS: Record<(typeof STACK_MEMBER_WIDTHS)[number], string> = {
  fill: "Fill",
  own: "Own Width",
};

const MEMBER_WIDTH_OPTIONS: FieldOption[] = STACK_MEMBER_WIDTHS.map((value) => ({
  value,
  label: MEMBER_WIDTH_LABELS[value],
}));

const INSET_BACKGROUND_LABELS: Record<(typeof STACK_INSET_BACKGROUNDS)[number], string> = {
  white: "White",
  "soft-gray": "Soft Gray",
};

const INSET_BACKGROUND_OPTIONS: FieldOption[] = STACK_INSET_BACKGROUNDS.map((value) => ({
  value,
  label: INSET_BACKGROUND_LABELS[value],
}));

/**
 * `Stack`'s four controllable props, in the order a panel should draw
 * them. Every `defaultValue` equals that prop's real default in
 * `stack.tsx`.
 */
export const STACK_FIELDS: FieldSpec[] = [
  {
    id: "gap",
    label: "Gap",
    kind: "number",
    defaultValue: 12,
    min: 0,
    unit: "px",
    hint: "Space between members.",
    // Gap and gutter are the two spacing knobs of one well, in the same unit,
    // and read together the way Figma's auto-layout gap and padding do.
    group: "spacing",
  },
  {
    id: "gutter",
    label: "Gutter",
    kind: "number",
    defaultValue: 12,
    min: 0,
    unit: "px",
    hint: "Inset of the well from its own edges.",
    group: "spacing",
  },
  {
    id: "memberWidth",
    label: "Member Width",
    kind: "segments",
    defaultValue: "fill",
    options: MEMBER_WIDTH_OPTIONS,
  },
  {
    id: "insetBackground",
    label: "Inset Background",
    kind: "segments",
    defaultValue: "white",
    options: INSET_BACKGROUND_OPTIONS,
    hint: '"white" is no override; "soft-gray" resolves to the `bg-muted` token — a raised-vs-sunken containment toggle, not the general fill palette.',
  },
];

export const STACK_PRESETS: PresetSpec[] = [];
