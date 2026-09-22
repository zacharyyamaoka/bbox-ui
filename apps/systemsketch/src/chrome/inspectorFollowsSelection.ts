// src/chrome/inspectorFollowsSelection.ts — the right rail's selection policy:
// clicking an inspectable object opens the Inspector on it, and deselecting
// closes it again if (and only if) the click is what opened it.
//
// Zach, 2026-09-21: "We need the right inspect menu to come up when we click on
// objects! can you please implement this asap!!!" Before this file the
// Inspector took two presses (a strip launcher, then the rail's own surface
// switch — `./panels.tsx`'s `SurfaceSwitch`) and a click on a block did
// nothing to it.
//
// Policy, not kit: the open/close state is the HOST's by the menu kit's design
// (docs/menus/MENU-KIT-DESIGN.md §4), so this lives beside `./overlay.tsx`,
// which owns the rail's `open` state, and `@trunk/editor/inspectorPanel` is
// untouched.
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Editor, TLEventInfo, TLShape, TLShapeId } from "tldraw";

import type { BlockShape } from "../shapes/block/BlockShapeUtil";
import { cornerBlockOf } from "../shapes/region/cornerBlock";
import type { RegionShape } from "../shapes/region/RegionShapeUtil";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "../shapes/types";

import type { ChromePanel } from "./statusStrip";

/**
 * The block the Inspector edits when `shape` is the one selected shape, or
 * `null` when the Inspector has nothing to say about it.
 *
 * - An `ss-block`, any view, is its own subject.
 * - An `ss-region` with a corner card is inspected THROUGH that card, and every
 *   Inspector write lands on the card. WHY: the card is the region's interface
 *   — "everything is really a block" (`shapes/region/cornerBlock.ts`'s header)
 *   — and the region itself carries no name/glyph/description the panel could
 *   edit. A click on the card selecting the REGION is the normal case, so the
 *   region has to resolve to the same subject the card would.
 * - A plain region (no card), a wire, an `ss-code` cell (code + language, no
 *   name/glyph/description) and every stock tldraw shape resolve to `null`.
 */
export function inspectorSubjectOf(editor: Editor, shape: TLShape | null | undefined): BlockShape | null {
  if (!shape) return null;
  if (shape.type === BLOCK_SHAPE_TYPE) return shape as BlockShape;
  if (shape.type === REGION_SHAPE_TYPE) {
    const card = cornerBlockOf(editor, shape as unknown as RegionShape);
    return card && card.type === BLOCK_SHAPE_TYPE ? (card as BlockShape) : null;
  }
  return null;
}

function sameIds(a: readonly TLShapeId[], b: readonly TLShapeId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** A press or a release, or a click tldraw's click manager derived from them —
 *  never a `pointer_move` (a marquee grows its selection on moves). */
function isClickEvent(info: TLEventInfo): boolean {
  if (info.type === "click") return true;
  return info.type === "pointer" && (info.name === "pointer_down" || info.name === "pointer_up");
}

/**
 * Keep the rail following the canvas selection. `open` / `setOpen` are
 * `./overlay.tsx`'s rail state; the returned ref is the rail's PROVENANCE —
 * `true` while the Inspector is showing because a click opened it. The overlay
 * sets it back to `false` on every user-driven rail change (a launcher, the
 * surface switch, the close button, Escape), which is what makes a panel the
 * user opened themselves stay open on its empty state when they deselect.
 *
 * Opening:
 *   - only from a POINTER press/release in the select tool, and only when the
 *     result is one inspectable shape. WHY pointer-gated rather than on every
 *     selection change: the ask is "when we click on objects". Creating a block
 *     with the dock tool, a Frames row focusing a region, a quick-switcher jump
 *     and every programmatic `editor.select` also change the selection, and
 *     none of them is a click on the object. A marquee is excluded too — it
 *     grows its selection on `pointer_move`, so a drag across several blocks
 *     never passes through "one block, opened".
 *   - only when the rail is CLOSED. WHY never switch a rail that is already
 *     showing Frames or Problems: both of them select shapes themselves
 *     (Frames' focus, Problems' reveal), and even a plain canvas click while
 *     one is open is the user using that panel against the board — yanking it
 *     over to the Inspector would take the panel out from under the very
 *     click that caused the selection. Already on the Inspector, there is
 *     nothing to do: `InspectorSurface` reads the selection live, so a click
 *     on another block RETARGETS it without a close/reopen.
 *
 * Closing: when the selection becomes EMPTY (click empty canvas, Escape, the
 * subject deleted) and the Inspector was opened by a click. A selection that
 * becomes something non-inspectable (a wire, several blocks) leaves it open on
 * its empty state — the panel follows deselection, not every selection.
 *
 * None of this is document state: `open` is React state, so opening or closing
 * the rail never lands on tldraw's undo stack.
 */
export function useInspectorFollowsSelection(
  editor: Editor,
  open: ChromePanel | null,
  setOpen: (panel: ChromePanel | null) => void,
): MutableRefObject<boolean> {
  const openedBySelection = useRef(false);
  // Read from inside store callbacks that outlive any one render.
  const rail = useRef({ open, setOpen });
  rail.current = { open, setOpen };

  useEffect(() => {
    // The pointer event tldraw is dispatching right now, if any. Store
    // after-change handlers run at the end of the atomic operation the event
    // is handled in (`@tldraw/store` `flushAtomicCallbacks`), still inside the
    // same synchronous dispatch, so a microtask is enough to tell "this change
    // came from that click" from a later programmatic write.
    //
    // WHY not `editor.inputs.isPointing`: tldraw clears it BEFORE handing
    // `pointer_up` to the state chart (Editor.ts's `pointer_up` case), and a
    // click that selects on release — a member of a multi-selection, a
    // host-side reselection like a corner card resolving to its region — would
    // read as "not a click".
    let clicking: TLEventInfo | null = null;
    const onBeforeEvent = (info: TLEventInfo) => {
      if (!isClickEvent(info)) return;
      clicking = info;
      queueMicrotask(() => {
        if (clicking === info) clicking = null;
      });
    };
    editor.on("before-event", onBeforeEvent);

    const stop = editor.sideEffects.registerAfterChangeHandler("instance_page_state", (prev, next) => {
      if (sameIds(prev.selectedShapeIds, next.selectedShapeIds)) return;
      const { open: current, setOpen: set } = rail.current;

      if (next.selectedShapeIds.length === 0) {
        if (current === "inspector" && openedBySelection.current) {
          openedBySelection.current = false;
          set(null);
        }
        return;
      }

      if (current !== null) return;
      if (!clicking) return;
      if (editor.getCurrentToolId() !== "select") return;
      if (editor.isInAny("select.brushing", "select.scribble_brushing")) return;
      if (next.selectedShapeIds.length !== 1) return;
      if (!inspectorSubjectOf(editor, editor.getShape(next.selectedShapeIds[0]))) return;

      openedBySelection.current = true;
      set("inspector");
    });

    return () => {
      editor.off("before-event", onBeforeEvent);
      stop();
    };
  }, [editor]);

  return openedBySelection;
}
