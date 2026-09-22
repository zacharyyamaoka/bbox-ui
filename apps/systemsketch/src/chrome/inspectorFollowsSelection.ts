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

/**
 * The select tool's two "pressed, not yet moved" states. A pointer_up that
 * arrives in one of these is a completed CLICK; one that arrives in
 * `select.translating`, `select.brushing`, a resize, a rotate — or in any
 * other tool entirely (a dock tool placing a block) — is not.
 * Ids: tldraw 5.3.2 `SelectTool/childStates/PointingShape.ts` /
 * `PointingSelection.ts`, `static override id`.
 */
const CLICK_STATES = ["select.pointing_shape", "select.pointing_selection"] as const;

/**
 * Keep the rail following the canvas selection. `open` / `setOpen` are
 * `./overlay.tsx`'s rail state; the returned ref is the rail's PROVENANCE —
 * `true` while the Inspector is showing because a click opened it. The overlay
 * sets it back to `false` on every user-driven rail change (a launcher, the
 * surface switch, the close button, Escape), which is what makes a panel the
 * user opened themselves stay open on its empty state when they deselect.
 *
 * Opening:
 *   - only when a CLICK COMPLETES in the select tool, and only when the result
 *     is one inspectable shape. WHY on the completed click and not on the
 *     selection change: the ask is "when we click on objects". A press-drag on
 *     an unselected block selects it on `pointer_down`, before tldraw has
 *     decided it is a drag — opening then pops the rail open mid-drag, and a
 *     drag is a move, not a click. And clicking a block that is ALREADY
 *     selected (after closing the panel by hand) changes no selection at all,
 *     yet it is still a click on the object and must open it. Creating a block
 *     with a dock tool, a Frames row focusing a region, a quick-switcher jump
 *     and every programmatic `editor.select` are not clicks either. A marquee
 *     ends in `select.brushing`, never in a click state.
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
    // Ordering, from tldraw 5.3.2 `Editor._flushEventForTick`: `before-event`
    // is emitted BEFORE the state chart handles the event, and `event` AFTER.
    // So `before-event` for a pointer_up still sees the state the press left
    // the tool in (pointing = a click, translating = a drag), and `event` sees
    // the selection that click produced — including a host-side redirect made
    // on pointer_down, like a corner card resolving to its region
    // (`shapes/region/cornerBlock.ts`).
    let clickCompleting: TLEventInfo | null = null;
    const onBeforeEvent = (info: TLEventInfo) => {
      if (info.type !== "pointer" || info.name !== "pointer_up") return;
      clickCompleting = editor.isInAny(...CLICK_STATES) ? info : null;
    };
    const onEvent = (info: TLEventInfo) => {
      if (info !== clickCompleting) return;
      clickCompleting = null;
      const { open: current, setOpen: set } = rail.current;
      if (current !== null) return;
      if (!inspectorSubjectOf(editor, editor.getOnlySelectedShape())) return;
      openedBySelection.current = true;
      set("inspector");
    };
    editor.on("before-event", onBeforeEvent);
    editor.on("event", onEvent);

    // Closing still follows the SELECTION, whatever emptied it.
    const stop = editor.sideEffects.registerAfterChangeHandler("instance_page_state", (prev, next) => {
      if (sameIds(prev.selectedShapeIds, next.selectedShapeIds)) return;
      if (next.selectedShapeIds.length !== 0) return;
      const { open: current, setOpen: set } = rail.current;
      if (current === "inspector" && openedBySelection.current) {
        openedBySelection.current = false;
        set(null);
      }
    });

    return () => {
      editor.off("before-event", onBeforeEvent);
      editor.off("event", onEvent);
      stop();
    };
  }, [editor]);

  return openedBySelection;
}
