"use client";

import type { ComponentEntry, Instance, MembersControl, PanelVariant } from "@bbox-ui/panel";
import { MIXED_BENCH, depthOf, typeGlyph } from "@bbox-ui/panel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onAdd: (type: string) => void;
  onRemoveLast: () => void;
  onRandomize: () => void;
  variants: PanelVariant[];
  variantId: string;
  onVariantChange: (id: string) => void;
  membersControls: MembersControl[];
  membersControlId: string;
  onMembersControlChange: (id: string) => void;
  entryFor: (name: string) => ComponentEntry;
}

/**
 * The left column: which component, which instances, which panel design.
 *
 * WHY `collapsible="none"`: the stock sidebar is position:fixed over the
 * whole viewport, which would run underneath the site header. This mode is
 * a plain full-height flex column, which is the shape Zach asked for — "full
 * height top to bottom even if we don't use the full height".
 */
export function BenchSidebar(p: BenchSidebarProps) {
  const showCheckboxes = p.instances.length > 1;
  // WHY an instance row may wrap and its preview is never clipped: a Port
  // with its label on the left, or above, is wider and taller than one row,
  // and overflow:hidden cut the label off ("tick" painted over the dot). The
  // preview is the truth of what the instance looks like; the row bends
  // around it.

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
            {p.instances.map((inst) => {
              // A member is listed under its parent, indented one step per
              // level, with its type glyph as the tree mark. The list is
              // already in tree order (see Workbench's `treeOrder`).
              const depth = depthOf(p.instances, inst.id);
              return (
              <label
                key={inst.id}
                data-slot="subject-row"
                data-subject-id={inst.id}
                data-subject-type={inst.type}
                data-depth={depth}
                style={{ marginLeft: depth * 14 }}
                className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-sidebar-accent"
              >
                {depth > 0 && (
                  <span data-slot="subject-tree-mark" className="text-[10px] text-muted-foreground" title={`${inst.type}, inside its parent`}>
                    {typeGlyph(inst.type)}
                  </span>
                )}
                {showCheckboxes && (
                  <input
                    type="checkbox"
                    data-slot="subject-checkbox"
                    checked={p.selectedIds.has(inst.id)}
                    onChange={() => p.onToggleSelected(inst.id)}
                    className="accent-foreground"
                  />
                )}
                {p.isMixed && (
                  <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{inst.type}</span>
                )}
                <div data-slot="subject-preview" className="flex min-h-6 min-w-0 max-w-full items-center overflow-visible [&>*]:max-w-full">
                  {/* A parent's row does not repaint its members (they have
                      rows of their own right below); it says how many it
                      holds, so the well never shows placeholder members that
                      are not there. */}
                  {p.entryFor(inst.type).render(
                    inst.props,
                    inst.members && inst.members.length > 0 ? (
                      <span data-slot="subject-member-count" className="text-[10px] text-muted-foreground">
                        {inst.members.length} {inst.members.length === 1 ? "member" : "members"}
                      </span>
                    ) : undefined,
                  )}
                </div>
              </label>
              );
            })}

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
                {p.instances.length > 1 && (
                  <Button size="icon-sm" variant="outline" data-slot="instance-minus" onClick={p.onRemoveLast} title="Remove the last one">
                    −
                  </Button>
                )}
              </div>
            ) : (
              <div data-slot="instance-stepper" className="mt-1 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" data-slot="instance-minus" onClick={p.onRemoveLast} disabled={p.instances.length <= 1}>
                  −
                </Button>
                <span data-slot="instance-count" className="min-w-[4.5rem] text-center text-xs text-muted-foreground">
                  {p.instances.length} {p.instances.length === 1 ? "instance" : "instances"}
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

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        {/* The Members-control babble switch. Zach's rule: a prototype
            variant is picked live in the app, never by a URL flag. Same
            control as the panel-design picker under it. */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Members control
          <select
            data-slot="members-control-picker"
            value={p.membersControlId}
            onChange={(e) => p.onMembersControlChange(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          >
            {p.membersControls.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Panel design
          <select
            data-slot="variant-picker"
            value={p.variantId}
            onChange={(e) => p.onVariantChange(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          >
            {p.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </SidebarFooter>
    </Sidebar>
  );
}
