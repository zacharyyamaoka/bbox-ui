import type { InspectorLayoutVariant } from "./contract";
import { BOTTOM_STACK } from "./BottomStack";
import { ANATOMY_FIRST } from "./AnatomyFirst";
import { TABS } from "./Tabs";
import { INLINE_ROWS } from "./InlineRows";
import { SPLIT_PANE } from "./SplitPane";

export type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";
export { INSPECTOR_LAYOUT_CONTRACT } from "./contract";

/** First is the default; picked live from the "Inspector layout" switcher. */
export const INSPECTOR_LAYOUTS: InspectorLayoutVariant[] = [INLINE_ROWS, ANATOMY_FIRST, BOTTOM_STACK, TABS, SPLIT_PANE];

export function findInspectorLayout(id: string | null): InspectorLayoutVariant {
  return INSPECTOR_LAYOUTS.find((v) => v.id === id) ?? INSPECTOR_LAYOUTS[0]!;
}
