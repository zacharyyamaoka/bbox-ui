"use client";

import type { MemberList } from "../members-section";
import type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";

const REGION_ORDER = ["header", "body", "footer"] as const;

function jumpTo(listId: string) {
  document.getElementById(`list-${listId}`)?.scrollIntoView({ block: "nearest" });
}

/**
 * The regions as three stacked bands, each list reduced to a jump pill.
 * Header/footer lay their lists across a 1fr·auto·1fr grid (left, center,
 * right slots); body is a single centered pill. Clicking a pill scrolls
 * the matching list into view below.
 */
function AnatomyStrip({ lists }: { lists: MemberList[] }) {
  const byRegion = new Map<string, MemberList[]>();
  for (const list of lists) {
    if (list.region === null) continue;
    const group = byRegion.get(list.region) ?? [];
    group.push(list);
    byRegion.set(list.region, group);
  }
  return (
    <div data-slot="anatomy-strip" className="m-2 overflow-hidden rounded-md border border-border text-[10px]">
      {REGION_ORDER.map((region) => {
        const group = byRegion.get(region);
        if (!group || group.length === 0) return null;
        const isEdgeBand = region === "header" || region === "footer";
        return (
          <div
            key={region}
            data-slot="anatomy-band"
            data-region={region}
            className={`grid items-center gap-1 border-b border-border bg-muted/40 p-1.5 last:border-b-0 ${
              isEdgeBand ? "grid-cols-[1fr_auto_1fr]" : "grid-cols-1 justify-items-center"
            }`}
          >
            {group.map((list) => (
              <button
                key={list.id}
                type="button"
                data-slot="anatomy-jump"
                data-list-id={list.id}
                onClick={() => jumpTo(list.id)}
                title={list.label}
                className="justify-self-center rounded-full bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground hover:text-foreground"
              >
                {list.count}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * V2 · Anatomy first — what you came to compose, before what you came to
 * tweak.
 *
 * WHY the anatomy leads: Zach, 2026-09-11 — on a slotted Block the seven
 * member lists are the thing you're actually here to arrange; the scalar
 * rows (width, height, …) are secondary. A schematic of the three regions
 * up top makes the shape of the composition visible at a glance and lets
 * a click jump straight to any list, instead of scrolling past it.
 */
function AnatomyFirstLayout(p: InspectorLayoutProps) {
  if (p.lists.length === 0) {
    return <div data-slot="inspector-layout" data-inspector-layout="anatomy">{p.panel}</div>;
  }
  let lastRegion: string | null | undefined;
  return (
    <div data-slot="inspector-layout" data-inspector-layout="anatomy">
      {p.lists.some((l) => l.region !== null) && <AnatomyStrip lists={p.lists} />}
      {p.lists.map((list) => {
        const caption = list.region !== null && list.region !== lastRegion ? list.region : null;
        lastRegion = list.region;
        return (
          <div key={list.id} id={`list-${list.id}`}>
            {caption && (
              <div data-slot="region-caption" className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {caption}
              </div>
            )}
            {list.node}
          </div>
        );
      })}
      <div data-slot="anatomy-divider" className="mt-2 border-t border-border" />
      <div data-slot="region-caption" className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Properties
      </div>
      {p.panel}
    </div>
  );
}

export const ANATOMY_FIRST: InspectorLayoutVariant = {
  id: "anatomy",
  label: "Anatomy first",
  blurb: "A jump-strip schematic of the regions up top, every member list below it, scalar fields last — composition before tweaking.",
  stockPart: "none",
  Layout: AnatomyFirstLayout,
};
