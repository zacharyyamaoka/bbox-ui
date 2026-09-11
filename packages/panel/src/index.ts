/**
 * @bbox-ui/panel — the inspector engine, host-neutral.
 *
 * WHY it is a package and not a folder inside one app: the same panel now
 * renders in the Vite demo and on the bbox-ui.com create page. A copy in each
 * is how this repo spent six judge rounds discovering that six copies of one
 * model give four different answers. There is one copy, and two consumers.
 */
export { readFieldRow, type FieldRowModel, type Subject } from "./fieldModel";
export {
  classifyField,
  matchesFilter,
  loadStoredTier,
  storeTier,
  TIER_META,
  TIER_ORDER,
  TIER_RANK,
  type Tier,
} from "./fieldTiers";
export { FieldTraceRow } from "./FieldTraceRow";
export { ComponentInspector, type ComponentInspectorProps } from "./ComponentInspector";
export { registerComponent, type ComponentEntry } from "./registerComponent";
export { PANEL_VARIANTS, findVariant, VARIANT_CONTRACT } from "./variants";
export type { PanelVariant, PanelVariantProps } from "./variants";
export {
  REGISTRY,
  SEED_VARIANTS,
  MIXED_BENCH,
  INITIAL_BENCHES,
  INITIAL_UID,
  EXCLUDED_SHOWN,
  makeInstance,
  randomValue,
  sharedFields,
  type Instance,
} from "./bench";
export { groupRows, type FieldRow } from "./fieldGroups";
