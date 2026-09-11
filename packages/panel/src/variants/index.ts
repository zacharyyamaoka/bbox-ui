import type { PanelVariant } from "./contract";
import { CURRENT } from "./Current";
import { FIGMA_DENSE } from "./FigmaDense";
import { TIERED } from "./Tiered";
import { ROW_POPOVER } from "./RowPopover";
import { ICON_STRIP } from "./IconStrip";
import { FILTER_FIRST } from "./FilterFirst";

export type { PanelVariant, PanelVariantProps } from "./contract";
export { VARIANT_CONTRACT } from "./contract";

/**
 * FIGMA_DENSE is first, and therefore the default.
 *
 * Zach picked it on 2026-09-11 after comparing all six live: "I'm definitely
 * leaning towards essentially the Figma dense design... we can always be
 * clever enough to get controls within the single row that give us the
 * control that we want. You can even have presets and a custom button all on
 * the same thing... It's decided. We're going forward with figma dense."
 *
 * The other five stay in the switcher as the record of what was compared —
 * deleting them would make the decision unreviewable and the report's
 * captures unreproducible. Tiered and Filter First are additionally the
 * origin of the tier switch and filter that FIGMA_DENSE now carries itself;
 * they are kept as the isolated demonstration of each idea.
 */
export const PANEL_VARIANTS: PanelVariant[] = [
  FIGMA_DENSE,
  CURRENT,
  ROW_POPOVER,
  TIERED,
  FILTER_FIRST,
  ICON_STRIP,
];

export function findVariant(id: string | null): PanelVariant {
  return PANEL_VARIANTS.find((v) => v.id === id) ?? PANEL_VARIANTS[0];
}
