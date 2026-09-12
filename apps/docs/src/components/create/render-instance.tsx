"use client";

import type { ReactNode } from "react";
import type { ComponentEntry, Instance, RenderContext } from "@bbox-ui/panel";
import { isSecondPressToEdit } from "@bbox-ui/panel";
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
          e.stopPropagation();
          // WHY: a browser's default action for mousedown on non-form-control
          // content is to shift focus to the nearest FOCUSABLE ANCESTOR (the
          // dom-preview root wrapper carries `tabIndex`, for one). Left
          // alone, that steals focus AWAY FROM the `<input>`/`<textarea>`
          // this same press is about to mount (via `onRequestEdit`,
          // immediately below) a moment after it autofocuses, firing the
          // control's own `onBlur` → `onCommit` → `onEditEnd()` and undoing
          // the edit before a single keystroke — the two-click rule turned
          // itself off. `preventDefault()` here is what the control's own
          // imperative `.focus()` (packages/bbox-ui/src/textBox.tsx) relies
          // on to actually stick.
          e.preventDefault();
          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
          if (edit && isSecondPressToEdit({ id: child.id, additive, selectedIds, inlineEditable })) {
            edit.onRequestEdit(child.id);
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
