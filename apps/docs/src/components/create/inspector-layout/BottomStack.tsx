"use client";

import type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";

/**
 * V1 · Bottom stack — what ships today.
 *
 * The scalar rows first, then every member list stacked under them in
 * order, a thin region caption ("Header", "Body", "Footer") before each
 * group when the lists have regions. Zach's own first idea: "one idea is
 * just to kind of have them all at the bottom".
 */
function BottomStackLayout(p: InspectorLayoutProps) {
  let lastRegion: string | null | undefined;
  return (
    <div data-slot="inspector-layout" data-inspector-layout="bottom">
      {p.panel}
      {p.lists.map((list) => {
        const caption = list.region !== null && list.region !== lastRegion ? list.region : null;
        lastRegion = list.region;
        return (
          <div key={list.id}>
            {caption && (
              <div data-slot="region-caption" className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {caption}
              </div>
            )}
            {list.node}
          </div>
        );
      })}
    </div>
  );
}

export const BOTTOM_STACK: InspectorLayoutVariant = {
  id: "bottom",
  label: "Bottom stack",
  blurb: "Fields first, every member list stacked below in anatomy order with a region caption. The simplest reading; the longest scroll on a Block.",
  stockPart: "none",
  Layout: BottomStackLayout,
};
