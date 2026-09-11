/**
 * packages/bbox-ui/src/port.presets.ts
 *
 * Port has no separate settable paint property for a preset to govern —
 * its ring/fill colour is computed by one hand-written lookup,
 * `portDotStyle(state, tone)` (./port.tsx), directly from
 * `STATE_TOKENS`/`TONE_TOKENS` (./appearance.ts). There is nothing
 * beneath that lookup for an instance to reach past, so the generic
 * preset mechanism has nothing to govern on Port: `state`'s own
 * `FieldTrace` (via `resolveField(STATE_FIELD, props, PORT_PRESETS)`) is
 * therefore always `winner: "override"` (a caller passed `state`) or
 * `winner: "default"` — correct, not degenerate. See docs/T1-SPEC.md
 * §4.7.
 *
 * Still exported, empty, so every generic consumer (the story generator,
 * the product inspector) can `.map()` over it without a null check —
 * the every-component-exports-one convention, docs/T1-SPEC.md §0.
 */
import type { PresetSpec } from "@bbox-ui/schema";

export const PORT_PRESETS: PresetSpec[] = [];
