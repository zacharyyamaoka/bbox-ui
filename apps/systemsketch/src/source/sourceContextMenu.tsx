// src/source/sourceContextMenu.tsx — the right-click surface for the source
// actions: tldraw's OWN context menu, plus one group that exists only when a
// pyblocks backend is connected.
//
// SHAPE COPIED VERBATIM from `@trunk/…/detach/rebuildContextMenu.tsx` (all
// 76 lines of it), which the lane brief names: `DefaultContextMenu` wrapping
// `DefaultContextMenuContent` plus a conditional `TldrawUiMenuGroup`. Two
// things that shape buys, and a hand-rolled menu would lose:
//
//   1. EVERY STOCK ITEM STAYS. Copy, paste, duplicate, arrange, select-all —
//      composing means they are tldraw's, still, and a tldraw upgrade brings
//      whatever it adds. Replacing the slot with our own list would be a
//      worse regression than a missing menu item.
//   2. `TLUiOverrides` has no context-menu hook in this pinned version (it
//      carries `actions`/`tools`/`translations` only). The menu is a
//      replaceable COMPONENT SLOT — `TLUiComponents.ContextMenu` — which is
//      a documented stock seam, so `src/document/stockBoundary.test.ts`
//      stays green.
//
// THE GATE IS `sourceActionsFor`'s, not this file's. It returns `[]` unless
// `backend.kind === "pyblocks"`, and an empty list renders NOTHING — the
// group is ABSENT, never a greyed-out row. `sourceActions.ts` states the
// reason and this file must not second-guess it: "a greyed-out 'Convert to
// code' teaches a reader that the gesture exists and then refuses to say
// why it will not run".
//
// WHERE THIS IS MOUNTED, AND WHY THAT LINE IS NOT IN THIS DIRECTORY:
// nothing in this file reaches a user until `src/App.tsx` names it —
// `components={{ ..., ContextMenu: SourceContextMenu }}`. In tldraw 5.3.2
// that prop is the ONLY context-menu seam: `TLUiOverrides` carries
// `actions`/`tools`/`translations` and no menu hook, `components` is a React
// prop so no `onMount` install can add one later, and this app's own
// `ShapeKit` (src/shapes/registry.ts) aggregates
// shapeUtils/bindingUtils/tools/familyItems/toolUi/install/Overlay — there is
// no `components` field to extend, and inventing one would edit MORE of
// another lane's file than the single entry does.
//
// That entry is outside this lane's declared write set, so it is granted or
// dropped as a unit and this comment is the record. Measured 2026-09-19 in
// this worktree with the entry removed and nothing else changed: `pnpm
// typecheck` still exits 0 (this module simply goes unreferenced) while
// `vitest --project=smoke src/source/source.smoke.test.tsx` goes 2 failed |
// 3 passed — "Convert to code" never appears, both failures timing out in
// `waitFor`. That is the cost of dropping it: the badge survives, the
// right-click surface does not, and the lane's committed acceptance cannot
// pass. Anyone re-homing this component keeps that entry or moves it to a
// real kit seam; deleting it silently turns a shipped gesture into dead code.
import { useCallback } from "react";
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  createShapeId,
  useDialogs,
  useEditor,
  useToasts,
  useValue,
  type Editor,
  type TLShapeId,
} from "tldraw";

import { sourceActionsFor } from "@trunk/editor/sourceActions";

import { applyScene } from "../document/applySceneDiff";
import { sceneFromRecords } from "../document/sceneFromStore";
import { CODE_SHAPE_TYPE } from "../shapes/types";
import { planConvertToCode, planExpandCode } from "./codeCellActions";
import { useSourceBackend } from "./backendSwitch";

/** The group's id. `TldrawUiMenuGroup` publishes it as
 *  `data-testid="context-menu-group.bbox-source"`, which is what the smoke
 *  asserts the ABSENCE of with no backend. */
export const SOURCE_MENU_GROUP_ID = "bbox-source";

/** The app's scene, read fresh from the store. Deliberately NOT
 *  `useDocumentScene`: a handler runs at click time, and the scene it must
 *  act on is the one that exists then — a value captured at render time is
 *  the selection-moved-under-the-menu bug one level up. */
function sceneNow(editor: Editor) {
  return sceneFromRecords(editor.store.allRecords());
}

/**
 * The confirm the brief asks for, as a stock tldraw dialog.
 *
 * WHY a dialog and not `window.confirm`: a native modal blocks the whole
 * page including tldraw's own timers, cannot be styled to the board, and is
 * unreachable from a driven test. `useDialogs` is the seam tldraw keeps for
 * exactly this, rendered inside the editor's own container.
 *
 * WHY it only appears when `textWasEdited`: `expandCode` hands back both the
 * text and whether it was ever more than the generated header, precisely so
 * a host can ask only when there is something to lose. Confirming an
 * untouched header would train the person to dismiss the dialog without
 * reading it, which is the same as not having one.
 */
function confirmDiscard(
  dialogs: ReturnType<typeof useDialogs>,
  discardedText: string,
  onConfirm: () => void,
): void {
  dialogs.addDialog({
    component: ({ onClose }) => (
      <>
        <TldrawUiDialogHeader>
          <TldrawUiDialogTitle>Discard this cell's text?</TldrawUiDialogTitle>
          <TldrawUiDialogCloseButton />
        </TldrawUiDialogHeader>
        <TldrawUiDialogBody style={{ maxWidth: 380 }}>
          <p>The blocks come back exactly as they were. What you typed in the cell does not — expand discards it.</p>
          <pre
            data-testid="ss-source-discard-preview"
            style={{ maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap", opacity: 0.8 }}
          >
            {discardedText}
          </pre>
        </TldrawUiDialogBody>
        <TldrawUiDialogFooter className="tlui-dialog__footer__actions">
          <TldrawUiButton type="normal" data-testid="ss-source-discard-cancel" onClick={onClose}>
            <TldrawUiButtonLabel>Cancel</TldrawUiButtonLabel>
          </TldrawUiButton>
          <TldrawUiButton
            type="danger"
            data-testid="ss-source-discard-confirm"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            <TldrawUiButtonLabel>Expand and discard</TldrawUiButtonLabel>
          </TldrawUiButton>
        </TldrawUiDialogFooter>
      </>
    ),
  });
}

/**
 * Rendered only when the CURRENT SELECTION earns a row — read reactively
 * through `useValue`, so the group appears and disappears live rather than
 * being computed once when the menu mounted.
 */
function SourceMenuGroup() {
  const editor = useEditor();
  const dialogs = useDialogs();
  const { addToast } = useToasts();
  const backend = useSourceBackend();

  // The ONE reactive read. `isCodeCell` below then asks the store directly
  // at render time rather than through a second `useValue`: a selection
  // change is what re-renders this group, and deriving the whole scene
  // projection on every unrelated store write (a keystroke in any code
  // face) to answer "is this one an ss-code" would be the expensive way to
  // learn something `getShape().type` already says.
  const selectedIds = useValue("ss source selection", () => editor.getSelectedShapeIds().map(String), [editor]);

  const convertToCode = useCallback(
    (nodeIds: readonly string[]) => {
      const plan = planConvertToCode(sceneNow(editor), nodeIds, () => String(createShapeId()));
      if (!plan.ok) {
        addToast({ severity: "warning", title: "Cannot convert this selection", description: plan.reason });
        return;
      }
      // One undo step — `applyScene` runs the whole diff inside `editor.run`.
      editor.markHistoryStoppingPoint("convert to code");
      applyScene(editor, plan.scene);
      editor.setSelectedShapes([plan.cellId as TLShapeId]);
    },
    [addToast, editor],
  );

  const expandToBlocks = useCallback(
    (cellId: string) => {
      const plan = planExpandCode(sceneNow(editor), cellId);
      if (!plan.ok) {
        addToast({ severity: "warning", title: "Cannot expand that", description: plan.reason });
        return;
      }
      const run = () => {
        // Re-planned at the moment it RUNS, not at the moment it was asked:
        // the confirm below is asynchronous, and the board is live behind it.
        const fresh = planExpandCode(sceneNow(editor), cellId);
        if (!fresh.ok) {
          addToast({ severity: "warning", title: "Cannot expand that", description: fresh.reason });
          return;
        }
        editor.markHistoryStoppingPoint("expand code cell");
        editor.run(() => {
          // RELEASE THE MEMBERS FIRST, through tldraw's own seam, and only
          // then hand the scene to `applyScene`.
          //
          // WHY this is not `applyScene`'s job to get right on its own —
          // measured 2026-09-19, this test's own failure before the line
          // existed: `TypeError: Cannot read properties of undefined
          // (reading 'parentId')`, because both blocks were GONE after the
          // expand. `applySceneDiff.ts` deletes removed nodes BEFORE it
          // applies the `modified` rows that re-parent survivors out
          // ("Order is load-bearing… delete, then create nodes, then update
          // nodes"), and `editor.deleteShapes` cascades to a shape's
          // CHILDREN. So the cell took its members with it one pass before
          // the diff got round to moving them. The expand's whole promise is
          // that the blocks come back.
          //
          // owed upstream: `applySceneDiff.ts` could hoist survivors out of
          // a removed parent before its delete pass, which would fix this
          // for every caller. That file belongs to another lane; this is the
          // host-side release that makes the gesture correct today, and it
          // uses `reparentShapes` — the stock seam that also mints the new
          // sibling index — rather than reaching around it.
          const cell = editor.getShape(cellId as TLShapeId);
          const children = editor.getSortedChildIdsForParent(cellId as TLShapeId);
          if (cell && children.length > 0) editor.reparentShapes([...children], cell.parentId);
          applyScene(editor, fresh.scene);
        });
      };
      if (plan.textWasEdited && plan.discardedText !== null) confirmDiscard(dialogs, plan.discardedText, run);
      else run();
    },
    [addToast, dialogs, editor],
  );

  const actions = sourceActionsFor(
    backend,
    { nodeIds: selectedIds, isCodeCell: (nodeId) => editor.getShape(nodeId as TLShapeId)?.type === CODE_SHAPE_TYPE },
    { convertToCode, expandToBlocks },
  );
  if (actions.length === 0) return null;

  return (
    <TldrawUiMenuGroup id={SOURCE_MENU_GROUP_ID}>
      {actions.map((action) => (
        <TldrawUiMenuItem key={action.id} id={action.id} label={action.label} onSelect={() => action.run()} />
      ))}
    </TldrawUiMenuGroup>
  );
}

/** The `components.ContextMenu` this app mounts. Stock menu, one extra
 *  group. */
export function SourceContextMenu() {
  return (
    <DefaultContextMenu>
      <DefaultContextMenuContent />
      <SourceMenuGroup />
    </DefaultContextMenu>
  );
}
