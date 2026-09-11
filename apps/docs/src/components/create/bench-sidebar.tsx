"use client";

import type { ComponentEntry, Instance, PanelVariant } from "@bbox-ui/panel";
import { MIXED_BENCH } from "@bbox-ui/panel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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

  return (
    <Sidebar collapsible="none" data-slot="bench-sidebar" className="h-full shrink-0 border-r border-sidebar-border">
      <SidebarHeader className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold">Create</div>
        <div className="text-xs text-muted-foreground">One schema, every view.</div>
      </SidebarHeader>

      <SidebarContent className="min-h-0">
        <SidebarGroup>
          <SidebarGroupLabel>Component</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {p.entries.map((e) => (
                <SidebarMenuItem key={e.name}>
                  <SidebarMenuButton
                    data-slot="component-pick"
                    data-name={e.name}
                    isActive={p.activeName === e.name}
                    onClick={() => p.onActiveNameChange(e.name)}
                  >
                    {e.name}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-slot="component-pick"
                  data-name={MIXED_BENCH}
                  isActive={p.activeName === MIXED_BENCH}
                  onClick={() => p.onActiveNameChange(MIXED_BENCH)}
                >
                  {MIXED_BENCH}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>{p.isMixed ? "Bench" : "Instances"}</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-1.5 px-2">
            {p.instances.map((inst) => (
              <label
                key={inst.id}
                data-slot="subject-row"
                data-subject-id={inst.id}
                data-subject-type={inst.type}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-sidebar-accent"
              >
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
                <div className="flex min-w-0 items-center overflow-hidden [&>*]:max-w-full">{p.entryFor(inst.type).render(inst.props)}</div>
              </label>
            ))}

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
