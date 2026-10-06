// src/shell/shellChromeBar.tsx — the shell's chrome bar window: the trunk's
// `ChromeBar` (burger · depth arrows · board name · depth badge) wired over
// `HostPort`.
//
// PROVENANCE: lifted from apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx
// at 75991ce (B-SHELL-P1, docs/lanes/finish-B-SHELL-P1.md §4.2 row 1). What
// moved is the part every host needs — the burger's assembly
// (`buildAppMenu`), the inert depth arrows and badge exactly as they were, the
// board name from `documentName()` with the "Untitled board" fallback, Home
// over `view({ kind: "fit" })`, and an Edit ▸ Undo/Redo and File ▸ Open…/Save
// for a host that brings none of its own. What stayed with the tldraw app is
// what speaks its vocabulary: the file session (title, rename, navigator,
// File rows), the Settings surface, the Compare group, the site and legacy
// rows, tldraw's own Edit/View/Export/Preferences rows and its toasts — all
// handed in below as host-supplied content.
//
// WHY the board name is the host's own document field: the app used
// `TLDocument.name` (tldraw's `getDocumentSettings().name`) because a field
// the engine already ships rides along inside a saved file and is the one
// place two writers can agree on. `documentName()` is that field, generalised.
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { buildAppMenu, type FileMenuCallbacks, type ShortcutPlatform } from "../editor/appMenu";
import { ChromeBar, type ChromeBarProps, type MenuAction, type MenuGroupSpec } from "../editor/chromeBar";

import { useAffordance, useHostPort, useHostValue } from "./BboxShell";
import { openDocumentFile, saveDocumentFile } from "./documentFiles";

/** What an unnamed, file-less board is called (chromeBar.tsx at 75991ce). */
export const DEFAULT_BOARD_NAME = "Untitled board";

/** The board name the bar shows: the host's own document name, or the
 *  fallback when it has none. Exported so a host that keeps a file session
 *  (the studio's `files/session.tsx`) names the board the same way. */
export function useBoardName(): string {
  return useHostValue((port) => port.documentName() || DEFAULT_BOARD_NAME, DEFAULT_BOARD_NAME);
}

export interface ShellChromeBarProps {
  /** The burger's accessible name ("bbox studio"). */
  label: string;
  platform: ShortcutPlatform;
  /** The host's File ▸ rows. Absent → the shell's own Open…/Save over
   *  `serialize()`/`load()`. Either way Open… and Save are hidden when the
   *  host does not declare `documentIo` (constraint 4). */
  file?: FileMenuCallbacks;
  onSettings?(): void;
  /** The host's Edit ▸ rows. Absent → the shell's own Undo/Redo over the
   *  port. Either way an `undo`/`redo` row is hidden without `history`. */
  edit?: readonly MenuGroupSpec[];
  view?: readonly MenuGroupSpec[];
  export?: readonly MenuGroupSpec[];
  preferences?: readonly MenuGroupSpec[];
  onKeyboardShortcuts?(): void;
  extra?: readonly MenuGroupSpec[];
  /** What a file-backed host shows instead of the document name — a FILE's
   *  name, its save state and its path. Each absent field falls back to the
   *  document's own. */
  identity?: Partial<ChromeBarProps["identity"]>;
  /** The host's rename lifecycle (a file rename). Absent → the shell renames
   *  the document through `setDocumentName()`. */
  rename?: ChromeBarProps["rename"];
  fileActions?: readonly MenuAction[];
  testIdPrefix?: string;
  /** Host-supplied surfaces raised from the bar: a file navigator, a
   *  settings dialog, a confirmation — rendered beside it, inside the same
   *  window. */
  children?: ReactNode;
}

/** Drop rows whose affordance this host does not earn — HIDDEN, never
 *  disabled (constraint 4). */
function withoutRows(groups: readonly MenuGroupSpec[], hidden: ReadonlySet<string>): MenuGroupSpec[] {
  if (hidden.size === 0) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => ("submenu" in item ? true : !hidden.has(item.id))),
    }))
    .filter((group) => group.items.length > 0);
}

export function ShellChromeBar({
  label,
  platform,
  file,
  onSettings,
  edit,
  view,
  export: exportGroups,
  preferences,
  onKeyboardShortcuts,
  extra,
  identity,
  rename,
  fileActions,
  testIdPrefix,
  children,
}: ShellChromeBarProps) {
  const port = useHostPort();
  const boardName = useBoardName();
  // Always on for a connected host (`ALWAYS_ON_AFFORDANCES`); a disconnected
  // shell earns nothing, so the bar hides with every other window.
  const showBar = useAffordance("chrome.boardName");
  const undoRedo = useAffordance("chrome.undoRedo");
  const canOpen = useAffordance("file.open");
  const canSave = useAffordance("file.save");
  const history = useHostValue((p) => p.history(), { canUndo: false, canRedo: false });

  // The shell's own rename, for a host with no file session: the board name
  // IS the document name, so committing writes it straight back.
  const [renaming, setRenaming] = useState(false);
  const commitRename = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (port && trimmed.length > 0) port.setDocumentName(trimmed);
      setRenaming(false);
    },
    [port],
  );
  const ownRename = useMemo<ChromeBarProps["rename"]>(
    () => ({ active: renaming, onBegin: () => setRenaming(true), onCommit: commitRename, onCancel: () => setRenaming(false) }),
    [renaming, commitRename],
  );

  const fileRows = useMemo<FileMenuCallbacks>(() => {
    const rows: FileMenuCallbacks = file
      ? { ...file }
      : port
        ? { open: () => openDocumentFile(port), save: () => void saveDocumentFile(port, boardName) }
        : {};
    if (!canOpen) {
      delete rows.open;
      delete rows.openRecent;
    }
    if (!canSave) {
      delete rows.save;
      delete rows.saveAs;
    }
    return rows;
  }, [file, port, boardName, canOpen, canSave]);

  const editGroups = useMemo<readonly MenuGroupSpec[]>(() => {
    if (edit) return undoRedo ? edit : withoutRows(edit, new Set(["undo", "redo"]));
    if (!port || !undoRedo) return [];
    // WHY Undo/Redo are Edit ▸ rows and never a pill: Zach, 2026-09-19 —
    // "Undo redo should be hidden … We don't need to show that" (the pill
    // was removed from the bar that day; chromeBar.tsx at 75991ce).
    return [
      {
        id: "edit-history",
        items: [
          { id: "undo", label: "Undo", disabled: !history.canUndo, run: () => port.undo() },
          { id: "redo", label: "Redo", disabled: !history.canRedo, run: () => port.redo() },
        ],
      },
    ];
  }, [edit, port, undoRedo, history]);

  const menu = useMemo(
    () =>
      buildAppMenu({
        label,
        platform,
        file: fileRows,
        onSettings,
        edit: editGroups,
        view,
        export: exportGroups,
        preferences,
        onKeyboardShortcuts,
        extra,
      }),
    [label, platform, fileRows, onSettings, editGroups, view, exportGroups, preferences, onKeyboardShortcuts, extra],
  );

  if (!port || !showBar) return null;

  return (
    <div data-slot="shell-chrome-bar" className="pointer-events-auto flex items-center gap-2">
      <ChromeBar
        testIdPrefix={testIdPrefix}
        menu={menu}
        // WHY both arrows are hard-`false` rather than wired to something:
        // this bar's `history` is DEPTH navigation — "back to the level you
        // came from" — and no host has a depth model yet (no focused region,
        // no drill-in; regions are frames you pan to, not levels you enter).
        // Wiring them to the camera would make Back mean something different
        // here than in the surface they were ported from, and wiring them to
        // undo/redo would make two controls that look like navigation do
        // document surgery. Honestly disabled until there is a level to go
        // back to. (Kept verbatim through the lift — B-SHELL-P1's stop rule is
        // "no behaviour change"; L-NAV owns wiring them.)
        history={{ canGoBack: false, canGoForward: false, onBack: () => {}, onForward: () => {} }}
        identity={{
          title: identity?.title ?? boardName,
          statusTone: identity?.statusTone ?? "ok",
          statusLabel: identity?.statusLabel ?? "Saved",
          path: identity?.path,
        }}
        rename={rename ?? ownRename}
        crumbs={[]}
        depth={0}
        onReturnToRoot={() => port.view({ kind: "fit" })}
        onJumpToLevel={() => {}}
        fileActions={fileActions ?? []}
      />
      {children}
    </div>
  );
}
