"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { FieldValue } from "@bbox-ui/schema";
import { GlyphPicker } from "@bbox-ui/glyph-picker";
import type { GlyphSize } from "@bbox-ui/core";
import type { CanvasTransform } from "../contract";
import { renderInstance } from "../render-instance";

/**
 * Plain DOM. The components exactly as they render with no host around them,
 * one per instance, in a dotted-grid well so the eye reads "canvas" here too
 * even though nothing moves. Clicking one selects it; shift-click extends.
 *
 * A `Glyph` instance is the one exception to "no host around them": it
 * renders through the real `GlyphPicker` rather than `entry.render` (D5 —
 * click opens the picker, same trigger every render uses), with rotation
 * (a host fact, D2) applied as a CSS rotate so switching renders never
 * changes the picture.
 */
export function DomPreview({
  entries,
  instances,
  roots,
  selectedIds,
  onSelectionChange,
  transforms,
  onInstancePropsChange,
  onSelectInstance,
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  transforms: Record<string, CanvasTransform>;
  onInstancePropsChange: (id: string, patch: Record<string, FieldValue | undefined>) => void;
  onSelectInstance: (id: string, additive: boolean) => void;
}) {
  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  return (
    <div data-slot="dom-preview" className="flex h-full min-h-0 flex-wrap content-start items-start gap-6 overflow-auto p-6">
      {roots.map((inst) => {
        const on = selectedIds.includes(inst.id);
        const select = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            onSelectionChange(on ? selectedIds.filter((x) => x !== inst.id) : [...selectedIds, inst.id]);
          } else onSelectionChange([inst.id]);
        };

        if (inst.type === "Glyph") {
          const rotation = transforms[inst.id]?.rotation ?? 0;
          return (
            <div
              key={inst.id}
              data-slot="dom-instance"
              data-instance-id={inst.id}
              data-selected={on}
              // WHY a plain div and not the `<button>` every other instance
              // uses: `GlyphPicker`'s own default trigger IS a button (Base
              // UI's `Popover.Trigger`) — nesting it inside another button
              // is invalid HTML and lets one press fight the other's click
              // handling. A div has no click semantics of its own to
              // collide with the trigger's, so both the picker's open/close
              // and this wrapper's select-on-click fire independently, which
              // is exactly D5's "the click also selects, so the inspector
              // follows".
              onClick={select}
              title={`${inst.type} · ${inst.id}`}
              className="inline-flex rounded-md p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-ring"
              style={{ transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined, transformOrigin: "center" }}
            >
              <GlyphPicker
                value={(inst.props.content as string | undefined) ?? ""}
                onChange={(next) => onInstancePropsChange(inst.id, { content: next })}
                sizePreset={inst.props.sizePreset as GlyphSize | undefined}
                size={inst.props.size as number | undefined}
                padding={inst.props.padding as number | undefined}
                // No `portalContainer`: the DOM render has no canvas layer
                // to paint above — the ambient DOM position is correct
                // here, same as Storybook's bare mount.
              />
            </div>
          );
        }

        return (
          <button
            key={inst.id}
            type="button"
            data-slot="dom-instance"
            data-instance-id={inst.id}
            data-selected={on}
            onClick={select}
            // WHY no rounded-* here: `outline` traces the element's own
            // border-radius, so a rounded box drew the selection as a soft
            // pill instead of tldraw's sharp-cornered indicator (Zach,
            // 2026-09-11). bbox-accent — not the neutral `ring` token — is
            // this app's real blue, already used for Port's role text.
            className="p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-[color:var(--bbox-accent)]"
            title={`${inst.type} · ${inst.id}`}
          >
            {renderInstance(entries, byId, inst, selectedIds, onSelectInstance)}
          </button>
        );
      })}
    </div>
  );
}
