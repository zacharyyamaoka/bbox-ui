// src/components/fileNavigator.tsx — the app's own file browser: "LOCAL
// WORKSPACE · Open a document" / "Save a copy" (Zach's screenshot
// `Pasted image 20260919135724.png`).
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `FileNavigator` THROWS until lane `files-kit` fills it in.
// `src/stories/FileNavigator.stories.tsx` is the acceptance and is off-limits
// to the builder.
//
// Donor, read on disk and ported as BEHAVIOUR over stock parts:
// `/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:1690-2232`
// (`WorkspaceDialog`) and its model `workspaceModel.ts` (ported to
// `../files/workspaceModel.ts`). Zach: "Please copy over the code from system
// sketch for the file navigator here. its working good enough for now." So
// the layout, copy, keyboard and sort behaviour are the donor's; only its
// primitives change — Radix `Dialog` → stock shadcn `Dialog` (Base UI), the
// hand-styled table → stock `Table`, `SystemSketchUiInput` → stock `Input`,
// raw buttons → `Button`. Dropped: the `rename`, `exportTldraw` and
// `portableCopy` modes (rename is inline in the chrome bar title now; this app
// has no `.systemsketch` export) and every tldraw/`useLocalWorkspace` import —
// this component takes a client and callbacks, so it mounts in any host.
//
// Behaviour to carry verbatim (donor line refs):
//   - Places: "SystemSketch" (the listing's default-document folder) and
//     "Home" (the listing's `root`), de-duplicated (:1873-1879); Recent: one
//     button per `recents` path, title + parent folder, "No recent files yet."
//     when empty (:2041-2050).
//   - Path bar: ← parent (disabled at root), breadcrumb from root to `dir`
//     (last segment is the current folder, not a link), "+ Folder" (inline
//     name form, Enter creates then opens it, Escape cancels the FORM only),
//     "Filter" input (autofocus in open mode) (:2053-2130).
//   - Table: columns Name ↑/↓, Size, Modified; folders always first; a
//     second header click reverses; Modified's first click is newest-first
//     (:1768-1780). Rows: folder → navigates; document → selects; double-click
//     → activates (:2165-2185). Enter = activate selection; ↑/↓ move and
//     clamp; Backspace (outside a text field) → parent (:1843-1866). A hidden
//     selection re-aims at the first visible document (:1785-1789).
//   - Empty folder: "This folder has no SystemSketch documents yet." /
//     filtered: "Nothing here matches “q”." (:2187-2193).
//   - Footer: Cancel · (open mode) "Open in new window" · primary "Open" /
//     "Open folder" when a folder is selected / "Save" (saveAs mode) /
//     "Replace" after a conflict, destructive-styled (:2196-2226).
//   - saveAs mode: a "File name" field + the suffix shown beside it
//     (:2172-2180); clicking a document row copies its title into the field;
//     `onSaveAs` rejecting with `WorkspaceConflict` turns the primary into
//     "Replace" with "“<title>” already exists. Replace it with this
//     document?" (:1812-1830); pressing it calls `onSaveAs(path, {force:
//     true})` for the SAME path.
//   - Errors: `role="alert"` text above the footer.
import type { ReactElement } from "react";

import type { WorkspaceClient } from "../files/workspaceClient";
import type { DocumentSuffix } from "../files/workspaceModel";

export type FileNavigatorMode = "open" | "saveAs";

export interface FileNavigatorProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: FileNavigatorMode;
  /** Only the two reads/writes the browser itself makes. */
  client: Pick<WorkspaceClient, "list" | "createDirectory">;
  /** Folder to list first; omitted → the host's default workspace folder. */
  initialDirectory?: string;
  /** Absolute paths, most recent first (the host's MRU). */
  recents: readonly string[];
  /**
   * open mode: a document was activated (Open, Enter, double-click, a Recent
   * row, or "Open in new window" with `newWindow: true`). Both `.tldr` and
   * `.systemsketch` rows are offered — WHICH app opens which is the host's
   * decision, not the browser's. May reject; the message shows as the alert.
   */
  onOpenDocument(path: string, options: { newWindow: boolean }): void | Promise<void>;
  /** saveAs mode: write to `path` (suffix already applied). Rejecting with
   *  `WorkspaceConflict` offers Replace; any other rejection shows as the
   *  alert. Resolving closes nothing — the host closes via `onOpenChange`. */
  onSaveAs?(path: string, options: { force: boolean }): Promise<void>;
  /** saveAs mode: the name field's starting text (the board's title). */
  defaultName?: string;
  /** saveAs mode: suffix for a name typed without one. Default `.tldr`. */
  suffix?: DocumentSuffix;
  /** Header eyebrow + title; defaults "Local workspace" and "Open a
   *  document" / "Save a copy". */
  eyebrow?: string;
  title?: string;
  /** Pass `() => <fixed ms>` in a story so "Modified" is deterministic. */
  now?: () => number;
  container?: HTMLElement | null;
  popupClassName?: string;
  /**
   * DOM contract, with prefix P (default "file-navigator"):
   *   root dialog popup `data-testid=P`, `data-mode=<mode>`;
   *   `P-place` per Place button, `P-recent` per Recent button;
   *   `P-parent`, `P-crumbs` (the breadcrumb nav), `P-new-folder`,
   *   `P-new-folder-name`, `P-filter`;
   *   `P-sort-name|size|modified` header buttons with `aria-sort`;
   *   `P-row` per row with `data-kind="folder"|"document"`, `data-path`,
   *   `aria-selected`;
   *   `P-name` (saveAs name field); `P-open-in-new-window`;
   *   `P-confirm` (primary; `P-replace` while it reads Replace); `P-cancel`.
   */
  testIdPrefix?: string;
}

export function FileNavigator(props: FileNavigatorProps): ReactElement | null {
  void props;
  throw new Error("FileNavigator: not implemented (lane files-kit)");
}
