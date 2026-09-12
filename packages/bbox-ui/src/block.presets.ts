/**
 * packages/bbox-ui/src/block.presets.ts
 *
 * `BLOCK_PRESETS` is deliberately empty — same reasoning `port.presets.ts`
 * already documents for `Port`: `Block` forwards `state`/`tone` to its
 * internal `<BlockChip>` (a `<Pill>` wrapper), which resolves its OWN
 * `PILL_PRESETS`. Block never governs a paint field of its own, so there
 * is nothing here for a preset to write. Kept as a real, empty, exported
 * array (not omitted) — every consumer (the generic story generator, the
 * generic inspector) can always `.map()` over `<NAME>_PRESETS` without a
 * null check (T1-SPEC.md §0).
 */
import type { PresetSpec } from "@bbox-ui/schema";

export const BLOCK_PRESETS: PresetSpec[] = [];
