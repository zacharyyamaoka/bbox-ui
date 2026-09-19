// src/shapes/shared/pointerOwnership.ts — the gesture boundary, lifted from
// apps/storybook-basics/src/hosts/tldrawHost.tsx:150-191 (`contentOwnsPress`,
// whose own doc carries the full reasoning and the 2026-09-17 measurement).
//
// The rule (ARCHITECTURE.md "Where an interaction belongs"): a gesture bounded
// by one component's box is the COMPONENT's — dnd-kit rails, the CodeMirror
// caret; a gesture spanning the canvas is the HOST's — shape drag, pan, zoom.
// tldraw's mechanism for the boundary is `editor.markEventAsHandled`, chosen
// over `stopPropagation` for the reason the archive's Inspector.tsx:616-620
// records: stopPropagation on a wrapper breaks a child's own pointer capture
// (CodeMirror's caret drag included); marking only hides the event from tldraw.
//
// WHY ownership resolves through the nearest `[data-block-id]` and not a bare
// selector match (donor :160-165): the 2026-09-17 audit measured React Flow's
// unscoped `[data-slot="block-header"]` drag handle letting a MEMBER's header
// (kid's, inside proc) move the PARENT by (57, 24). Here kid's header resolves
// to kid, so for proc it is content and never a drag surface.
//
// TRADE-OFF, stated rather than hidden (donor :171-179): in tldraw select and
// translate are one gesture, so hiding a block-body press from tldraw also
// costs body-click SELECTION — a block is selected by its header or a marquee.
// Splitting the two needs the archive's preempt/interlock ladder
// (memberStackDnd.tsx's four steps), deliberately not built for phase 1.
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";

import { BLOCK_SHAPE_TYPE } from "../types";

/**
 * Does the pressed element belong to the CONTENT rather than to the host's own
 * drag gesture? `true` → hide the press from tldraw; `false` → tldraw sees it
 * and the select tool translates the shape.
 *
 * `nodeId` is the tldraw shape id — the same string `BlockPort id=` stamps as
 * `data-block-id`, which is what makes the ownership lookup work at all.
 */
export function contentOwnsPress(shapeType: string, nodeId: string, target: Element): boolean {
  // Anything a component explicitly claimed: CodeMirror, a member drag handle.
  if (target.closest(`.${POINTER_OWNED_CLASS}`)) return true;
  // A port rail reorders by dnd-kit; a rail press must never translate.
  if (target.closest('[data-slot="block-port-rail"]')) return true;
  if (shapeType === BLOCK_SHAPE_TYPE) {
    const header = target.closest('[data-slot="block-header"]');
    if (!header) return true;
    const owner = header.closest("[data-block-id]")?.getAttribute("data-block-id");
    return owner !== nodeId;
  }
  // Every other face is inert for now — drag it anywhere. A kind whose face
  // owns its own pointer (L1's code editor) adds its case here.
  return false;
}
