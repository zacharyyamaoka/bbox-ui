"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/registry/new-york-v4/ui/collapsible";
import type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";

/**
 * V? · Inline rows — each member list reads as one more row of the panel.
 *
 * The scalar fields render as given, then a thin divider, then every
 * member list as a single closed row in the Figma Dense grammar (the same
 * 92px label cell, ~11px type, 22px row height as the field rows above
 * it) carrying just its label and a count. Opening one reveals the List
 * control underneath, in place — no second surface, no scroll to the
 * bottom of a long Block. A filled list opens itself; an empty one stays
 * closed, so seven quiet rows are the resting state and the ones that
 * matter announce themselves.
 */
function InlineRowsLayout(p: InspectorLayoutProps) {
  // Open-by-default only on first sight of a list: a fresh Block starts
  // with its non-empty slots expanded and its empty ones collapsed, then
  // the user's own opens/closes are never overridden — including closing
  // a list back down after it stops being empty.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(p.lists.filter((list) => list.count > 0).map((list) => list.id)),
  );
  const knownIds = useRef<Set<string>>(new Set(p.lists.map((list) => list.id)));

  useEffect(() => {
    const unseen = p.lists.filter((list) => !knownIds.current.has(list.id));
    if (unseen.length === 0) return;
    for (const list of unseen) knownIds.current.add(list.id);
    const toOpen = unseen.filter((list) => list.count > 0);
    if (toOpen.length === 0) return;
    setOpenIds((prev) => {
      const next = new Set(prev);
      for (const list of toOpen) next.add(list.id);
      return next;
    });
  }, [p.lists]);

  // Rule 4: zero lists is exactly the panel, no wrapper, no chrome.
  // WHY this sits AFTER the hooks: an early return above them changed the
  // hook order whenever the subject flipped between a leaf (no lists) and
  // a Block (seven) — React's "Expected static flag was missing" in the
  // console, and a remount that forgot which rows were open.
  if (p.lists.length === 0) return <>{p.panel}</>;

  function setListOpen(id: string, open: boolean) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  let lastRegion: string | null | undefined;

  return (
    <div data-slot="inspector-layout" data-inspector-layout="inline">
      {p.panel}
      <div data-slot="inline-rows-divider" style={dividerStyle} />
      <div data-slot="inline-rows-list" style={listWrapStyle}>
        {p.lists.map((list) => {
          const caption = list.region !== null && list.region !== lastRegion ? list.region : null;
          lastRegion = list.region;
          const open = openIds.has(list.id);
          return (
            <div key={list.id}>
              {caption && (
                <div data-slot="region-caption" className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {caption}
                </div>
              )}
              <Collapsible open={open} onOpenChange={(next) => setListOpen(list.id, next)}>
                <CollapsibleTrigger
                  nativeButton={false}
                  render={(triggerProps) => (
                    <div {...triggerProps} data-slot="inline-list-row" data-list-id={list.id} style={rowStyle}>
                      <span style={labelCellStyle}>{list.label}</span>
                      <span style={list.count > 0 ? countStyle : emptyCountStyle}>
                        {list.count > 0 ? `${list.count} member${list.count === 1 ? "" : "s"}` : "empty"}
                      </span>
                      <ChevronDown style={chevronStyle(open)} />
                    </div>
                  )}
                />
                <CollapsibleContent>{list.node}</CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const INLINE_ROWS: InspectorLayoutVariant = {
  id: "inline",
  label: "Inline rows",
  blurb: "Every member list sits inline as one more collapsed row of the panel, opening in place to show its members — no second surface, no scroll to the bottom.",
  stockPart: "Collapsible / CollapsibleTrigger / CollapsibleContent (vendored shadcn, Base UI)",
  Layout: InlineRowsLayout,
};

/* ------------------------------------------------------------------ */
/* Styles — inline, matching the Figma Dense panel's own row grammar   */
/* ------------------------------------------------------------------ */

const dividerStyle: CSSProperties = {
  height: 1,
  margin: "6px 2px",
  background: "var(--bbox-panel-border-soft, #eee)",
};
const listWrapStyle: CSSProperties = { display: "flex", flexDirection: "column" };

// 92px matches the panel's own preset label cell (LABEL_WIDTH there is 96
// for the field rows, 92 for a preset row) — this row reads as a sibling
// of the panel above it, not a different control.
const rowStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: 6,
  minHeight: 22,
  padding: "1px 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};
const labelCellStyle: CSSProperties = {
  width: 92,
  flexShrink: 0,
  fontSize: 11,
  color: "var(--bbox-panel-fg, #444)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const countStyle: CSSProperties = {
  flex: 1,
  fontSize: 10.5,
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
};
const emptyCountStyle: CSSProperties = {
  ...countStyle,
  color: "var(--bbox-panel-fg-faint, #999)",
};

function chevronStyle(open: boolean): CSSProperties {
  return {
    width: 12,
    height: 12,
    flexShrink: 0,
    color: "var(--bbox-panel-fg-faint, #999)",
    transition: "transform 120ms ease",
    transform: open ? "rotate(180deg)" : "rotate(0deg)",
  };
}
