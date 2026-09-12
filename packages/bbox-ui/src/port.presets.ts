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
import type { PresetSpec } from "@bbox-ui/schema";

import { PORT_SIZE_RUNGS, PORT_SIZE_RUNG_LABELS, type PortSizeRung } from "./port.layout";

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
