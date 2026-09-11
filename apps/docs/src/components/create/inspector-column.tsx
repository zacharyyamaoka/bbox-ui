"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { PanelVariant, Subject } from "@bbox-ui/panel";

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
      <div ref={scrollRef} data-slot="inspector-scroll" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div data-slot="panel-variant-host" data-variant={p.variant.id} className="[&>*]:!w-full [&>*]:!max-w-none [&>*]:!rounded-none [&>*]:!border-0 [&>*]:!shadow-none">
          {p.subjects.length > 0 && p.fields.length === 0 ? (
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
          )}
        </div>
      </div>
    </aside>
  );
}
