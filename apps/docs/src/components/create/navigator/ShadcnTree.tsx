"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import type { InstanceNode } from "@bbox-ui/panel";
import { clickSelect, stepRow, visibleRows } from "@bbox-ui/panel";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem } from "@/registry/new-york-v4/ui/sidebar";
import { cn } from "@/lib/utils";
import type { NavigatorProps, NavigatorVariant } from "./contract";

/**
 * V1 · shadcn Sidebar tree — zero new dependencies.
 *
 * The vendored shadcn Sidebar already ships nested menus (`SidebarMenuSub`)
 * and an active-row state (`isActive` → `data-active`), which is the
 * "sidebar-13 / tree" example on ui.shadcn.com. What it does NOT ship is
 * selection semantics or keyboard navigation, so those come from the one
 * host-neutral reducer in @bbox-ui/panel (`clickSelect`, `stepRow`,
 * `visibleRows`). No drag: the part has none, and hand-rolling one is
 * exactly what this comparison exists to avoid.
 */
function ShadcnTreeNavigator(p: NavigatorProps) {
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const visible = useMemo(() => visibleRows(p.roots, folded), [p.roots, folded]);

  const select = useCallback(
    (id: string, mods: { shift?: boolean; toggle?: boolean }) => {
      const next = clickSelect(visible, { selected: p.selectedIds, anchor }, id, mods);
      setAnchor(next.anchor);
      p.onSelectionChange(next.selected);
    },
    [visible, p.selectedIds, anchor, p.onSelectionChange],
  );

  useEffect(() => {
    if (focusedId) rows.current.get(focusedId)?.focus();
  }, [focusedId]);

  const toggleFold = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: React.KeyboardEvent, node: InstanceNode) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const to = stepRow(visible, node.id, e.key === "ArrowDown" ? 1 : -1);
      if (!to) return;
      setFocusedId(to);
      select(to, { shift: e.shiftKey });
    } else if (e.key === "ArrowRight" && node.children.length > 0 && folded.has(node.id)) {
      e.preventDefault();
      toggleFold(node.id);
    } else if (e.key === "ArrowLeft" && node.children.length > 0 && !folded.has(node.id)) {
      e.preventDefault();
      toggleFold(node.id);
    }
  };

  const renderNode = (node: InstanceNode, depth: number) => {
    const on = p.selectedIds.includes(node.id);
    const hasKids = node.children.length > 0;
    const open = hasKids && !folded.has(node.id);
    const button = (
      <SidebarMenuButton
        ref={(el: HTMLButtonElement | null) => {
          if (el) rows.current.set(node.id, el);
          else rows.current.delete(node.id);
        }}
        isActive={on}
        size="sm"
        data-slot="nav-row"
        data-instance-id={node.id}
        data-instance-type={node.type}
        data-depth={depth}
        data-selected={on}
        aria-selected={on}
        tabIndex={focusedId === node.id || (!focusedId && depth === 0 && node.id === visible[0]) ? 0 : -1}
        onClick={(e) => {
          setFocusedId(node.id);
          select(node.id, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
        }}
        onKeyDown={(e) => onKeyDown(e, node)}
        className={cn("h-7 cursor-default select-none gap-1.5 pr-2", on && "bg-sidebar-accent text-sidebar-accent-foreground")}
        style={{ paddingLeft: 6 }}
        title={`${node.type} · ${node.id}`}
      >
        {hasKids ? (
          <span
            role="button"
            data-slot="nav-disclosure"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggleFold(node.id);
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border"
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </span>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span aria-hidden className="w-3.5 shrink-0 text-center text-[11px] text-muted-foreground">
          {p.glyph(node.type)}
        </span>
        <span data-slot="nav-title" className={cn("min-w-0 flex-1 truncate text-xs", node.untitled && "text-muted-foreground")}>
          {node.title}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.type}</span>
      </SidebarMenuButton>
    );
    return depth === 0 ? (
      <SidebarMenuItem key={node.id}>
        {button}
        {open && <SidebarMenuSub className="mx-2 px-1.5">{node.children.map((c) => renderNode(c, depth + 1))}</SidebarMenuSub>}
      </SidebarMenuItem>
    ) : (
      <SidebarMenuSubItem key={node.id}>
        {button}
        {open && <SidebarMenuSub className="mx-2 px-1.5">{node.children.map((c) => renderNode(c, depth + 1))}</SidebarMenuSub>}
      </SidebarMenuSubItem>
    );
  };

  return (
    <SidebarMenu data-slot="instance-navigator" data-navigator="shadcn" role="tree" aria-multiselectable className="gap-0.5">
      {p.roots.map((r) => renderNode(r, 0))}
    </SidebarMenu>
  );
}

export const SHADCN_TREE: NavigatorVariant = {
  id: "shadcn",
  label: "shadcn Sidebar tree",
  blurb: "Zero new dependencies: the vendored Sidebar's nested menus and active state, with selection and arrow keys from the one shared reducer. No drag — the part has none.",
  stockPart: "SidebarMenu / SidebarMenuSub / SidebarMenuButton (vendored shadcn, Base UI)",
  Navigator: ShadcnTreeNavigator,
};
