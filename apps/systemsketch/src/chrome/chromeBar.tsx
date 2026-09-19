// src/chrome/chromeBar.tsx — the top-left cluster: the trunk's `ChromeBar`
// (burger · history arrows · board name · depth badge) and, beside it, this
// app's OWN undo/redo pair.
//
// This file is the "Chrome bar" row of docs/menus/MENU-KIT-DESIGN.md §4's
// host contract: crumbs/depth/canGoBack/canGoForward as plain data, the
// callbacks, the identity, and — the line the contract is most explicit
// about — "confirm dialogs and toasts are host's". Those two come from
// tldraw's own `useDialogs`/`useToasts`, which is why `./fileActions.ts` takes
// them as callbacks instead of reaching for the hooks itself.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import {
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  useDialogs,
  useEditor,
  useToasts,
  useValue,
} from "tldraw";

import { ChromeBar } from "@trunk/components/chromeBar";
import { Toolbar, ToolbarButton } from "@trunk/components/toolbar";

import { fileActionsFor, type FileActionHelpers } from "./fileActions";

/**
 * The board's name, until the document model has a field for it.
 *
 * WHY session-local state and not a persisted prop: the plan's document-model
 * contract (§3) is frozen and has no board-level record at all — the `.tldr`
 * carries shapes, bindings and pages, nothing that names the board. Minting a
 * persisted field from a menu lane is precisely what the contract exists to
 * prevent. So the name is real (it renames, it is what a `.tldr` downloads
 * as) and it is honestly temporary, which is also what the status dot below
 * says out loud.
 */
const DEFAULT_BOARD_NAME = "Untitled board";

/**
 * Where tldraw's own local store registers every IndexedDB document it has
 * created, and the prefix those documents' names carry
 * (@tldraw/editor `utils/sync/LocalIndexedDb.mjs:3-5`, written by
 * `addDbName` at :246-248, read by `getAllIndexDbNames` at :238).
 *
 * WHY this is how "is this board persisted?" gets answered: `persistenceKey`
 * is a prop of `<Tldraw>` and reaches nothing the editor exposes — there is
 * no `editor.persistenceKey`, no field on `editor.store`, and `src/App.tsx`
 * is off-limits to this lane beyond its `COMPONENTS` object, so it cannot
 * thread the answer down either. This index is a real, documented artefact of
 * the engine's own persistence, readable synchronously, and it says exactly
 * what the status dot claims: a tldraw document has been written to this
 * browser. A test mounts with `persistenceKey={null}`, never opens a
 * document db, and therefore correctly reads "Not persisted".
 */
const TLDRAW_DB_NAME_INDEX_KEY = "TLDRAW_DB_NAME_INDEX_v2";
const TLDRAW_DOCUMENT_DB_PREFIX = "TLDRAW_DOCUMENT_v2";

function readsAsPersisted(): boolean {
  try {
    const raw = window.localStorage.getItem(TLDRAW_DB_NAME_INDEX_KEY);
    if (!raw) return false;
    const names: unknown = JSON.parse(raw);
    return Array.isArray(names) && names.some((name) => typeof name === "string" && name.startsWith(TLDRAW_DOCUMENT_DB_PREFIX));
  } catch {
    // Same posture as `./preferences.ts`: a private window or blocked storage
    // costs the person a status dot, never the chrome.
    return false;
  }
}

export function SystemSketchChromeBar() {
  const editor = useEditor();
  const { addToast } = useToasts();
  const { addDialog } = useDialogs();

  const [name, setName] = useState(DEFAULT_BOARD_NAME);
  const [renaming, setRenaming] = useState(false);
  const [persisted, setPersisted] = useState(false);

  // Read AFTER mount: tldraw registers the db name while the store is being
  // opened, which is the same commit this component first renders in.
  useEffect(() => setPersisted(readsAsPersisted()), []);

  const canUndo = useValue("ss can undo", () => editor.getCanUndo(), [editor]);
  const canRedo = useValue("ss can redo", () => editor.getCanRedo(), [editor]);

  /** tldraw's own dialog, promised. The `answered` latch is what keeps a
   *  dismissal (backdrop, Escape, the × ) from resolving twice. */
  const confirm = useCallback<FileActionHelpers["confirm"]>(
    (prompt) =>
      new Promise<boolean>((resolve) => {
        let answered = false;
        addDialog({
          component: ({ onClose }) => (
            <>
              <TldrawUiDialogHeader>
                <TldrawUiDialogTitle>{prompt.title}</TldrawUiDialogTitle>
                <TldrawUiDialogCloseButton />
              </TldrawUiDialogHeader>
              <TldrawUiDialogBody>{prompt.body}</TldrawUiDialogBody>
              <TldrawUiDialogFooter className="tlui-dialog__footer__actions">
                <TldrawUiButton type="normal" onClick={onClose}>
                  <TldrawUiButtonLabel>Cancel</TldrawUiButtonLabel>
                </TldrawUiButton>
                <TldrawUiButton
                  type="primary"
                  onClick={() => {
                    answered = true;
                    resolve(true);
                    onClose();
                  }}
                >
                  <TldrawUiButtonLabel>{prompt.confirmLabel}</TldrawUiButtonLabel>
                </TldrawUiButton>
              </TldrawUiDialogFooter>
            </>
          ),
          onClose: () => {
            if (!answered) resolve(false);
          },
        });
      }),
    [addDialog],
  );

  const helpers = useMemo<FileActionHelpers>(() => ({ addToast, confirm, boardName: name }), [addToast, confirm, name]);
  const fileActions = useMemo(() => fileActionsFor(editor, helpers), [editor, helpers]);

  return (
    // `pointer-events: auto` because `.ss-chrome` is `none` — see the WHY on
    // that class in ./overlay.tsx.
    <div className="pointer-events-auto flex items-center gap-2">
      <ChromeBar
        testIdPrefix="ss-chrome"
        menu={{ id: "main", label: "SystemSketch", groups: [{ id: "file", items: fileActions }] }}
        // WHY both arrows are hard-`false` rather than wired to something:
        // this bar's `history` is DEPTH navigation — "back to the level you
        // came from" — and this app has no depth model yet (no focused
        // region, no drill-in; L5's regions are frames you pan to, not
        // levels you enter). Wiring them to the camera would make Back mean
        // something different here than in the surface they were ported
        // from, and wiring them to undo/redo would make two controls that
        // look like navigation do document surgery. Honestly disabled until
        // there is a level to go back to.
        history={{ canGoBack: false, canGoForward: false, onBack: () => {}, onForward: () => {} }}
        identity={{
          title: name,
          statusTone: persisted ? "ok" : "pending",
          statusLabel: persisted ? "Saved locally" : "Not persisted",
        }}
        rename={{
          active: renaming,
          onBegin: () => setRenaming(true),
          onCommit: (next) => {
            const trimmed = next.trim();
            // Truthful rendering: whatever was typed, verbatim. An empty
            // commit is the one thing refused, and it is refused by keeping
            // the old name rather than by writing "".
            if (trimmed.length > 0) setName(trimmed);
            setRenaming(false);
          },
          onCancel: () => setRenaming(false),
        }}
        crumbs={[]}
        depth={0}
        onReturnToRoot={() => editor.zoomToFit()}
        onJumpToLevel={() => {}}
        fileActions={fileActions}
      />
      {/*
        WHY undo/redo are the APP's own buttons rather than the bar's history
        arrows: the kit's `history` is depth navigation (see its WHY above),
        and re-labelling Back/Forward as Undo/Redo would be two lies at once
        — the arrows would stop meaning what they mean everywhere else, and
        document history would be hiding behind a navigation affordance.
        Chrome's own arrows do not undo your typing either.

        WHY `focusableWhenDisabled={false}`: Base UI's `Toolbar.Button`
        defaults it to TRUE (toolbar/button/ToolbarButton.js:27), and
        `useFocusableWhenDisabled` then sets `aria-disabled` and deliberately
        NOT the native `disabled` attribute (utils/useFocusableWhenDisabled.js
        — `isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)`
        is the only branch that writes it). A disabled-looking button that is
        still natively enabled would still fire `editor.undo()` on click.
        Passing `false` takes the non-focusable-composite branch, which is
        the one that writes the real attribute.
      */}
      <Toolbar
        aria-label="Document history"
        className="w-fit rounded-full border border-border bg-card px-1.5 py-1 text-card-foreground"
      >
        <ToolbarButton
          data-testid="ss-chrome-undo"
          aria-label="Undo"
          title="Undo"
          focusableWhenDisabled={false}
          disabled={!canUndo}
          onClick={() => editor.undo()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          data-testid="ss-chrome-redo"
          aria-label="Redo"
          title="Redo"
          focusableWhenDisabled={false}
          disabled={!canRedo}
          onClick={() => editor.redo()}
        >
          <Redo2 />
        </ToolbarButton>
      </Toolbar>
    </div>
  );
}
