"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import { HOST_FIELDS, HostFactsSection, isSlotFill, type ComponentEntry, type Instance, type PanelVariant, type Subject } from "@bbox-ui/panel";
import { glyphFootprint, type GlyphSize } from "@bbox-ui/core";
import { RENDERS, type CanvasPosition, type CanvasTransform, type Render } from "./contract";
import { MembersPath, memberListsFor } from "./members-section";
import type { InspectorLayoutVariant } from "./inspector-layout";

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
  /** Which render is showing — decides the Renderer section's label, and
   *  whether it has any handles to write with at all (docs/GLYPH-PLAN.md:
   *  "on DOM: rows disabled, no handles here"). */
  render: Render;
  /** The same selection as `subjects`, but as full `Instance`s: the
   *  Renderer section needs `.type` to tell a Glyph's real footprint
   *  (`glyphFootprint`) from a component this page has never measured —
   *  `subjects` stays the narrower `Subject` shape the properties panel
   *  itself is written against. */
  selectedInstances: Instance[];
  positions: Record<string, CanvasPosition>;
  transforms: Record<string, CanvasTransform>;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  onTransformsChange: (next: Record<string, CanvasTransform>) => void;
  layout: InspectorLayoutVariant;
  entries: ComponentEntry[];
  instances: Instance[];
  subject: Instance | null;
  onAddMember: (parentId: string, type: string) => void;
  onRemoveMember: (id: string) => void;
  onMoveMember: (parentId: string, from: number, to: number) => void;
  onSetProp: (id: string, fieldId: string, value: FieldValue) => void;
  onSelectInstance: (id: string) => void;
  /** Current column width in px, and its drag bounds — Workbench owns and
   *  persists the value, this component only renders the handle. */
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
}

/** Renderer-section host facts for one instance — x/y/rotation from the
 *  page's own host-fact state, w/h from the one component whose footprint
 *  this page actually knows how to compute. Every other component's w/h
 *  reads 0 with a hint saying so, rather than a number that would look
 *  measured but isn't (docs/GLYPH-PLAN.md phase 5, item 5). */
function hostFactsProps(
  inst: Instance,
  positions: Record<string, CanvasPosition>,
  transforms: Record<string, CanvasTransform>,
): Record<string, unknown> {
  const pos = positions[inst.id] ?? { x: 0, y: 0 };
  const rotation = transforms[inst.id]?.rotation ?? 0;
  if (inst.type === "Glyph") {
    const footprint = glyphFootprint({
      sizePreset: inst.props.sizePreset as GlyphSize | undefined,
      size: inst.props.size as number | undefined,
      padding: inst.props.padding as number | undefined,
    });
    return { x: pos.x, y: pos.y, rotation, w: footprint.w, h: footprint.h };
  }
  return { x: pos.x, y: pos.y, rotation, w: 0, h: 0 };
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
      <div ref={scrollRef} data-slot="inspector-scroll" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
          {p.selectedInstances.length > 0 && <RendererSection {...p} />}
        </div>
      </div>
    </aside>
  );
}

/**
 * The Renderer section, below the properties panel — one `HostFactsSection`
 * (`@bbox-ui/panel`, the frozen API lane A implements) per render, reading
 * the page's own `positions`/`transforms` rather than a component prop.
 */
function RendererSection(p: InspectorColumnProps) {
  const renderLabel = RENDERS.find((r) => r.id === p.render)!.label;
  const editable = p.render !== "dom";
  const allGlyph = p.selectedInstances.every((i) => i.type === "Glyph");
  // Rotation is a real host fact ONLY for a Glyph — no render turns a
  // bench box today (tldraw's rotate handle and this row both write
  // straight to `bbox-glyph`'s own shape via `tldraw-canvas.tsx`'s
  // `syncShape`, and `bbox-bench` never reads a rotation at all). Drop
  // the row entirely for a non-Glyph selection rather than leave it
  // editable with a claimed writer that writes nothing (audit finding:
  // typing 45 into the row for a Pill left the shape's own rotation at 0).
  const fields = allGlyph ? HOST_FIELDS : HOST_FIELDS.filter((f) => f.id !== "rotation");
  // React Flow has no rotate handle at all (docs/GLYPH-PLAN.md's stock-part
  // table) — this row is the ONLY way to turn a Glyph there, so it gets no
  // "writes this when you drag" note; tldraw's own rotate handle does.
  const writers: Partial<Record<string, string>> =
    p.render === "tldraw"
      ? { x: "tldraw writes this when you drag", y: "tldraw writes this when you drag", rotation: "the rotate handle writes this" }
      : p.render === "reactflow"
        ? { x: "React Flow writes this when you drag", y: "React Flow writes this when you drag" }
        : {};
  if (!allGlyph) {
    writers.w = "not measured for this component yet";
    writers.h = "not measured for this component yet";
    delete writers.rotation;
  }

  const subjects: Subject[] = p.selectedInstances.map((inst) => ({
    id: inst.id,
    props: hostFactsProps(inst, p.positions, p.transforms),
  }));

  function handleChange(fieldId: string, value: FieldValue) {
    if (fieldId === "x" || fieldId === "y") {
      const next = { ...p.positions };
      for (const inst of p.selectedInstances) {
        const pos = next[inst.id] ?? { x: 0, y: 0 };
        next[inst.id] = { ...pos, [fieldId]: value as number };
      }
      p.onPositionsChange(next);
      return;
    }
    if (fieldId === "rotation") {
      const next = { ...p.transforms };
      for (const inst of p.selectedInstances) next[inst.id] = { rotation: value as number };
      p.onTransformsChange(next);
    }
    // w/h are `readOnly` — HostFactsSection never fires onChange for them.
  }

  return (
    <HostFactsSection
      renderLabel={renderLabel}
      fields={fields}
      subjects={subjects}
      onChange={handleChange}
      editable={editable}
      writers={writers}
    />
  );
}
