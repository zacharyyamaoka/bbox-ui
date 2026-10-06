// src/chrome/TitleBar/chromeBar.tsx — the top-left cluster's HOST half: what
// this app hands the shell's chrome bar window (`@trunk/shell/shellChromeBar`),
// plus the Settings surface and the file navigator the bar raises.
//
// Since B-SHELL-P1 the bar itself — `ChromeBar`, the burger's assembly
// (`buildAppMenu`), the inert depth arrows and badge, the board name from the
// port's `documentName()` and Home over `view({ kind: "fit" })` — lives in the
// engine-free shell, lifted from this file at 75991ce, so the next host mounts
// the same bar. What stays here is what speaks this app's vocabulary: the file
// session (`src/files/session.tsx`), Settings, Compare, the site and legacy
// rows, tldraw's own Edit/View/Export/Preferences rows, its toasts.
//
// This file is still the "Chrome bar" row of docs/menus/MENU-KIT-DESIGN.md
// §4's host contract — and the line the contract is most explicit about,
// "confirm dialogs and toasts are host's", says the host DECIDES them, not
// that the host draws them: the toast is tldraw's own `useToasts`, and the
// confirmation is the trunk's `useConfirm` (`@trunk/editor/confirmDialog`).
// `src/files/session.tsx` takes both as callbacks instead of reaching for the
// hooks itself.
//
// WHY the confirmation is not built here: Zach, 2026-09-19 — "all of the
// feedback regarding the chrome should be made in bbox-ui editor-components,
// not in system sketch, system sketch should just be kinda like importing
// these stock menus and doing a light bit of configuration". The lift is that
// sentence applied to the bar itself.
//
// WHY there is no undo/redo pill: Zach, 2026-09-19 — "Undo redo should be
// hidden … We don't need to show that". Undo and Redo are Edit ▸ rows running
// tldraw's own actions (`../FileMenu/stockMenus.ts`), and Ctrl+Z / Ctrl+⇧+Z
// are untouched — the engine still owns them.
import { useCallback, useMemo, useState } from "react";
import { useEditor, useToasts } from "tldraw";

import type { MenuGroupSpec } from "@trunk/editor/appMenu";
import { useConfirm } from "@trunk/editor/confirmDialog";
import { FileNavigator } from "@trunk/editor/fileNavigator";
import { ShellChromeBar, useBoardName } from "@trunk/shell/shellChromeBar";

import { documentLocation } from "../../files/launchConfig";
import { useDocumentSession, type DocumentSessionHelpers } from "../../files/session";
import { useCompareView } from "../CompareView";
import { SystemSketchSettings, useAppSettings } from "../ShareMenu";
import { legacyAppActionsFor } from "../legacyApp";
import { useSiteActionsWithStatus } from "../sites";
import { shortcutPlatform, useStockMenus } from "../FileMenu";

/**
 * WHY the board name is the engine's own document field and not state here:
 * the plan's document model mints no board-level field, but tldraw already
 * ships one — `TLDocument.name`, read with `getDocumentSettings()` and written
 * with `updateDocumentSettings()`, which the port's `documentName()` /
 * `setDocumentName()` speak. Using it mints nothing, rides along inside a saved
 * `.tldr`, and is the ONE place two writers can agree on:
 * `src/backend/OpenPython.tsx` names the board after the Python file it just
 * opened, and the bar reads that name immediately.
 *
 * WHY a FILE-BACKED board shows the file's name instead (`session.title`):
 * once a board is a file, its name is the file's name — renaming the title
 * renames the file on disk, and a title that disagreed with the path would
 * make Copy Absolute Path read as a different document.
 */
export function SystemSketchChromeBar() {
  const editor = useEditor();
  const { addToast } = useToasts();
  // The trunk's confirmation surface, configured: a test-id prefix, and that
  // is the whole of this app's say in how it looks or behaves.
  const { confirm, dialog: confirmDialog } = useConfirm({ testIdPrefix: "ss-confirm" });
  const { settings, update } = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The port's `documentName()` with the shell's "Untitled board" fallback —
  // the same name the bar shows when the board is not a file.
  const boardName = useBoardName();

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
  // between them. WHY these open a new window while the legacy row navigates
  // this one: the archived app is the same artifact one version back, so
  // Alt+← brings you home; the docs site and Storybook are different things.
  // Live: each row's label carries what it actually opens right now — see
  // ../siteStatus.ts's header.
  const siteRows = useSiteActionsWithStatus(window.location.hostname);
  const siteGroups = useMemo<MenuGroupSpec[]>(
    () => (siteRows.length > 0 ? [{ id: "sites", items: siteRows }] : []),
    [siteRows],
  );

  // Compare BEFORE the legacy group, which stays last by its own rule above
  // ("so it reads as a way OUT rather than as another file command").
  const extra = useMemo(() => [compare.group, ...siteGroups, ...legacyGroups], [compare.group, siteGroups, legacyGroups]);
  const platform = useMemo(() => shortcutPlatform(), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  return (
    <ShellChromeBar
      testIdPrefix="ss-chrome"
      label="bbox studio"
      platform={platform}
      file={session.file}
      onSettings={openSettings}
      edit={stock.edit}
      view={stock.view}
      export={stock.export}
      preferences={stock.preferences}
      onKeyboardShortcuts={stock.openKeyboardShortcuts}
      extra={extra}
      identity={{
        title: session.title ?? boardName,
        statusTone: session.statusTone,
        statusLabel: session.statusLabel,
        path: session.path ?? undefined,
      }}
      rename={session.rename}
      fileActions={session.titleActions}
    >
      {session.navigatorProps ? <FileNavigator {...session.navigatorProps} /> : null}
      <SystemSketchSettings open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} update={update} />
      {compare.dialog}
      {confirmDialog}
    </ShellChromeBar>
  );
}
