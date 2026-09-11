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
 * Switcher order: the incumbent first so the panel you already know is what
 * loads cold, then the five proposals roughly by how far each departs from it.
 * Ignoring the switcher entirely therefore costs nothing and changes nothing —
 * the default-is-the-status-quo half of "ship N variants plus a low-friction
 * pick surface".
 */
export const PANEL_VARIANTS: PanelVariant[] = [
  CURRENT,
  FIGMA_DENSE,
  ROW_POPOVER,
  TIERED,
  FILTER_FIRST,
  ICON_STRIP,
];

export function findVariant(id: string | null): PanelVariant {
  return PANEL_VARIANTS.find((v) => v.id === id) ?? PANEL_VARIANTS[0];
}
