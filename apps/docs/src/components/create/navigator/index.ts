import type { NavigatorVariant } from "./contract";
import { ARBORIST } from "./Arborist";

export type { NavigatorProps, NavigatorVariant } from "./contract";
export { NAVIGATOR_CONTRACT } from "./contract";

/**
 * ONE navigator. Five were babbled on 2026-09-11 (react-arborist, React
 * Aria Tree, headless-tree, the vendored shadcn Sidebar, a dnd-kit sortable
 * tree — see reports/media/tree-and-slots-2026-09-11 and commit 3cfd8c0);
 * Zach picked react-arborist the same evening. The others were deleted, not
 * kept behind a switcher: a switcher with one real answer is a control
 * whose only reachable state is the one it is already in.
 */
export const NAVIGATOR: NavigatorVariant = ARBORIST;
