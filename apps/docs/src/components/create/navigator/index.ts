import type { NavigatorVariant } from "./contract";
import { SHADCN_TREE } from "./ShadcnTree";
import { ARBORIST } from "./Arborist";
import { ARIA_TREE } from "./AriaTree";
import { HEADLESS_TREE } from "./HeadlessTree";
import { DNDKIT_TREE } from "./DndKitTree";

export type { NavigatorProps, NavigatorVariant } from "./contract";
export { NAVIGATOR_CONTRACT } from "./contract";

/**
 * First is the default. Five stock tree parts, one contract; Zach picks
 * live from the "Instance navigator" switcher in the sidebar footer, the
 * same way the panel design and the Members control were picked.
 */
export const NAVIGATOR_VARIANTS: NavigatorVariant[] = [ARBORIST, ARIA_TREE, HEADLESS_TREE, SHADCN_TREE, DNDKIT_TREE];

export function findNavigator(id: string | null): NavigatorVariant {
  return NAVIGATOR_VARIANTS.find((v) => v.id === id) ?? NAVIGATOR_VARIANTS[0]!;
}
