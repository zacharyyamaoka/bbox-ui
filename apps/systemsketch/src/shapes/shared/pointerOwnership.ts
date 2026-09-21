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
// THE BODY IS THE HOST'S, EXCEPT WHERE A BODY MEANS SOMETHING ELSE (P-007,
// 2026-09-21). This file used to hide EVERY block press that was not on a
// `[data-slot="block-header"]`, with no reference to the block's view, and
// stated the cost as an accepted trade-off: "a block is selected by its header
// or a marquee". That was the wrong cut. A simple- or port-view block is a
// plain node — its body is nothing but its own paint, so a press there can
// only mean "grab this block", and the header-only rule left it reachable by
// its 37px header band or by tldraw's 3px `hitTestMargin` ring and nothing
// else. Zach reported the same shape of complaint from the expanded side
// ("expanded view only selectable by edge").
//
// An EXPANDED block is the exception, and it is a real one rather than a
// carve-out for convenience: it is `isFrameLike`, so its interior is where
// members go. `BlockShapeUtil.getGeometry`'s note carries the measurements —
// an interior that claimed the point would stop `getDraggingOverShape`
// adopting dropped blocks ("a container ceasing to be one") and would cover
// every `ss-wire` painted underneath. The geometry there is deliberately
// hollow, so the DOM must be too, or the two gates would disagree.
//
// WHAT IS STILL NOT SPLIT, so it is not claimed: select and translate remain
// ONE tldraw gesture. Letting the body through hands both to the host at once;
// it does not give the body a select-without-drag of its own. That still needs
// the archive's preempt/interlock ladder (memberStackDnd.tsx's four steps).
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
    if (header) {
      const owner = header.closest("[data-block-id]")?.getAttribute("data-block-id");
      return owner !== nodeId;
    }
    return bodyIsContent(nodeId, target);
  }
  // Every other face is inert for now — drag it anywhere. A kind whose face
  // owns its own pointer (L1's code editor) adds its case here.
  return false;
}

/**
 * A press on a block's BODY — anywhere in its card that is not the header, not
 * a rail and not something a component claimed outright. `true` → content owns
 * it and tldraw never sees it; `false` → the host drags the block.
 *
 * WHY the view is read off the DOM rather than passed down from the shape
 * record, which is where it actually lives: `NodeShapeFrame` is shared by
 * every node kind and knows only a `shapeType`, so threading a block-only
 * prop through it would put `ss-block`'s vocabulary in the one file that is
 * deliberately free of it. The trunk ALREADY stamps the answer —
 * `@trunk/components/blockPort.tsx:369-371` writes `data-view` and
 * `data-block-id` onto the SAME element — so the ownership lookup this file
 * already does (`closest("[data-block-id]")`) reaches it for free. It is the
 * same fact from the same render pass, not a second copy of it.
 *
 * WHY it resolves through the NEAREST `[data-block-id]` and compares ids,
 * instead of querying this shape's own wrapper: `markEventAsHandled` cannot be
 * taken back. If this handler claimed a press that belonged to another block's
 * DOM, that block's own handler could not release it. So anything that is not
 * provably THIS block's body stays content — the conservative direction, and
 * the same test the header branch above already applies.
 */
function bodyIsContent(nodeId: string, target: Element): boolean {
  const owner = target.closest("[data-block-id]");
  if (!owner || owner.getAttribute("data-block-id") !== nodeId) return true;
  // Expanded is the container view (`BlockShapeUtil.isFrameLike`), and its
  // body has to stay see-through. Every other view is a plain node whose body
  // is a grab surface. Unknown/absent `data-view` falls to the safe side.
  return owner.getAttribute("data-view") !== "simple" && owner.getAttribute("data-view") !== "port";
}
