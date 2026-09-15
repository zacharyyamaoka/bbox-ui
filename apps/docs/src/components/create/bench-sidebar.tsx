"use client";

import type { ComponentEntry, Instance, InstanceNode } from "@bbox-ui/panel";
import { MIXED_BENCH, shouldSuppressNativeFocusShift } from "@bbox-ui/panel";
import type { NavigatorVariant } from "./navigator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
} from "@/registry/new-york-v4/ui/sidebar";
import { Button } from "@/registry/new-york-v4/ui/button";

interface BenchSidebarProps {
  entries: ComponentEntry[];
  activeName: string;
  onActiveNameChange: (name: string) => void;
  isMixed: boolean;
  instances: Instance[];
  tree: InstanceNode[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
  onMoveInstance: (id: string, parentId: string | null, index: number) => void;
  canDropInstance: (id: string, parentId: string | null) => boolean;
  glyph: (type: string) => string;
  navigator: NavigatorVariant;
  /** Roots only — a Block's seven slot fills are not "instances" to the stepper. */
  rootCount: number;
  onAdd: (type: string) => void;
  onRemoveLast: () => void;
  onRandomize: () => void;
  entryFor: (name: string) => ComponentEntry;
}

/**
 * The left column: which component, and which instances.
 *
 * WHY there is no "Panel design" chooser in the footer any more: it picked
 * among the six `PANEL_VARIANTS`, and Zach decided that on 2026-09-11 ("It's
 * decided. We're going forward with figma dense."). The six are still built
 * and still comparable side by side in `demos/inspector`, which is the demo
 * that exists to keep that decision reviewable; this page just stopped being
 * a second place to re-open it.
 *
 * WHY `collapsible="none"`: the stock sidebar is position:fixed over the
 * whole viewport, which would run underneath the site header. This mode is
 * a plain full-height flex column, which is the shape Zach asked for — "full
 * height top to bottom even if we don't use the full height".
 */
export function BenchSidebar(p: BenchSidebarProps) {

  return (
    <Sidebar collapsible="none" data-slot="bench-sidebar" className="h-full shrink-0 border-r border-sidebar-border">
      <SidebarHeader className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold">Create</div>
        <div className="text-xs text-muted-foreground">One schema, every view.</div>
      </SidebarHeader>

      <SidebarContent className="min-h-0">
        <SidebarGroup>
          <SidebarGroupLabel>Component</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            {/* WHY a select and not a menu list: Zach, 2026-09-11 — "to give us
                more space on the left hand side, it would make more sense if all
                the different components are in a drop down list." Nine rows of
                nav were most of the column; the instances are what the column
                is for. Same control as the panel-design picker below it. */}
            <select
              data-slot="component-picker"
              value={p.activeName}
              onChange={(e) => p.onActiveNameChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {p.entries.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
              <option value={MIXED_BENCH}>{MIXED_BENCH}</option>
            </select>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>{p.isMixed ? "Bench" : "Instances"}</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-1.5 px-2">
            {/* The navigator: a tree, rows highlighted when selected, no
                checkboxes. Zach, 2026-09-11: "its actually basically turning
                into a tree … instead of check boxes … more ergonomic shift
                multi select … highlight the rows". Which stock tree part
                draws it is the switcher's choice in the footer. */}
            <div
              data-slot="navigator-host"
              data-navigator={p.navigator.id}
              className="min-h-0"
              // WHY here, common to all five navigator variants, and not
              // inside any one of them: `shouldSuppressNativeFocusShift`'s
              // own doc comment (@bbox-ui/panel/twoClickEdit.ts,
              // verify-round-4 F3) — react-arborist, React Aria Tree and
              // headless-tree all lost a navigator click's own selection
              // when it landed while a TextBox elsewhere was mid-edit,
              // because the browser's own mousedown→focus-shift default
              // action fires (and with it, `blur` → the edit's commit →
              // a re-render) BEFORE the row's own `click` ever does. This
              // one capture-phase check, applied uniformly to every
              // navigator's own rows via the shared `[data-slot="nav-row"]`
              // marker, removes the race at its one common source rather
              // than patching each library's own click handling
              // separately — the DOM check reads `document.activeElement`
              // directly rather than threading `editingId` through
              // `NavigatorProps`, since "is an inline-edit control
              // currently focused" is exactly what the shared
              // `data-bbox-interactive` marker already answers.
              onMouseDownCapture={(e) => {
                const activeElementIsInlineEditControl =
                  document.activeElement instanceof Element && document.activeElement.matches("[data-bbox-interactive]");
                const pressLandedOnSelectableRow = e.target instanceof Element && !!e.target.closest('[data-slot="nav-row"]');
                if (shouldSuppressNativeFocusShift({ activeElementIsInlineEditControl, pressLandedOnSelectableRow })) {
                  e.preventDefault();
                }
              }}
            >
              <p.navigator.Navigator
                roots={p.tree}
                selectedIds={Array.from(p.selectedIds)}
                onSelectionChange={p.onSelectionChange}
                onMove={p.onMoveInstance}
                canDrop={p.canDropInstance}
                glyph={p.glyph}
              />
            </div>
            {p.isMixed ? (
              <div data-slot="bench-adder" className="mt-1 flex flex-wrap gap-1">
                {p.entries.map((e) => (
                  <button
                    key={e.name}
                    type="button"
                    data-slot="add-type"
                    data-type={e.name}
                    onClick={() => p.onAdd(e.name)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-sidebar-accent"
                  >
                    + {e.name}
                  </button>
                ))}
                {p.rootCount > 1 && (
                  <Button size="icon-sm" variant="outline" data-slot="instance-minus" onClick={p.onRemoveLast} title="Remove the last one">
                    −
                  </Button>
                )}
              </div>
            ) : (
              <div data-slot="instance-stepper" className="mt-1 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" data-slot="instance-minus" onClick={p.onRemoveLast} disabled={p.rootCount <= 1}>
                  −
                </Button>
                <span data-slot="instance-count" className="min-w-[4.5rem] text-center text-xs text-muted-foreground">
                  {p.rootCount} {p.rootCount === 1 ? "instance" : "instances"}
                </span>
                <Button size="icon-sm" variant="outline" data-slot="instance-plus" onClick={() => p.onAdd(p.activeName)}>
                  +
                </Button>
              </div>
            )}
            <Button size="sm" variant="outline" data-slot="randomize" onClick={p.onRandomize} className="mt-1 w-fit text-xs">
              🎲 Randomize
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

    </Sidebar>
  );
}
