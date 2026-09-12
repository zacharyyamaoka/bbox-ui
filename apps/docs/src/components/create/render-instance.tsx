"use client";

import type { ReactNode } from "react";
import type { ComponentEntry, Instance, RenderContext } from "@bbox-ui/panel";
import { armEditOnRelease, claimInstancePointerDown, isInstancePointerDownClaimed, isSecondPressToEdit } from "@bbox-ui/panel";
import type { FieldValue } from "@bbox-ui/schema";

/**
 * The in-place-editing half of `ViewportProps` (contract.ts), regrouped as
 * one bundle so `renderInstance` and its two callers don't each destructure
 * four separate props. Same fields, same owner (workbench.tsx) — see
 * `ViewportProps`'s own doc comments for what each means.
 */
export interface EditBundle {
  editingId: string | null;
  editSnapshot: FieldValue | null;
  onRequestEdit: (id: string) => void;
  onEditEnd: () => void;
  onInstancePropChange: (id: string, fieldId: string, value: FieldValue) => void;
}

/**
 * ONE way to draw an instance, members included, for every render.
 *
 * WHY here and not in each canvas: a member is drawn INSIDE its parent by
 * its parent's own component — a Port inside a PortEdge, a Block inside a
 * Stack — and never as a node of its own. If each of the three renders
 * walked the tree itself, one of them would forget, and a member would be a
 * node on React Flow and a child in the DOM. Every render calls this and
 * draws only `topLevel(instances)`.
 *
 * Each member is wrapped so a pointer-down on it selects THAT instance and
 * stops there: the inspector then shows the child. That is Zach's ask —
 * "if I click any of those children then it could change the inspector
 * panel to them" — done by ordinary selection, not a nested editor. The
 * wrapper is `display: contents` so it adds no box to the parent's layout;
 * the outline paints on the member's first element instead.
 *
 * A component with SLOTS gets its fills by slot id in `ctx.slots` instead
 * of as ordered children, so its render puts each in its hole. A fill is
 * told its slot's label so an empty Flex can say which hole it is.
 *
 * `edit`, when given, is docs/TEXTBOX-EDITING-SPEC.md §3's two-click rule:
 * a pointer-down on an instance that is ALREADY the sole selection and
 * whose entry declares `inlineEdit` requests editing instead of
 * (re)selecting; a double-click requests editing directly (the host
 * no-ops it for an entry without `inlineEdit`). `dom-preview.tsx`'s
 * top-level root wrapper applies the identical rule via the exported
 * `isSecondPressToEdit` so the two wrappers can never drift apart.
 * `nested` defaults to `false` — only this function's own recursive calls
 * (via `wrap`, below) mark a child as nested.
 */
export function renderInstance(
  entries: ComponentEntry[],
  byId: Map<string, Instance>,
  inst: Instance,
  selectedIds: string[],
  onSelect: (id: string, additive: boolean) => void,
  edit?: EditBundle,
  nested = false,
): ReactNode {
  const entry = entries.find((e) => e.name === inst.type);
  if (!entry) return null;
  const memberIds = inst.members ?? [];
  const wrap = (child: Instance): ReactNode => {
    const on = selectedIds.includes(child.id);
    const childEntry = entries.find((e) => e.name === child.type);
    const inlineEditable = !!childEntry?.inlineEdit;
    return (
      <span
        key={child.id}
        data-slot="member-instance"
        data-instance-id={child.id}
        data-instance-type={child.type}
        data-selected={on}
        className="contents [&>*:first-child]:rounded-sm [&>*:first-child]:outline-offset-2 data-[selected=true]:[&>*:first-child]:outline data-[selected=true]:[&>*:first-child]:outline-2 data-[selected=true]:[&>*:first-child]:outline-ring"
        onPointerDown={(e) => {
          // WHY a claim flag and not `e.stopPropagation()` (what this was):
          // see `claimInstancePointerDown`'s own doc comment
          // (packages/panel/src/twoClickEdit.ts) — stopPropagation halts
          // the NATIVE event too, which silently cancelled every drag that
          // starts on a member's resting content in both React Flow and
          // tldraw (docs/TEXTBOX-EDITING-SPEC.md DoD). A shallower ancestor
          // wrapper (an outer member, or the top-level root in
          // dom-preview.tsx) still needs to see this exact press bubble to
          // it — it just needs to know NOT to also select/edit ITS OWN
          // instance for the identical gesture the innermost wrapper (this
          // one, since bubbling runs target-to-root) already handled.
          if (isInstancePointerDownClaimed(e)) return;
          claimInstancePointerDown(e);
          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
          if (edit && isSecondPressToEdit({ id: child.id, additive, selectedIds, inlineEditable })) {
            // WHY armed rather than requested immediately: see
            // `armEditOnRelease`'s own doc comment
            // (packages/panel/src/twoClickEdit.ts) — this exact press (the
            // second one on an already-selected, inline-editable instance)
            // is also precisely the DoD's "a drag that starts on the
            // resting text ... still moves the node" case, and the
            // `preventDefault()` this branch used to call immediately (to
            // protect the fresh control's autofocus from the browser's own
            // "shift focus to nearest focusable ancestor" default) also
            // silences the `mousedown` React Flow's node-drag listens for
            // — so acting on pointer-DOWN made a real drag starting here
            // impossible. Arming defers the decision to pointer-up, and a
            // real drag (movement past 4px) cancels it before that ever
            // fires — no `preventDefault()`, `mousedown` reaches React
            // Flow untouched, the node moves. Passing `e` itself (not just
            // its coordinates) is what lets `armEditOnRelease` refuse a
            // right-button press on its own — see its own doc comment.
            armEditOnRelease(e, () => edit.onRequestEdit(child.id));
            return;
          }
          onSelect(child.id, additive);
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          edit?.onRequestEdit(child.id);
        }}
      >
        {renderInstance(entries, byId, child, selectedIds, onSelect, edit, true)}
      </span>
    );
  };
  const kids = memberIds.map((id) => byId.get(id)).filter((c): c is Instance => !!c);
  const ctx: RenderContext = { nested };
  if (inst.slot) ctx.slotLabel = inst.slot.label;
  if (entry.inlineEdit && edit) {
    const field = entry.inlineEdit.field;
    ctx.edit = {
      editing: edit.editingId === inst.id,
      onChange: (value) => edit.onInstancePropChange(inst.id, field, value),
      onCommit: (value) => {
        edit.onInstancePropChange(inst.id, field, value);
        edit.onEditEnd();
      },
      onCancel: () => {
        // Restore the value captured when THIS instance's edit began — the
        // live write-through already moved `props[field]` off it, so a
        // plain `onEditEnd()` here would keep whatever was last typed.
        if (edit.editingId === inst.id && edit.editSnapshot !== null) {
          edit.onInstancePropChange(inst.id, field, edit.editSnapshot);
        }
        edit.onEditEnd();
      },
    };
  }
  if (entry.slots) {
    ctx.slots = {};
    for (const child of kids) if (child.slot) ctx.slots[child.slot.id] = wrap(child);
    return entry.render(inst.props, undefined, ctx);
  }
  const children = kids.length === 0 ? undefined : kids.map(wrap);
  return entry.render(inst.props, children, ctx);
}
