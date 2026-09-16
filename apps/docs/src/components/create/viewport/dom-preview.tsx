"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import { armEditOnRelease, claimInstancePointerDown, isInstancePointerDownClaimed, isSecondPressToEdit } from "@bbox-ui/panel";
import type { FieldValue } from "@bbox-ui/schema";
import { GlyphPicker } from "@bbox-ui/glyph-picker";
import type { GlyphSize, PortEdgeId } from "@bbox-ui/core";
import type { CanvasTransform } from "../contract";
import { renderInstance, type EditBundle } from "../render-instance";
import { HostZoomContext } from "../port-dnd";

/**
 * Plain DOM. The components exactly as they render with no host around them,
 * one per instance, in a dotted-grid well so the eye reads "canvas" here too
 * even though nothing moves. Pointer-down selects; shift/cmd/ctrl extends.
 *
 * WHY the root wrapper is a `<div role="button">` and not a real `<button>`:
 * an inline-editable instance (a TextBox) renders a real `<input>`/
 * `<textarea>` in the same spot once editing starts, and a focusable
 * control nested inside a native `<button>` is invalid HTML — the browser
 * still lets it happen, but a click on the control would bubble to the
 * button's own handler on top of whatever the control's own stopPropagation
 * already stops. A div with `role="button"` gets the same two-click
 * treatment and semantics without the nesting hazard; `onKeyDown` keeps
 * Enter/Space selecting for keyboard users.
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
  edit,
  onMovePort,
  highlightSlots,
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  transforms: Record<string, CanvasTransform>;
  onInstancePropsChange: (id: string, patch: Record<string, FieldValue | undefined>) => void;
  onSelectInstance: (id: string, additive: boolean) => void;
  edit: EditBundle;
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  The DOM render is the one host wired for it today. */
  onMovePort?: (blockId: string, portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  highlightSlots: boolean;
}) {
  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  return (
    // The DOM render is never scaled, so every PortDndProvider nested under
    // it (one per Block, mounted by renderInstance) divides its drag
    // overlay by zoom 1 — a no-op, and the seam a scaled host would use.
    <HostZoomContext.Provider value={1}>
    <div data-slot="dom-preview" className="flex h-full min-h-0 flex-wrap content-start items-start gap-6 overflow-auto p-6">
      {roots.map((inst) => {
        const on = selectedIds.includes(inst.id);
        const entry = entries.find((e) => e.name === inst.type);
        const inlineEditable = !!entry?.inlineEdit;

        // WHY a Glyph takes a plain click-select and never the two-click
        // edit gesture below: it is not `inlineEdit`-able, and its whole
        // press belongs to the picker trigger (D5). Running the arming
        // logic over it would make the second press on an already-selected
        // Glyph try to open a text editor that does not exist, competing
        // with the popover that press is actually meant to open.
        if (inst.type === "Glyph") {
          const select = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              onSelectionChange(on ? selectedIds.filter((x) => x !== inst.id) : [...selectedIds, inst.id]);
            } else onSelectionChange([inst.id]);
          };
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
          <div
            key={inst.id}
            role="button"
            tabIndex={0}
            data-slot="dom-instance"
            data-instance-id={inst.id}
            data-selected={on}
            // WHY pointer-down and not click: the two-click rule (shared
            // with renderInstance's member wrapper via `isSecondPressToEdit`)
            // is a pointer-down decision everywhere else in this file's
            // family — keeping this root wrapper on the same event keeps
            // "already the sole selection" consistent with what the member
            // wrapper saw a moment earlier on the same gesture type.
            onPointerDown={(e) => {
              // WHY this claim check, now that render-instance.tsx's member
              // wrapper no longer calls `e.stopPropagation()`: a press that
              // landed on a MEMBER already ran that member's own
              // onPointerDown (bubble order is target-to-root, so the
              // innermost member sees it first) and claimed the event —
              // this root must not ALSO select/edit the TOP-LEVEL instance
              // for the identical gesture, which would fight the member's
              // own selection a moment later. See
              // `claimInstancePointerDown`'s doc comment
              // (packages/panel/src/twoClickEdit.ts) for why a claim flag
              // replaced stopPropagation: the native event must still reach
              // React Flow's / tldraw's own ancestor drag listeners.
              if (isInstancePointerDownClaimed(e)) return;
              claimInstancePointerDown(e);
              const additive = e.shiftKey || e.metaKey || e.ctrlKey;
              if (isSecondPressToEdit({ id: inst.id, additive, selectedIds, inlineEditable })) {
                // WHY armed on release rather than requested immediately,
                // exactly like render-instance.tsx's member wrapper (see
                // `armEditOnRelease`'s own doc comment,
                // packages/panel/src/twoClickEdit.ts): this root wrapper
                // used to call `onRequestEdit` right here, on pointer-DOWN
                // — the one place this file's own gesture had drifted from
                // the member wrapper's. Routing through the SAME helper is
                // what the DoD's shared two-click rule actually requires:
                // not just the same DECISION (`isSecondPressToEdit`), but
                // the same RESOLUTION on pointer-up, so a drag starting
                // here is exactly as recoverable as one starting on a
                // member.
                armEditOnRelease(e, () => edit.onRequestEdit(inst.id));
                return;
              }
              // WHY preventDefault only here, on the plain-select branch:
              // this wrapper IS itself focusable (`tabIndex`), so its own
              // default mousedown focus-shift would otherwise contend with
              // normal keyboard/tab flow after an ordinary select. The
              // edit-arm branch, above, defers everything — including any
              // such concern — to `armEditOnRelease`, exactly like the
              // member wrapper (render-instance.tsx), which never calls
              // `preventDefault()` on pointer-down either.
              e.preventDefault();
              if (additive) onSelectionChange(on ? selectedIds.filter((x) => x !== inst.id) : [...selectedIds, inst.id]);
              else onSelectionChange([inst.id]);
            }}
            onDoubleClick={() => edit.onRequestEdit(inst.id)}
            onKeyDown={(e) => {
              // WHY the target guard: Enter/Escape typed INTO an editing
              // control (a member deep inside this root, or this root's own
              // TextBox rendered bare) bubble right past this handler — the
              // control owns those keys (commit/cancel), and without this
              // check its Enter would ALSO re-select the whole top-level
              // instance out from under the field that was just committed.
              if (e.target !== e.currentTarget) return;
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onSelectionChange([inst.id]);
            }}
            // WHY no rounded-* here: `outline` traces the element's own
            // border-radius, so a rounded box drew the selection as a soft
            // pill instead of tldraw's sharp-cornered indicator (Zach,
            // 2026-09-11). bbox-accent — not the neutral `ring` token — is
            // this app's real blue, already used for Port's role text.
            className="cursor-default p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-[color:var(--bbox-accent)]"
            title={`${inst.type} · ${inst.id}`}
          >
            {renderInstance(entries, byId, inst, selectedIds, onSelectInstance, edit, false, onMovePort, highlightSlots)}
          </div>
        );
      })}
    </div>
    </HostZoomContext.Provider>
  );
}
