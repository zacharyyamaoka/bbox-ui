import type { FieldSpec } from "@bbox-ui/schema";
import type { Render } from "../contract";

/**
 * The render surface's own facts, declared as ordinary `FieldSpec`s.
 *
 * WHY they are ordinary fields and not a bespoke section shape — this is
 * the load-bearing half of Zach's 2026-09-12 question, "I like how there is
 * a section that displays the props from the renderer … I am thinking this
 * could be just another header though." It can, and the reason is that the
 * create page's own seam contract already drew the line the section needs:
 *
 *     "Kept OUT of `Instance.props`: position is a fact about a host, not a
 *      property of the component, and putting it in props would put an x/y
 *      row in the inspector for every component."
 *     — apps/docs/src/components/create/contract.ts, on `CanvasPosition`
 *
 * So the distinction was already modelled; the panel simply had no view
 * onto it. A host fact then needs nothing new: a `FieldSpec` for the
 * declaration, `BoundField.subjects` to read a DIFFERENT subject than the
 * component instance (exactly what a Bar's `hidden` inside a Block's Header
 * section already does), `BoundField.note` to say who writes it, and
 * `BoundField.disabled` for a surface that has no handles.
 *
 * WHY x and y share a `group`: they are one value, which is the rule
 * `FieldSpec.group` states and the reason Figma pairs them. It also means
 * the host region gets stacked labels for free from the same declaration
 * every component uses — Zach's pick 4, on rows that are not a component's
 * at all.
 */
export const HOST_FIELDS: FieldSpec[] = [
  { id: "x", label: "X", kind: "number", defaultValue: 0, unit: "px", step: 1, group: "position" },
  { id: "y", label: "Y", kind: "number", defaultValue: 0, unit: "px", step: 1, group: "position" },
];

export const RENDER_LABEL: Record<Render, string> = {
  dom: "DOM",
  reactflow: "React Flow",
  tldraw: "tldraw",
};

/**
 * Who writes each row, per surface — the one quiet line under a host row.
 *
 * WHY the DOM's copy is a fact about the surface and not a warning box:
 * `RENDERS` already declares `canMove: false` for the DOM render, so the
 * rows are disabled from the model rather than from a special case, and the
 * section is `muted`. The predecessor implementation of this idea
 * (`HostFactsSection.tsx` on `claude/glyph-finish`) painted an amber
 * warning strip saying the same sentence — helper text of exactly the kind
 * Zach deleted from member lists ("it just add clutter") one round earlier.
 */
export function hostWriter(render: Render): string {
  return render === "dom" ? "The DOM render has no canvas; nothing writes this here." : `${RENDER_LABEL[render]} writes this when you drag.`;
}
