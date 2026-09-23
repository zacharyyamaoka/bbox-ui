// src/chrome/ShareMenu/duplicateAtPointer.ts — the OTHER half of the
// "Copy/paste under cursor" switch, the half tldraw has no preference for.
//
// The Settings row promises both: "On: paste and duplicate land at the
// pointer. Off: they land at the viewport centre."
// (`@trunk/editor/settingsCategories.tsx`, `paste-under-cursor`.) That wording
// is the DONOR's, character for character —
// /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:893 — and the
// donor never delivered the duplicate half either: it applied
// `isPasteAtCursorMode` alone (`canvasGestures.ts:145`), and that preference is
// read by tldraw's paste path only. Measured 2026-09-22 against tldraw 5.3.2:
// the `duplicate` action (`ui/context/actions.tsx:507-551`) never calls
// `getIsPasteAtCursorMode()` — it offsets the copy BESIDE the original,
// `{ x: commonBounds.width + adjacentShapeMargin, y: 0 }` (actions.tsx:533-536).
// So "and duplicate" has been a false promise in both apps since the row was
// written, and setting the tldraw preference does not fix it.
//
// WHY an `overrides.actions` wrapper rather than a keydown listener on Ctrl+D:
// `overrides.actions` is tldraw's own documented seam for redefining a stock
// action, it is already how this app adds the 1/2/3/4 view hotkeys
// (`../ContextualPopupMenu/viewHotkeys.tsx`'s `withViewHotkeys`, wired in
// `App.tsx`'s `OVERRIDES`), and going through it means the MENU item, the
// keyboard shortcut and the shortcuts dialog all move together. A private
// listener would change the key and leave Edit ▸ Duplicate doing the old
// thing — two behaviours for one command, which is worse than the bug.
//
// WHY the OFF path delegates instead of reimplementing the offset: tldraw's
// stock `onSelect` carries `duplicateProps` (the drag-duplicate chain that
// keeps a repeated Ctrl+D marching in the same direction) and the
// camera-locked special case. Re-typing either would be a fork of a stock
// action that has to stay in step with the engine; delegating keeps OFF
// byte-identical to stock tldraw forever.
import type { Editor, TLUiActionsContextType } from "tldraw";

import { getGestureSettings } from "./cameraGestureHost";

/**
 * Wrap tldraw's stock `duplicate` action so that, while
 * `gestures.pasteUnderCursor` is ON, the copy lands centred on the pointer.
 *
 * WHY the SELECTION's centre is what gets placed at the pointer, rather than
 * the copy's top-left corner: that is what tldraw's own paste does with the
 * same preference on — `defaultHandleExternalTextContent(editor, { point })`
 * treats `point` as the centre of what it creates. The two halves of one
 * switch should not disagree about what "at the pointer" means.
 *
 * Every bail-out below falls through to the stock action rather than doing
 * nothing, so a duplicate never silently fails because the pointer or the
 * selection bounds were unavailable.
 */
export function withDuplicateAtPointer(editor: Editor, actions: TLUiActionsContextType): TLUiActionsContextType {
  const stock = actions["duplicate"];
  if (!stock) return actions;

  return {
    ...actions,
    duplicate: {
      ...stock,
      onSelect: (source) => {
        if (!getGestureSettings().pasteUnderCursor) return stock.onSelect(source);

        const ids = editor.getSelectedShapeIds();
        if (ids.length === 0) return stock.onSelect(source);

        const bounds = editor.getSelectionPageBounds();
        if (!bounds) return stock.onSelect(source);

        const pointer = editor.inputs.getCurrentPagePoint();
        editor.markHistoryStoppingPoint("duplicate shapes");
        editor.duplicateShapes(ids, {
          x: pointer.x - bounds.center.x,
          y: pointer.y - bounds.center.y,
        });
      },
    },
  };
}
