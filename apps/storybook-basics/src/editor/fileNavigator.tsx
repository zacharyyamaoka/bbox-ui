// src/editor/fileNavigator.tsx — the app's own file browser: "LOCAL
// WORKSPACE · Open a document" / "Save a copy" (Zach's screenshot
// `Pasted image 20260919135724.png`).
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `FileNavigator` THROWS until lane `files-kit` fills it in.
// `src/editor/FileNavigator.stories.tsx` is the acceptance and is off-limits
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
//   - Empty folder: "This folder has no boards yet." /
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
import { Button } from "../components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/dialog";
import { Input } from "../components/input";
import { ScrollArea } from "../components/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";
import { cn } from "../lib/utils";

import { WorkspaceConflict, type WorkspaceClient, type WorkspaceListing } from "../files/workspaceClient";
import {
  DEFAULT_NEW_DOCUMENT_SUFFIX,
  breadcrumbTrail,
  browserRows,
  documentPathFor,
  documentSuffix,
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
  /** saveAs mode: suffix for a name typed without one, when no row was
   *  picked. Default `.bbox`. */
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
   *   `P-list` (the file list's ScrollArea — named because the rail is a
   *   ScrollArea too, so "the first one in the dialog" is the WRONG one and a
   *   geometry check that used it measured the rail's overflow instead);
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
  /**
   * The suffix of the row the person picked in saveAs mode, if any.
   *
   * WHY this state exists — Zach, 2026-09-21 made `.bbox` the suffix a NEW
   * document gets. Picking an existing row fills the name field with that
   * row's TITLE, suffix stripped, so without this a click on
   * `02_literal_argument.tldr` followed by Save would propose
   * `02_literal_argument.bbox` — a NEW file beside the one he pointed at,
   * with no conflict, no "Replace it?" prompt, and the original untouched. A
   * default for new names must not silently convert a file someone selected.
   */
  const [pickedSuffix, setPickedSuffix] = useState<DocumentSuffix | null>(null);
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
  /**
   * The suffix this dialog will actually write, in precedence order: one the
   * person typed, then the one they picked off the list, then the app's
   * default for a new document.
   *
   * WHY it is computed rather than shown from `suffix`: the span beside the
   * name field is the only place the extension is visible, so it has to be
   * the extension. Typing "board.tldr" while the span reads ".bbox" told the
   * truth about the default and a lie about the file.
   */
  const effectiveSuffix: DocumentSuffix = documentSuffix(name) ?? pickedSuffix ?? suffix;
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
        setPickedSuffix(documentSuffix(row.path));
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
          const proposedPath = force && replacePath ? replacePath : listing ? documentPathFor(listing.dir, name, effectiveSuffix) : null;
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
    [activate, effectiveSuffix, listing, mode, name, onSaveAs, replacePath, selectedRow],
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
        /*
         * WHY the frame is a FIXED height and not `max-h-[85vh]`, and why it
         * carries `data-viewport-frame` (2026-09-22, Zach: "its just way to
         * long goes off the screen"):
         *
         *  1. `max-h` let the file COUNT decide the frame: a folder of three
         *     boards gave a short dialog and one of thirty gave a tall one, so
         *     the footer moved under the pointer between folders. A file
         *     browser's frame is furniture — `h-[min(...)]` is the same idiom
         *     `settingsView.tsx`'s `POPUP_DIALOG` uses, and 680px is what 85vh
         *     already measured at the 800px-tall window this was drawn on, so
         *     the size Zach picked is unchanged where he picked it.
         *  2. `data-viewport-frame` is the contract with a host that SCALES its
         *     chrome. A host zoom is a layout scale, so a viewport length
         *     written inside it resolves against the UNZOOMED viewport and then
         *     paints scaled — `85vh` painted ~136vh at 160%, and MEASURED in
         *     the real app at 1280x800 the popup came out 1228.8x1088 with its
         *     top edge at y=-144 and Cancel/Open past the bottom of the window.
         *     The attribute lets the host hold this box in real pixels and zoom
         *     its interior instead; see `apps/systemsketch/src/
         *     interface-scale.css`. A host that does not scale ignores it and
         *     nothing changes.
         *  3. `overflow-hidden` is what makes (2) safe rather than decorative:
         *     once the interior is scaled independently of the frame, the frame
         *     is the thing that must clip. It is also the backstop the
         *     un-scaled case already wanted — the stock `DialogContent` sets no
         *     overflow at all, so before this the table painted THROUGH the
         *     footer.
         */
        className={cn("flex h-[min(680px,calc(100vh-4rem))] w-full max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl", popupClassName)}
        data-testid={P}
        data-mode={mode}
        data-viewport-frame=""
        onKeyDown={onDialogKeyDown}
      >
        <DialogHeader className="shrink-0 gap-0.5">
          <span className="text-xs text-muted-foreground">{eyebrow}</span>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* WHY `grid-rows-[minmax(0,1fr)]` and not just `overflow-hidden`:
            a grid's implicit row is `auto`, which sizes to its CONTENT, and a
            grid item stretches to its ROW rather than to the container. So the
            flex shrink above resolved this box to the space left over (545px,
            measured) while the row underneath it stayed at the full 1187px of
            table — the list pane inherited 1187px, its own `flex-1 min-h-0`
            had nothing left to do, and the rows painted past the frame instead
            of scrolling inside it. `minmax(0, 1fr)` is what makes the row the
            container's height and lets its children shrink below content. */}
        {/* WHY the rail track is `minmax(7rem, 22%)` and not the flat `160px`
            it was: under a host that scales the interior of this frame, a
            track written in px keeps its LOCAL width while the frame's real
            width is fixed — so the rail's share of the row grows with the
            scale. MEASURED at 1280x800/160% with `160px`: the interior
            resolves to 460 local px, the rail takes 160 of them (35%, against
            22% at 100%) and the file list is left 288 — which is what turned
            every name into "Board …". A percentage track is computed against
            the same local box, so the rail keeps its PROPORTION and therefore
            its painted size at every scale. The `7rem` floor is for the other
            end: the stock `max-w-[calc(100%-2rem)]` lets this frame get narrow
            on a small window, and 22% of that is not a rail. */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(7rem,22%)_1fr] grid-rows-[minmax(0,1fr)] gap-3">
          {/* WHY the rail gets a `border-r` and its own ScrollArea: Zach,
              2026-09-22, that it "wastes most of its vertical space while the
              list beside it overflows". It cannot be given less height — it is
              one column of a two-column row — so what was actually wrong is
              that its empty half read as blank dialog rather than as the
              bottom of a column. A divider is the sibling settings panel's own
              answer (`settingsView.tsx`'s nav aside, `border-r border-border`),
              and it costs no layout. The ScrollArea is the same swap the list
              below gets, for the same reason: a long Recent list used to grow a
              classic inset bar here too. */}
          <aside className="flex min-h-0 flex-col border-r border-border pr-3 text-sm">
            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden!">
              <div className="flex flex-col gap-1 pr-1">
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
              </div>
            </ScrollArea>
          </aside>

          <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
            {/* WHY this row wraps, and why the breadcrumb carries a `basis`:
                this is the reflow `interface-scale.css` says `zoom` was chosen
                FOR — "the pill wraps, the dock's flex row re-wraps" — applied
                to the one row here whose parts have fixed widths (the Filter
                field, the + Folder button) inside a frame whose real width
                does not move. At 160% those parts wanted more than the row
                had, and the only flexible item was the breadcrumb, so the path
                collapsed to its last few characters. `basis-40` gives the
                breadcrumb a hypothetical size to wrap AGAINST — without one,
                `flex-1 min-w-0` shrinks happily to nothing and `flex-wrap`
                never gets a chance to fire. At 100% nothing wraps: the row
                needs ~396px of a ~564px column. */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                className="flex min-w-0 flex-1 basis-40 items-center overflow-x-auto text-sm"
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
                    // WHY the empty-box case is allowed THROUGH, and why that
                    // asymmetry is the whole point: this field is `autoFocus`
                    // in open mode, so swallowing Escape unconditionally — as
                    // this did — meant Escape never closed the Open dialog at
                    // all, on the very first keystroke of a fresh open.
                    // MEASURED 2026-09-22 against the real mounted app: the
                    // navigator was still in the DOM 10s after Escape.
                    // With text in the box Escape abandons the search without
                    // losing the dialog; with the box already empty there is
                    // nothing to abandon and it belongs to the Dialog.
                    // `settingsView.tsx`'s search input makes the identical
                    // split for the identical reason.
                    if (query === "") return;
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

            {/* WHY a stock `ScrollArea` and not `overflow-y-auto`, which is what
                this was: the sibling settings panel already made this call and
                records Zach's word for the look he wants ("obsidan",
                `settingsView.tsx`). Two concrete things the native bar did
                here. It is laid out INSIDE the box, so it steals width from
                the rows the moment it appears — and it appears and disappears
                as you walk in and out of folders, so the columns twitch.
                And `overflow-y: auto` computes `overflow-x: auto` too, which
                is the second half of why "Modified" could sit scrolled out of
                view with no bar offering to bring it back. ScrollArea's
                viewport, pinned `overflow-x: hidden` here, closes that axis for
                good; `table-fixed` below is what makes closing it safe. */}
            <ScrollArea
              data-testid={testId("list")}
              className="min-h-0 flex-1 rounded-md border [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden!"
            >
              {/* WHY `table-fixed`: with `table-auto` every column's width is
                  negotiated from its CONTENT, so one long file name pushed the
                  table's min-content width past its container and the tail of
                  the last column was simply scrolled out of sight — the
                  "Modifie" in Zach's 2026-09-22 screenshot is the Modified
                  header, not a styling bug. MEASURED in the real app at
                  1280x800/100%: the table wanted 612px inside a 562px box, and
                  the smoke test's stress row wanted 727 inside 563. Fixed
                  layout takes the two `w-24` columns off the top and gives
                  Name the rest, so the header can never be squeezed off the
                  edge by a file someone names. */}
              <Table className="table-fixed">
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
                          setPickedSuffix(documentSuffix(row.path));
                          setReplacePath(null);
                          setError(null);
                        }
                      }}
                      onDoubleClick={() => void runAction(() => activate(row))}
                    >
                      {/* WHY the name truncates but keeps `title`: a fixed
                          column has to shorten something, and Zach's rule for
                          that is explicit — abbreviate with a visible ellipsis
                          and keep the complete raw value immediately
                          discoverable, never silently clip. `truncate` is the
                          ellipsis; `title` is the full name on hover. The
                          `min-w-0` is what lets the flex row shrink at all —
                          a flex item's automatic minimum size is its content,
                          so without it `truncate` never fires. */}
                      <TableCell className="flex items-center gap-2">
                        {row.kind === "folder" ? (
                          <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span data-name="" title={row.name} className="min-w-0 truncate">
                          {row.name}
                        </span>
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
                  {query ? `Nothing here matches “${query}”.` : "This folder has no boards yet."}
                </p>
              ) : null}
            </ScrollArea>

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
                      // The same rule as the Filter field above, and the same
                      // root cause: this one is `autoFocus` in saveAs mode, so
                      // an unconditional swallow — which is all this branch
                      // used to be, a `preventDefault` with an empty body —
                      // made Escape do nothing whatsoever on a freshly opened
                      // Save dialog. Typed text is still worth protecting from
                      // a stray Escape; an empty field has nothing to protect
                      // and the key belongs to the Dialog.
                      if (name === "") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setName("");
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground" data-testid={testId("suffix")}>
                  {effectiveSuffix}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="shrink-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* WHY the stock `DialogFooter` replaces the hand-rolled `<footer>`:
            Zach, 2026-09-19 — "as always please be using stock shadcn as much
            as possible" — and the hand-rolled one had re-derived the border and
            the right-alignment by hand while missing what the stock part is
            actually for. `-mx-4 -mb-4 … p-4` cancels the popup's own padding so
            the action row is FULL-BLEED against the frame's bottom edge, which
            is both the stock dialog look everywhere else in this kit and the
            thing that makes the primary action unmistakable at the bottom of a
            long list. `shrink-0` is load-bearing now that the frame has a fixed
            height: without it the footer is the flex child that gives way when
            the list is long, and the buttons are the one row that may never
            be the thing that shrinks. */}
        <DialogFooter className="shrink-0 items-center gap-2">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
