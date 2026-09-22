// src/chrome/TitleBar/chromeBar.tsx — the top-left cluster: the trunk's `ChromeBar`
// (burger · depth arrows · board name · depth badge), the Settings surface and
// the file navigator it raises.
//
// This file is the "Chrome bar" row of docs/menus/MENU-KIT-DESIGN.md §4's
// host contract: crumbs/depth/canGoBack/canGoForward as plain data, the
// callbacks, the identity, and — the line the contract is most explicit
// about — "confirm dialogs and toasts are host's". That line says the host
// DECIDES them, not that the host draws them: the toast is tldraw's own
// `useToasts`, and the confirmation is the trunk's `useConfirm`
// (`@trunk/components/confirmDialog`). `src/files/session.tsx` takes both as
// callbacks instead of reaching for the hooks itself.
//
// WHY the confirmation is not built here any more: Zach, 2026-09-19 — "all of
// the feedback regarding the chrome should be made in bbox-ui
// editor-components, not in system sketch, system sketch should just be kinda
// like importing these stock menus and doing a light bit of configuration".
// This file used to author that dialog's header, body, footer, both buttons
// and its dismissal latch inline; a modal that lives inside one app is a modal
// the next host (the VS Code extension, the Obsidian plugin) inherits nothing
// from, and `ARCHITECTURE.md:44-81` measured a vendored copy diverging inside
// a day. All that is left here is the message and the two callbacks.
//
// WHY there is no undo/redo pill here any more: Zach, 2026-09-19 — "Undo redo
// should be hidden … We don't need to show that". Undo and Redo are Edit ▸
// rows running tldraw's own actions (`./stockMenus.ts`), and Ctrl+Z /
// Ctrl+⇧+Z are untouched — the engine still owns them. The pill's old
// justification (depth arrows must not be re-labelled as document history)
// still holds, and is why the arrows below remain honestly disabled rather
// than quietly becoming undo/redo now that the pill is gone.
import { useMemo, useState } from "react";
import { useEditor, useToasts, useValue } from "tldraw";

import { buildAppMenu, type MenuGroupSpec } from "@trunk/editor/appMenu";
import { ChromeBar } from "@trunk/editor/chromeBar";
import { useConfirm } from "@trunk/editor/confirmDialog";
import { FileNavigator } from "@trunk/editor/fileNavigator";

import { documentLocation } from "../../files/launchConfig";
import { useDocumentSession, type DocumentSessionHelpers } from "../../files/session";
import { useCompareView } from "../CompareView";
import { SystemSketchSettings, useAppSettings } from "../ShareMenu";
import { legacyAppActionsFor } from "../legacyApp";
import { siteActionsFor } from "../sites";
import { shortcutPlatform, useStockMenus } from "../FileMenu";

/**
 * What an unnamed, file-less board is called.
 *
 * WHY the name is NOT state in this component: the plan's document model mints
 * no board-level field, but tldraw already ships one — `TLDocument.name`, a
 * plain `T.string` on the singleton `document:document` record (@tldraw/tlschema
 * `records/TLDocument.js`), read with `editor.getDocumentSettings()` and
 * written with `editor.updateDocumentSettings()`. Using the engine's own record
 * mints nothing, rides along inside a saved `.tldr`, and is the ONE place two
 * writers can agree on: `src/backend/OpenPython.tsx` names the board after the
 * Python file it just opened, and this bar reads that name immediately.
 *
 * WHY a FILE-BACKED board ignores it and shows the file's name instead
 * (`session.title`): once a board is a file, its name is the file's name —
 * renaming the title renames the file on disk, and a title that disagreed
 * with the path would make Copy Absolute Path read as a different document.
 */
const DEFAULT_BOARD_NAME = "Untitled board";

export function SystemSketchChromeBar() {
  const editor = useEditor();
  const { addToast } = useToasts();
  // The trunk's confirmation surface, configured: a test-id prefix, and that
  // is the whole of this app's say in how it looks or behaves.
  const { confirm, dialog: confirmDialog } = useConfirm({ testIdPrefix: "ss-confirm" });
  const { settings, update } = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const boardName = useValue("ss board name", () => editor.getDocumentSettings().name || DEFAULT_BOARD_NAME, [editor]);

  const helpers = useMemo<DocumentSessionHelpers>(() => ({ addToast, confirm }), [addToast, confirm]);
  const session = useDocumentSession({ editor, mode: settings.fileNavigation, helpers, boardName });
  const stock = useStockMenus();
  // Ruling 10 — the Compare view, reachable. Two rows and a modal; every
  // decision behind them is in ../CompareView/compareView.tsx.
  const compare = useCompareView(editor);

  // The door back to the archived app: its own group, last, so it reads as a
  // way OUT rather than as another file command. It navigates through the
  // same `DocumentLocation` seam every other navigation uses — a smoke test
  // must never be able to load :4321, which rewrites Zach's real boards on
  // open.
  const legacyGroups = useMemo<MenuGroupSpec[]>(() => {
    const rows = legacyAppActionsFor(window.location.hostname, (url) => documentLocation().assign(url));
    return rows.length > 0 ? [{ id: "legacy", items: rows }] : [];
  }, []);

  // The OTHER doors out — bbox-ui.com and Storybook (`../sites.ts`). Its own
  // group, because leaving for a different artifact and stepping this window
  // back a version are different kinds of move and the dropdown should rule
  // between them.
  //
  // WHY these open a new window while the legacy row navigates this one: the
  // archived app is the same artifact one version back, so Alt+← brings you
  // home. The docs site and Storybook are different things, and navigating
  // away would put a board with unsaved work behind a Back button. That
  // asymmetry is `sites.ts`'s own reasoning, kept by using its default opener.
  const siteGroups = useMemo<MenuGroupSpec[]>(() => {
    const rows = siteActionsFor(window.location.hostname);
    return rows.length > 0 ? [{ id: "sites", items: rows }] : [];
  }, []);

  const menu = useMemo(
    () =>
      buildAppMenu({
        label: "SystemSketch",
        platform: shortcutPlatform(),
        file: session.file,
        onSettings: () => setSettingsOpen(true),
        edit: stock.edit,
        view: stock.view,
        export: stock.export,
        preferences: stock.preferences,
        onKeyboardShortcuts: stock.openKeyboardShortcuts,
        // Compare BEFORE the legacy group, which stays last by its own rule
        // below ("so it reads as a way OUT rather than as another file
        // command").
        extra: [compare.group, ...siteGroups, ...legacyGroups],
      }),
    [compare.group, siteGroups, legacyGroups, session.file, stock],
  );

  return (
    // `pointer-events: auto` because `.ss-chrome` is `none` — see the WHY on
    // that class in ./overlay.tsx.
    <div className="pointer-events-auto flex items-center gap-2">
      <ChromeBar
        testIdPrefix="ss-chrome"
        menu={menu}
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
          title: session.title ?? boardName,
          statusTone: session.statusTone,
          statusLabel: session.statusLabel,
          path: session.path ?? undefined,
        }}
        rename={session.rename}
        crumbs={[]}
        depth={0}
        onReturnToRoot={() => editor.zoomToFit()}
        onJumpToLevel={() => {}}
        fileActions={session.titleActions}
      />
      {session.navigatorProps ? <FileNavigator {...session.navigatorProps} /> : null}
      <SystemSketchSettings open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} update={update} />
      {compare.dialog}
      {confirmDialog}
    </div>
  );
}
