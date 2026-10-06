/**
 * packages/bbox-ui/src/region.presets.ts
 *
 * `REGION_PRESETS` is deliberately empty: a Region has NO `view` selector
 * — it is not collapsible the way `Block` now is (`block.presets.ts`).
 * Instead it composes a real `Block` (in Port view) into its corner —
 * the 2026-09-11 report's own C7 ruling, Zach's words: "a region is not a
 * block but is composed using a block." Kept as a real, empty, exported
 * array (`block.presets.ts`'s own precedent) rather than omitted, so a
 * generic story generator / product inspector can always `.map()` over
 * `<NAME>_PRESETS` without a null check.
 */
import type { PresetSpec } from "./schema";

export const REGION_PRESETS: PresetSpec[] = [];
