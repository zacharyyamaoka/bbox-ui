"use client";

import { useState } from "react";
import type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";
import type { MemberList } from "../members-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs";

const STORAGE_KEY = "bbox-ui.create.inspectorTab";

type OuterTab = "properties" | "members";

function readStoredTab(): OuterTab {
  if (typeof window === "undefined") return "properties";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "members" ? "members" : "properties";
  } catch {
    return "properties";
  }
}

function writeStoredTab(tab: OuterTab) {
  try {
    window.localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // storage unavailable (private mode, quota) — the choice just won't be remembered
  }
}

function regionLabel(region: string) {
  return region.charAt(0).toUpperCase() + region.slice(1);
}

/** Every list, region caption before each region change — the BottomStack reading, reused per region-filtered slice. */
function renderLists(lists: MemberList[]) {
  let lastRegion: string | null | undefined;
  return lists.map((list) => {
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
  });
}

/**
 * V4 · Tabs — Properties and Members as stock tabs, so a long member list
 * never competes with the scalar rows for scroll space. The Members trigger
 * carries the total count as a pill. When the lists carry regions (a
 * Block's slots), a second, smaller tab row inside Members filters to one
 * region at a time, reusing the same stock Tabs part.
 */
function TabsLayout(p: InspectorLayoutProps) {
  const [outerTab, setOuterTab] = useState<OuterTab>(readStoredTab);
  const [regionFilter, setRegionFilter] = useState<string>("all");

  if (p.lists.length === 0) return <>{p.panel}</>;

  const totalCount = p.lists.reduce((sum, list) => sum + list.count, 0);
  const regions: string[] = [];
  for (const list of p.lists) {
    if (list.region !== null && !regions.includes(list.region)) regions.push(list.region);
  }
  const activeRegion = regions.includes(regionFilter) ? regionFilter : "all";

  return (
    <div data-slot="inspector-layout" data-inspector-layout="tabs">
      <Tabs
        value={outerTab}
        onValueChange={(value) => {
          const next: OuterTab = value === "members" ? "members" : "properties";
          setOuterTab(next);
          writeStoredTab(next);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="properties" className="text-xs">
            Properties
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5 text-xs">
            Members
            <span className="rounded-full bg-muted-foreground/15 px-1.5 py-px text-[10px] font-medium tabular-nums text-foreground/70">{totalCount}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="properties">{p.panel}</TabsContent>
        <TabsContent value="members">
          {regions.length > 0 ? (
            <Tabs value={activeRegion} onValueChange={(value) => setRegionFilter(String(value))}>
              <TabsList variant="line" className="h-6 w-full justify-start px-1">
                <TabsTrigger value="all" className="flex-none text-xs">
                  All
                </TabsTrigger>
                {regions.map((region) => (
                  <TabsTrigger key={region} value={region} className="flex-none text-xs">
                    {regionLabel(region)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="all">{renderLists(p.lists)}</TabsContent>
              {regions.map((region) => (
                <TabsContent key={region} value={region}>
                  {renderLists(p.lists.filter((list) => list.region === region))}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            renderLists(p.lists)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const TABS: InspectorLayoutVariant = {
  id: "tabs",
  label: "Tabs",
  blurb: "Properties and Members live in separate tabs, with a region filter row inside Members when the subject has slots — nothing scrolls past the other.",
  stockPart: "Tabs / TabsList / TabsTrigger / TabsContent (vendored shadcn, Base UI)",
  Layout: TabsLayout,
};
