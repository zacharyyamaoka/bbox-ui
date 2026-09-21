// src/components/fileNavigator.tsx — the app's own file browser: "LOCAL
// WORKSPACE · Open a document" / "Save a copy" (Zach's screenshot
// `Pasted image 20260919135724.png`).
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `FileNavigator` THROWS until lane `files-kit` fills it in.
// `src/components/FileNavigator.stories.tsx` is the acceptance and is off-limits
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
// raw buttons → `Button`, the hand-built path row → stock `Breadcrumb*`.
// Zach, 2026-09-19: "as always please be using stock shadcn as much as
// possible" — so there is no raw `<button>` left in this file at all
// (`trunkOwnership.test.ts` holds that line: a hand-styled control and a
// stock one are indistinguishable to a click, and only the source says which
// one the next host inherits). Dropped: the `rename`, `exportTldraw` and
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
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { FileIcon, FolderIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { cn } from "../lib/utils";

import { WorkspaceConflict, type WorkspaceClient, type WorkspaceListing } from "../files/workspaceClient";
import {
  DEFAULT_NEW_DOCUMENT_SUFFIX,
  breadcrumbTrail,
  browserRows,
  documentPathFor,
  documentTitle,
  formatFileSize,
  formatRelativeDay,
  moveBrowserSelection,
  parentDirectory,
  resolveBrowserSelection,
  type BrowserRow,
  type DocumentSuffix,
  type WorkspaceBrowserSort,
  type WorkspaceBrowserSortDirection,
} from "../files/workspaceModel";

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

/**
 * A Places/Recent rail row: the donor's two-line, left-aligned shape
 * (`LocalWorkspace.tsx:1873-1879`) expressed as the deltas a stock ghost
 * `Button` needs, rather than as a second button implementation.
 *
 * WHY each override is here and not a restyle of `Button` itself: the rail is
 * the ONE place in this kit where a control is two stacked lines of different
 * sizes, so `h-auto flex-col items-start` is local taste, not a missing
 * variant — pushing it into the stock part would change every button in the
 * repo to win one rail.
 */
const RAIL_ROW = "h-auto flex-col items-start gap-0 whitespace-normal px-2 py-1 text-left font-normal";

const SORT_COLUMNS: readonly [WorkspaceBrowserSort, string][] = [
  ["name", "Name"],
  ["size", "Size"],
  ["modified", "Modified"],
];

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** `target` is a text field: arrow-key navigation still applies (donor
 *  behaviour, :1874-1876), but a global Enter must not steal typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea") || target.isContentEditable);
}

export function FileNavigator(props: FileNavigatorProps): ReactElement | null {
  const {
    open,
    onOpenChange,
    mode,
    client,
    initialDirectory,
    recents,
    onOpenDocument,
    onSaveAs,
    defaultName,
    suffix = DEFAULT_NEW_DOCUMENT_SUFFIX,
    eyebrow = "Local workspace",
    title = mode === "open" ? "Open a document" : "Save a copy",
    now = () => Date.now(),
    container,
    popupClassName,
    testIdPrefix = "file-navigator",
  } = props;
  void container; // WHY: the stock DialogContent this renders through does not
  // expose the underlying Portal's `container` prop; no story or test mounts
  // this outside the document body, so this is a documented gap, not a
  // silent one — see fileNavigator.tsx header.

  const P = testIdPrefix;
  const testId = useCallback((suffixName: string) => `${P}-${suffixName}`, [P]);

  const [listing, setListing] = useState<WorkspaceListing | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ column: WorkspaceBrowserSort; direction: WorkspaceBrowserSortDirection }>({
    column: "name",
    direction: "ascending",
  });
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [replacePath, setReplacePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const loadAbortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLTableSectionElement | null>(null);
  const crumbsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (directory?: string) => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      setBusy(true);
      setError(null);
      try {
        const next = await client.list(directory, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setListing(next);
        setSelectedPath(null);
        setQuery("");
        setReplacePath(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          setBusy(false);
        }
      }
    },
    [client],
  );

  // Reload whenever the dialog opens (fresh mount and reopen alike); abort a
  // stale in-flight list on unmount so it cannot resolve into a closed dialog.
  useEffect(() => {
    if (!open) return;
    void load(initialDirectory);
    return () => loadAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(() => browserRows(listing, query, sort.column, sort.direction), [listing, query, sort]);
  const selectedRow = rows.find((row) => row.path === selectedPath) ?? null;
  const trail = listing ? breadcrumbTrail(listing.dir, listing.root) : [];

  const toggleSort = useCallback((column: WorkspaceBrowserSort) => {
    setSort((current) => ({
      column,
      // WHY: a second click on the same header reverses it, like any file
      // manager. Modified starts newest-first — "what did I just edit?" is
      // the question that column answers.
      direction:
        current.column === column
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : column === "modified"
            ? "descending"
            : "ascending",
    }));
  }, []);

  // Enter means something the moment the list appears, without a click first.
  useEffect(() => {
    setSelectedPath((current) => resolveBrowserSelection(rows, current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /** Fire-and-report: for gestures the donor drove through a toast-style
   *  `workspace.runAction` this component has no equivalent of — surface the
   *  same failure as the dialog's own alert instead of losing it. */
  const runAction = useCallback(async (action: () => void | Promise<void>) => {
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const activate = useCallback(
    async (row: BrowserRow) => {
      if (row.kind === "folder") {
        await load(row.path);
        return;
      }
      if (mode === "open") {
        await onOpenDocument(row.path, { newWindow: false });
      } else {
        setName(row.title);
        setReplacePath(null);
        setError(null);
      }
    },
    [load, mode, onOpenDocument],
  );

  const createFolder = useCallback(async () => {
    if (!listing) return;
    setBusy(true);
    setError(null);
    try {
      const created = await client.createDirectory(listing.dir, folderName);
      setCreatingFolder(false);
      setFolderName("");
      await load(created.path);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }, [client, folderName, listing, load]);

  const submit = useCallback(
    async (force = false) => {
      setBusy(true);
      setError(null);
      let attemptedPath: string | null = null;
      try {
        if (mode === "open") {
          if (!selectedRow) throw new Error("Choose a document to open.");
          await activate(selectedRow);
          if (selectedRow.kind === "folder") setBusy(false);
        } else {
          const proposedPath = force && replacePath ? replacePath : listing ? documentPathFor(listing.dir, name, suffix) : null;
          if (!proposedPath) throw new Error("Enter a file name.");
          attemptedPath = proposedPath;
          if (!onSaveAs) throw new Error("Saving is not available here.");
          await onSaveAs(proposedPath, { force });
          setBusy(false);
        }
      } catch (cause) {
        if (mode === "saveAs" && !force && attemptedPath && cause instanceof WorkspaceConflict) {
          setReplacePath(attemptedPath);
          setError(`“${documentTitle(attemptedPath)}” already exists. Replace it with this document?`);
        } else {
          setReplacePath(null);
          setError(errorMessage(cause));
        }
        setBusy(false);
      }
    },
    [activate, listing, mode, name, onSaveAs, replacePath, selectedRow, suffix],
  );

  const openInNewWindow = useCallback(async () => {
    if (!selectedRow || selectedRow.kind !== "document") return;
    await onOpenDocument(selectedRow.path, { newWindow: true });
  }, [selectedRow, onOpenDocument]);

  // Arrow keys move the selection regardless of focus (donor behaviour);
  // Enter activates unless a text field owns it and the mode isn't `open`
  // (the saveAs name field wires its own Enter instead, below); Backspace
  // outside a text field goes up one folder.
  //
  // WHY this is a React `onKeyDown` on the dialog's own content, not a
  // `window` listener the way the donor's Radix-based dialog did it: Base
  // UI's Dialog stops a keydown's native propagation before it reaches
  // `window` (measured live — a capture listener on `window` sees
  // `ArrowDown`, a bubble listener never does), so a global listener here
  // would silently never fire. Scoping it to the dialog's own React tree
  // both survives that and is the more correct behavior anyway: this
  // component should not react to arrow keys typed somewhere else on the
  // host page.
  const onDialogKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const typing = isTypingTarget(event.target);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = moveBrowserSelection(rows, selectedPath, event.key === "ArrowDown" ? 1 : -1);
        setSelectedPath(next);
        listRef.current?.querySelector(`[data-path="${CSS.escape(next ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && !busy && (!typing || mode === "open")) {
        event.preventDefault();
        void submit();
        return;
      }
      if (event.key === "Backspace" && !typing && listing?.parent) {
        event.preventDefault();
        void load(listing.parent);
      }
    },
    [busy, listing, load, rows, selectedPath, submit, mode],
  );

  // A deep path keeps its tail — the folder you are in — in view.
  useEffect(() => {
    const crumbs = crumbsRef.current;
    if (crumbs) crumbs.scrollLeft = crumbs.scrollWidth;
  }, [listing]);

  const places = listing
    ? [
        { label: "SystemSketch", path: parentDirectory(listing.defaultDocument) },
        { label: "Home", path: listing.root },
      ].filter((place, index, all) => all.findIndex((other) => other.path === place.path) === index)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn("flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 sm:max-w-3xl", popupClassName)}
        data-testid={P}
        data-mode={mode}
        onKeyDown={onDialogKeyDown}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{eyebrow}</span>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </header>

        <div className="grid grid-cols-[160px_1fr] gap-3 overflow-hidden">
          <aside className="flex flex-col gap-1 overflow-y-auto text-sm">
            <strong className="text-xs text-muted-foreground">Places</strong>
            {places.map((place) => (
              <Button
                key={place.path}
                type="button"
                variant="ghost"
                size="sm"
                title={place.path}
                data-testid={testId("place")}
                className={cn(RAIL_ROW, listing?.dir === place.path && "bg-muted")}
                onClick={() => void load(place.path)}
              >
                <span className="w-full truncate">{place.label}</span>
                <small className="w-full truncate text-muted-foreground">{place.path}</small>
              </Button>
            ))}
            <strong className="mt-2 text-xs text-muted-foreground">Recent</strong>
            {recents.length ? (
              recents.map((path) => (
                <Button
                  key={path}
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={path}
                  data-testid={testId("recent")}
                  className={RAIL_ROW}
                  onClick={() => {
                    if (mode === "open") void runAction(() => onOpenDocument(path, { newWindow: false }));
                    else void load(parentDirectory(path));
                  }}
                >
                  <span className="w-full truncate">{documentTitle(path)}</span>
                  <small className="w-full truncate text-muted-foreground">{parentDirectory(path)}</small>
                </Button>
              ))
            ) : (
              <p className="px-2 text-muted-foreground">No recent files yet.</p>
            )}
          </aside>

          <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!listing?.parent || busy}
                aria-label="Parent folder"
                data-testid={testId("parent")}
                onClick={() => listing?.parent && void load(listing.parent)}
              >
                ←
              </Button>
              {/* WHY the current folder is a `BreadcrumbPage` and not a
                  disabled link: the donor got the LOOK right with
                  `disabled:font-medium disabled:text-foreground`, but a
                  screen reader heard "dimmed button" where the stock part
                  says `aria-current="page"` — and the trail is the only
                  thing on this dialog that says where you are. */}
              <Breadcrumb
                className="flex min-w-0 flex-1 items-center overflow-x-auto text-sm"
                aria-label="Folder path"
                data-testid={testId("crumbs")}
                ref={crumbsRef}
              >
                <BreadcrumbList className="flex-nowrap gap-1 whitespace-nowrap">
                  {trail.map((segment, index) => (
                    <Fragment key={segment.path}>
                      {index > 0 ? <BreadcrumbSeparator>/</BreadcrumbSeparator> : null}
                      <BreadcrumbItem>
                        {segment.path === listing?.dir ? (
                          <BreadcrumbPage title={segment.path} className="px-1 font-medium">
                            {segment.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            title={segment.path}
                            // WHY the size overrides ride on the `Button` and
                            // not on `BreadcrumbLink`: `BreadcrumbLink` merges
                            // classNames by CONCATENATION (Base UI
                            // `mergeProps`/`useRender`), so `h-auto` beside
                            // the Button's own `h-7` would be settled by
                            // stylesheet order rather than by tailwind-merge.
                            // `Button`'s className goes through `cn`, which
                            // resolves the conflict deterministically.
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                className="h-auto px-1 py-0.5 font-normal text-muted-foreground"
                                onClick={() => void load(segment.path)}
                              />
                            }
                          >
                            {segment.label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid={testId("new-folder")}
                disabled={busy || !listing?.exists}
                onClick={() => {
                  setCreatingFolder(true);
                  setFolderName("");
                  setError(null);
                }}
              >
                + Folder
              </Button>
              <Input
                data-testid={testId("filter")}
                className="w-32"
                placeholder="Filter"
                aria-label="Filter this folder"
                autoFocus={mode === "open"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (mode === "open") void submit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery("");
                  }
                }}
              />
            </div>

            {creatingFolder ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createFolder();
                }}
              >
                <label className="sr-only">New folder</label>
                <Input
                  data-testid={testId("new-folder-name")}
                  className="w-40"
                  autoFocus
                  aria-label="New folder name"
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      void createFolder();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setCreatingFolder(false);
                      setFolderName("");
                      setError(null);
                    }
                  }}
                />
                <Button type="submit" size="sm" disabled={busy || !folderName.trim()}>
                  Create
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreatingFolder(false);
                    setFolderName("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {SORT_COLUMNS.map(([column, label]) => {
                      const active = sort.column === column;
                      const direction = active ? sort.direction : "none";
                      const arrow = active ? (sort.direction === "ascending" ? "↑" : "↓") : "";
                      return (
                        <TableHead key={column} className={column === "name" ? "" : "w-24"}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={testId(`sort-${column}`)}
                            aria-sort={direction}
                            aria-label={`Sort by ${label}${active ? `, ${sort.direction}` : ""}`}
                            title={`Sort by ${label}`}
                            className="-mx-1 h-auto gap-1 px-1 py-0.5 font-medium"
                            onClick={() => toggleSort(column)}
                          >
                            {label}
                            <span aria-hidden="true">{arrow}</span>
                          </Button>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody ref={listRef} aria-label="Local files">
                  {rows.map((row) => (
                    <TableRow
                      key={row.path}
                      data-testid={testId("row")}
                      data-kind={row.kind}
                      data-path={row.path}
                      role="option"
                      aria-selected={selectedPath === row.path}
                      className={cn("cursor-pointer", selectedPath === row.path && "bg-muted")}
                      onClick={() => {
                        setSelectedPath(row.path);
                        if (row.kind === "folder") void load(row.path);
                        else if (mode === "saveAs") {
                          setName(row.title);
                          setReplacePath(null);
                          setError(null);
                        }
                      }}
                      onDoubleClick={() => void runAction(() => activate(row))}
                    >
                      <TableCell className="flex items-center gap-2">
                        {row.kind === "folder" ? (
                          <FolderIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <FileIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                        {row.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatFileSize(row.size)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.mtime === null ? "—" : formatRelativeDay(row.mtime, now())}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!busy && listing && !rows.length ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {query ? `Nothing here matches “${query}”.` : "This folder has no SystemSketch documents yet."}
                </p>
              ) : null}
            </div>

            {mode === "saveAs" ? (
              <div className="flex items-center gap-2">
                <Input
                  data-testid={testId("name")}
                  autoFocus
                  aria-label="File name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setReplacePath(null);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      void submit();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">{suffix}</span>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" data-testid={testId("cancel")} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === "open" ? (
            <Button
              type="button"
              variant="outline"
              data-testid={testId("open-in-new-window")}
              disabled={busy || selectedRow?.kind !== "document"}
              onClick={() => void runAction(openInNewWindow)}
            >
              Open in new window
            </Button>
          ) : null}
          <Button
            type="button"
            variant={replacePath ? "destructive" : "default"}
            data-testid={testId(replacePath ? "replace" : "confirm")}
            disabled={busy || (mode === "open" && !selectedRow)}
            onClick={() => void submit(Boolean(replacePath))}
          >
            {busy
              ? "Working…"
              : mode === "open"
                ? selectedRow?.kind === "folder"
                  ? "Open folder"
                  : "Open"
                : replacePath
                  ? "Replace"
                  : "Save"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
