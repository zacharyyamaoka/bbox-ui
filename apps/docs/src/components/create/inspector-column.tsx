"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { ComponentEntry, Instance, PanelVariant, Subject } from "@bbox-ui/panel";
import { SECTION_PANELS, activeArrangement, ancestry, blockPorts, findSectionPanel, isSlotFill, portPlacementsOf } from "@bbox-ui/panel";
import { MembersPath, memberListsFor, type MemberListActions } from "./members-section";
import { PlacementSection } from "./arrangement-section";
import type { InspectorLayoutVariant } from "./inspector-layout";
import { SectionInspector } from "./sections/SectionInspector";

/**
 * Which inspector design is on screen.
 *
 * "current" is the pre-feedback panel, kept reachable rather than deleted —
 * nothing Zach has not rejected gets removed, and having the before one
 * dropdown away is what makes five proposals judgeable instead of
 * described. Everything else is a section design (packages/panel/src/
 * sections/variants).
 */
const DESIGN_KEY = "bbox-ui.create.inspectorDesign";
const CURRENT_DESIGN = "current";
const DEFAULT_DESIGN = SECTION_PANELS[0]!.id;

interface InspectorColumnProps {
  variant: PanelVariant;
  componentName: string;
  fields: FieldSpec[];
  presets: PresetSpec[];
  subjects: Subject[];
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
  shared: { fields: FieldSpec[]; excluded: string[] } | null;
  selectedTypes: string[];
  selectedCount: number;
  excludedShown: number;
  layout: InspectorLayoutVariant;
  entries: ComponentEntry[];
  instances: Instance[];
  subject: Instance | null;
  onAddMember: (parentId: string, type: string) => void;
  onRemoveMember: (id: string) => void;
  onMoveMember: (parentId: string, from: number, to: number) => void;
  onSetProp: (id: string, fieldId: string, value: FieldValue) => void;
  onSelectInstance: (id: string) => void;
  arrangementActions: Omit<MemberListActions, "onAddMember" | "onRemoveMember" | "onMoveMember" | "onSetProp" | "onSelect">;
  onClearProp: (id: string, fieldId: string) => void;
}

/**
 * The right column. Full height, top to bottom.
 *
 * WHY the panel sits in a flex column with `min-h-0` and `overflow-y:auto`
 * on the scroller and nowhere else: the previous layout rendered the panel as
 * a card in page flow with its own max-height, so it grew an internal
 * scrollbar at ~250px tall with two-thirds of the screen empty below it.
 * Zach: "make sure you never have to scroll it up and down while there is
 * still space on the screen." Here the column IS the available height; the
 * list inside scrolls only once the content is genuinely taller than that.
 */
export function InspectorColumn(p: InspectorColumnProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolls, setScrolls] = useState(false);
  // Read after mount, never in the initialiser: this is a Next page and the
  // server has no localStorage, so the first client render would disagree
  // with the HTML it hydrates (the same rule workbench.tsx already keeps).
  const [design, setDesign] = useState<string>(DEFAULT_DESIGN);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DESIGN_KEY);
      if (stored) setDesign(stored);
    } catch {
      /* private window: the choice still works, it just forgets */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(DESIGN_KEY, design);
    } catch {
      /* see above */
    }
  }, [restored, design]);
  const sectionPanel = findSectionPanel(design);
  const showSections = design !== CURRENT_DESIGN;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });

  return (
    <aside
      data-slot="inspector-column"
      data-scrolls={scrolls}
      className="flex h-full w-[22rem] shrink-0 flex-col border-l border-border bg-background"
    >
      {p.shared && (
        <div data-slot="shared-field-note" className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">{p.selectedTypes.join(" + ")}</strong> —{" "}
          {p.shared.fields.length === 0
            ? <>nothing can be edited across all {p.selectedCount}: these types have no field in common.</>
            : <>{p.shared.fields.length} field{p.shared.fields.length === 1 ? "" : "s"} can be edited across all {p.selectedCount}.</>}
          {p.shared.excluded.length > 0 && (
            <span>
              {" "}Not shared: {p.shared.excluded.slice(0, p.excludedShown).join(", ")}
              {p.shared.excluded.length > p.excludedShown ? `, and ${p.shared.excluded.length - p.excludedShown} more.` : "."}
            </span>
          )}
        </div>
      )}
      <MembersPath instances={p.instances} subject={p.subject} onSelect={p.onSelectInstance} />
      {showSections ? null : (() => {
        // A Port's Placement section: a dedicated slot here rather than a
        // member list's regionHeader, because a Port declares no `members`
        // of its own — there is no list to attach it to (Zach's
        // 2026-09-12 model; see arrangement-section.tsx's own doc).
        if (p.subject?.type !== "Port") return null;
        const parentId = ancestry(p.instances, p.subject.id).at(-1);
        const block = parentId ? p.instances.find((i) => i.id === parentId) : undefined;
        if (!block || block.type !== "Block") return null;
        const arrangement = activeArrangement(block);
        // WHY the full port list, not just [p.subject]: defaultPlacement()
        // appends after whatever this call has already assigned on the
        // same edge (portPlacementsOf's own doc) — a one-element list can
        // never see the Block's other ports, so a freshly-added, not-yet-
        // dragged port showed Order 0 here while the canvas (which does
        // pass the full list, see render-instance.tsx) correctly drew it
        // appended after its siblings.
        const ports = blockPorts(p.instances, block.id);
        const placement = portPlacementsOf(block, ports, arrangement.id)[p.subject.id]!;
        return (
          <PlacementSection
            port={p.subject}
            block={block}
            arrangement={arrangement}
            placement={placement}
            actions={{ onSetPortPlacement: p.arrangementActions.onSetPortPlacement }}
          />
        );
      })()}
      <div ref={scrollRef} data-slot="inspector-scroll" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {showSections ? (
          <div data-slot="panel-variant-host" data-variant={sectionPanel.id}>
            <SectionInspector
              variant={sectionPanel}
              entries={p.entries}
              instances={p.instances}
              subject={p.subject}
              subjects={p.subjects}
              componentName={p.componentName}
              fields={p.fields}
              presets={p.presets}
              toSubject={p.toSubject}
              onChange={p.onChange}
              onClearOverride={p.onClearOverride}
              onSetProp={p.onSetProp}
              onClearProp={p.onClearProp}
              onAddMember={p.onAddMember}
              onRemoveMember={p.onRemoveMember}
              onMoveMember={p.onMoveMember}
              onSelectInstance={p.onSelectInstance}
              onSetArrangement={p.arrangementActions.onSetArrangement}
              onAddArrangement={p.arrangementActions.onAddArrangement}
              onSetArrangementMode={p.arrangementActions.onSetArrangementMode}
              onToggleArrangementEdge={p.arrangementActions.onToggleArrangementEdge}
              onSetArrangementGrouping={p.arrangementActions.onSetArrangementGrouping}
              onSetPortPlacement={p.arrangementActions.onSetPortPlacement}
            />
          </div>
        ) : (
        <div data-slot="panel-variant-host" data-variant={p.variant.id} className="[&>*]:!w-full [&>*]:!max-w-none [&>*]:!rounded-none [&>*]:!border-0 [&>*]:!shadow-none">
          {(() => {
            const panel =
              p.subjects.length > 0 && p.fields.length === 0 ? (
                <div data-slot="no-shared-fields" className="p-4 text-sm text-muted-foreground">
                  <strong className="text-foreground">{p.selectedTypes.join(" + ")}</strong>
                  <p className="mt-1">
                    No field is common to all {p.selectedCount} selected instances, so there is nothing a single control could write. Deselect a type to get a panel back.
                  </p>
                </div>
              ) : (
                <p.variant.Panel
                  componentName={p.componentName}
                  fields={p.fields}
                  presets={p.presets}
                  subjects={p.subjects}
                  toSubject={p.toSubject}
                  onChange={p.onChange}
                  onClearOverride={p.onClearOverride}
                />
              );
            // The member lists a subject carries, computed automatically
            // from its entry (slots → one per slot; members → one; else none)
            // and handed to the chosen layout together with the panel. The
            // panel designs never learn about lists; the layouts never
            // learn about fields.
            const lists = memberListsFor(p.entries, p.instances, p.subject, {
              onAddMember: p.onAddMember,
              onRemoveMember: p.onRemoveMember,
              onMoveMember: p.onMoveMember,
              onSetProp: p.onSetProp,
              onSelect: p.onSelectInstance,
              ...p.arrangementActions,
            });
            return <p.layout.Layout subjectName={p.componentName} panel={panel} lists={lists} isSlotFill={isSlotFill(p.subject ?? undefined)} />;
          })()}
        </div>
        )}
      </div>
      {/* The proposal switcher, bottom of the inspector column — the same
          `<select>` + localStorage pattern as the panel-design picker in
          `bench-sidebar.tsx`, deliberately, so there is one way to switch a
          prototype on this page. Zach, 2026-09-09: never a URL flag he has
          to type. */}
      <div data-slot="inspector-design-switcher" className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">Inspector</span>
        <select
          data-slot="inspector-design-picker"
          value={design}
          onChange={(e) => setDesign(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value={CURRENT_DESIGN}>Current (before)</option>
          {SECTION_PANELS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
