"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { ComponentEntry, Instance, PanelVariant, Subject } from "@bbox-ui/panel";
import { SECTION_PANELS, findSectionPanel, isSlotFill } from "@bbox-ui/panel";
import { MembersPath, memberListsFor } from "./members-section";
import type { InspectorLayoutVariant } from "./inspector-layout";
import { SectionInspector } from "./sections/SectionInspector";
import type { CanvasPosition, Render } from "./contract";

/**
 * Which inspector design is on screen.
 *
 * "current" is the pre-sections panel, kept reachable rather than deleted —
 * nothing Zach has not rejected gets removed, and having the before one
 * dropdown away is what makes three proposals judgeable instead of
 * described. Everything else is a section design
 * (packages/panel/src/sections/variants).
 *
 * WHY a drop-down in the app and never a URL flag: Zach, 2026-09-09, rated
 * exactly that Bad — a prototype gated behind `?portLanes=1` he had to
 * type. The picker sits at the bottom of the column, same `<select>` +
 * localStorage pattern as `bench-sidebar.tsx`'s panel-design picker, so
 * there is one way to switch a prototype on this page.
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
  /** Clear one prop on one instance — the foreign-target half of
   *  `onClearOverride`, which only ever reaches the SELECTED instances. */
  onClearProp: (id: string, fieldId: string) => void;
  onSelectInstance: (id: string) => void;
  /** The host-owned stratum's live data: which surface is showing, where
   *  each root sits on it, and how to move one. */
  render: Render;
  positions: Record<string, CanvasPosition>;
  onSetPosition: (id: string, next: CanvasPosition) => void;
  /** Current column width in px, and its drag bounds — Workbench owns and
   *  persists the value, this component only renders the handle. */
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
}

/** A thin drag handle on the column's LEFT edge — it borders the viewport,
 *  so dragging left grows the inspector and dragging right shrinks it.
 *  Plain pointer events, no library: the same shape as FigmaDense's own
 *  label-scrub drag, just resizing a column instead of a number. */
function ResizeHandle({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
}: {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [active, setActive] = useState(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { startX: e.clientX, startWidth: width };
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const next = Math.min(maxWidth, Math.max(minWidth, drag.current.startWidth - dx));
    onWidthChange(next);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    drag.current = null;
    setActive(false);
  }

  return (
    <div
      data-slot="inspector-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none ${active ? "bg-primary/25" : "bg-transparent hover:bg-primary/15"}`}
    />
  );
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
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
      style={{ width: p.width }}
    >
      <ResizeHandle width={p.width} minWidth={p.minWidth} maxWidth={p.maxWidth} onWidthChange={p.onWidthChange} />
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
              render={p.render}
              positions={p.positions}
              onSetPosition={p.onSetPosition}
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
            });
            return <p.layout.Layout subjectName={p.componentName} panel={panel} lists={lists} isSlotFill={isSlotFill(p.subject ?? undefined)} />;
          })()}
        </div>
        )}
      </div>
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
