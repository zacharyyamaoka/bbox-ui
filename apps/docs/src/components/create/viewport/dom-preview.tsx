"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import { armEditOnRelease, claimInstancePointerDown, isInstancePointerDownClaimed, isSecondPressToEdit } from "@bbox-ui/panel";
import { renderInstance, type EditBundle } from "../render-instance";

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
 */
export function DomPreview({
  entries,
  instances,
  roots,
  selectedIds,
  onSelectionChange,
  onSelectInstance,
  edit,
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSelectInstance: (id: string, additive: boolean) => void;
  edit: EditBundle;
}) {
  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  return (
    <div data-slot="dom-preview" className="flex h-full min-h-0 flex-wrap content-start items-start gap-6 overflow-auto p-6">
      {roots.map((inst) => {
        const on = selectedIds.includes(inst.id);
        const entry = entries.find((e) => e.name === inst.type);
        const inlineEditable = !!entry?.inlineEdit;
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
            className="cursor-default rounded-md p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-ring"
            title={`${inst.type} · ${inst.id}`}
          >
            {renderInstance(entries, byId, inst, selectedIds, onSelectInstance, edit)}
          </div>
        );
      })}
    </div>
  );
}
