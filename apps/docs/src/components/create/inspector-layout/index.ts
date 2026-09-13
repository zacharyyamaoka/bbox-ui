import type { InspectorLayoutVariant } from "./contract";
import { INLINE_ROWS } from "./InlineRows";

export type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";
export { INSPECTOR_LAYOUT_CONTRACT } from "./contract";

/**
 * ONE layout. Five were babbled on 2026-09-11 (Inline rows, Anatomy first,
 * Bottom stack, Tabs, Split pane — see reports/media/tree-and-slots-2026-09-11
 * and commit 3cfd8c0); Zach picked Inline rows the same evening. The others
 * were deleted rather than kept behind a switcher.
 */
export const INSPECTOR_LAYOUT: InspectorLayoutVariant = INLINE_ROWS;
