"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { ComponentEntry, Instance, Subject } from "@bbox-ui/panel";
import { activeArrangement, ancestry, blockPorts, portPlacementsOf } from "@bbox-ui/panel";
import { MembersPath, type MemberListActions } from "./members-section";
import { PlacementSection } from "./arrangement-section";
import { SectionInspector } from "./sections/SectionInspector";
import type { CanvasPosition, Render } from "./contract";

/**
 * WHY there is no inspector design picker at the foot of this column any
 * more, and no pre-sections panel behind it: the drop-down offered "Current
 * (before)" plus P1/P2/P3 while those were being judged, and Zach picked P1
 * on 2026-09-12. A switcher whose decision is made can only ever put the page
 * into a state nobody wants, and the repo already set the precedent —
 * `demos/capture-picks-applied.mjs` asserts that once picks are applied "no
 * switcher for navigator, layout or members control remains".
 *
 * The six `PANEL_VARIANTS` are still built, exported and comparable side by
 * side in the demo that exists for exactly that (`demos/inspector`, `pnpm
 * demo`). What they are not any more is a second inspector living inside the
 * product page.
 */

interface InspectorColumnProps {
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
  arrangementActions: Omit<MemberListActions, "onAddMember" | "onRemoveMember" | "onMoveMember" | "onSetProp" | "onSelect">;
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
      {(() => {
        // A port's Placement section: a dedicated slot here rather than a
        // member list's regionHeader, because a port declares no `members`
        // of its own — there is no list to attach it to (Zach's
        // 2026-09-12 model; see arrangement-section.tsx's own doc).
        //
        // "LabeledPort", not "Port", since the 2026-09-15 split: a Block's
        // ports are the COMPOSITE (MEMBER_SPECS.Block accepts LabeledPort,
        // and `blockPorts` filters on it). Left as "Port" this returned
        // null for every real Block port and the Placement section simply
        // vanished from the inspector — the silent half of a rename that
        // changed what an existing literal means.
        if (p.subject?.type !== "LabeledPort") return null;
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
        <div data-slot="panel-variant-host" data-variant="sections">
          <SectionInspector
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
            arrangementActions={p.arrangementActions}
          />
        </div>
      </div>
    </aside>
  );
}
