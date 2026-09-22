// src/files/session.tsx — the document session: which file this window is
// looking at, how it gets there, and how it gets back to disk.
//
// Zach, 2026-09-19: "we need to be able to save real files to the system so I
// can start working on this: Please copy over the code from system sketch for
// the file navigator here … (in settings you can have a toggle wether for file
// navigation to use native or our app one)".
//
// This file is WIRING, not chrome. Every pure decision it makes — what the
// next `Untitled` is called, which recents to keep, when an autosave is due,
// how a path becomes a title — is `@trunk/files/workspaceModel`; the bytes go
// through `@trunk/files/workspaceClient` (the local Python host) or
// `@trunk/files/nativeFiles` (the browser's own pickers); the browser it
// shows is `@trunk/components/fileNavigator`. What is left here is the part
// that is genuinely this app's: binding those to tldraw's editor, to the
// address bar, and to the File menu's callbacks.
//
// WHY one hook instead of a context: every consumer of this state is inside
// `src/chrome/TitleBar/chromeBar.tsx` — the burger, the title, the rename field, the
// navigator dialog and the keyboard shortcuts. A context would add a provider
// to `App.tsx` (a file the stock-boundary test reads) to serve exactly one
// subtree.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor, TLUiToastsContextType } from "tldraw";

import type { FileMenuCallbacks, MenuAction, RecentEntry } from "@trunk/editor/appMenu";
import { ChromeBarIcons, type StatusTone } from "@trunk/editor/chromeBar";
import type { FileNavigatorMode, FileNavigatorProps } from "@trunk/editor/fileNavigator";
import type { FileNavigationMode } from "@trunk/editor/appSettings";
import { createNativeFileAccess, type NativeDocument, type NativePickerHost } from "@trunk/files/nativeFiles";
import {
  WorkspaceConflict,
  createHttpWorkspaceClient,
  type WorkspaceClient,
  type WorkspaceDocument,
} from "@trunk/files/workspaceClient";
import {
  SYSTEMSKETCH_SUFFIX,
  autosaveSchedule,
  claimUntitledPath,
  documentSuffix,
  documentTitle,
  forgetDocumentPath,
  nextUntitledDocumentPath,
  readRecentDocumentPaths,
  readUntitledClaims,
  rememberDocumentPath,
  renamedDocumentPath,
  replaceRememberedDocumentPath,
} from "@trunk/files/workspaceModel";

import { fileNameFor, loadBoardText, serializeBoard } from "../chrome/FileMenu";
import { LEGACY_SYSTEMSKETCH_URL } from "../chrome/legacyApp";
import { documentLocation, fileHostBaseUrl } from "./launchConfig";
import { installUnsavedWorkGuard } from "./lifecycle";
import { resetDocumentToBlank } from "./resetDocument";

/**
 * The donor's own autosave numbers (`/home/bam/systemsketch/src/workspace/
 * LocalWorkspace.tsx`, and the `autosaveSchedule` contract ported with it):
 * settle 600 ms after the last edit, but never defer the first save of a
 * burst past 30 s. draw.io 31.4.2 gives its local recovery draft the same two
 * bounds (DrawioFile.js L2216-L2238) — an idle delay alone lets a continuous
 * gesture postpone every write indefinitely.
 */
export const AUTOSAVE_DEBOUNCE_MS = 600;
export const AUTOSAVE_MAX_DELAY_MS = 30_000;

/** What the window currently has open. `title === null` means "no file": the
 *  chrome bar falls back to tldraw's own document name. */
interface SessionDocument {
  /** App mode: the absolute path on disk. */
  path: string | null;
  /** Native mode: the File System Access handle and its last known bytes. */
  native: NativeDocument | null;
  /** The revision this window last read or wrote — the fence every save
   *  checks the disk against. `null` = "this file does not exist yet"
   *  (create-only). */
  digest: string | null;
  title: string | null;
  /**
   * False when the open file's bytes could not be parsed by THIS build.
   *
   * WHY it is carried rather than just reported: a `.tldr` written by the
   * archived app carries shapes this schema does not know. Loading it fails,
   * the editor keeps whatever it had, and the one thing that must never
   * happen next is this window writing its own (empty, or unrelated) board
   * over that file. Every save path checks this first.
   */
  readable: boolean;
}

const NO_DOCUMENT: SessionDocument = { path: null, native: null, digest: null, title: null, readable: true };

interface SessionStatus {
  tone: StatusTone;
  label: string;
}

/**
 * What a queued write did — the callers that must know are `save`'s own
 * picker fallback and `waitForSave`, which refuses to leave a document whose
 * last write failed.
 */
type SaveOutcome = "saved" | "skipped" | "failed" | "needs-target";

const SCRATCH_STATUS: SessionStatus = { tone: "pending", label: "Not saved to a file" };

export interface DocumentSessionHelpers {
  addToast: TLUiToastsContextType["addToast"];
  /** Resolves `true` only if the person said yes. */
  confirm(prompt: { title: string; body: string; confirmLabel: string }): Promise<boolean>;
}

export interface DocumentSession {
  /** What the chrome bar's title reads. */
  title: string | null;
  path: string | null;
  statusTone: StatusTone;
  statusLabel: string;
  /** The File submenu's callbacks — a row exists iff its callback does. */
  file: FileMenuCallbacks;
  /** The file title's own dropdown and right-click menu. */
  titleActions: MenuAction[];
  rename: {
    active: boolean;
    onBegin(): void;
    onCommit(next: string): void;
    onCancel(): void;
    error: string | null;
    busy: boolean;
  };
  /** `null` while the app navigator is closed. */
  navigatorProps: FileNavigatorProps | null;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The browser's own storage, or `null` when even touching it throws (a
 *  blocked-site-data profile throws on the property, before any method). */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea") || target.isContentEditable);
}

/** The archived app's URL for `path` — `http://127.0.0.1:4321/?board=<path>`.
 *  Absolute on purpose: it leaves this origin. */
function legacyBoardHref(path: string): string {
  const url = new URL(LEGACY_SYSTEMSKETCH_URL);
  url.searchParams.set("board", path);
  return url.toString();
}

export function useDocumentSession(options: {
  editor: Editor;
  mode: FileNavigationMode;
  helpers: DocumentSessionHelpers;
  /** tldraw's own document name — the scratch board's title, and what the
   *  native Save As picker suggests when there is no file yet. */
  boardName: string;
}): DocumentSession {
  const { editor, mode, helpers, boardName } = options;

  const client = useMemo<WorkspaceClient>(() => createHttpWorkspaceClient({ baseUrl: fileHostBaseUrl() }), []);
  // WHY `window` itself is the picker host: `createNativeFileAccess` reads
  // `showOpenFilePicker`/`showSaveFilePicker` off it at CALL time, so a test
  // that replaces them after this object exists is still honoured — the same
  // late-lookup rule `workspaceClient`'s injectable `fetch` follows.
  const native = useMemo(() => createNativeFileAccess(window as unknown as NativePickerHost), []);

  const [document_, setDocument] = useState<SessionDocument>(NO_DOCUMENT);
  const [status, setStatus] = useState<SessionStatus>(SCRATCH_STATUS);
  const [recents, setRecents] = useState<readonly string[]>(() => {
    const storage = viewerStorage();
    return storage ? readRecentDocumentPaths(storage) : [];
  });
  const [navigatorMode, setNavigatorMode] = useState<FileNavigatorMode | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const documentRef = useRef(document_);
  documentRef.current = document_;
  /**
   * WHICH document this window is on, as an identity rather than a value.
   *
   * WHY a counter and not "compare the path": a write started against one
   * document can only be allowed to finish onto the SAME one. Reproduced by
   * an independent judge on 2026-09-19 — start a save of A, complete a Save
   * As onto B, then let A's answer arrive: A's completion re-adopted A, so
   * the title and every later save pointed at A while the address bar said B,
   * and the next edit overwrote a file the person had already left. Comparing
   * paths cannot see it (A's answer really does carry A's path); comparing an
   * identity captured at dispatch can. `adoptDocument` is the only way this
   * number moves, so "the document changed under me" is one cheap check.
   */
  const documentEpochRef = useRef(0);
  /** Point this window at a DIFFERENT document. Updating the one it is
   *  already on (a save's new digest) is a plain `setDocument`. */
  const adoptDocument = useCallback((next: SessionDocument) => {
    documentEpochRef.current += 1;
    // The new document owes the disk nothing yet, and the old one's unwritten
    // work is not this window's to write any more — whoever swapped the
    // document (an open, a Save As, a Trash) already decided that.
    dirtyRef.current = false;
    setDocument(next);
  }, []);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const boardNameRef = useRef(boardName);
  boardNameRef.current = boardName;
  const helpersRef = useRef(helpers);
  helpersRef.current = helpers;

  /* ------------------------------------------------------------ autosave */

  const suppressRef = useRef(0);
  const pendingSinceRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  /**
   * Does this window hold an edit the disk has not got?
   *
   * WHY this and not "is a timer pending", which is the obvious proxy: the
   * timer is spent the moment the autosave FIRES, so a save that then fails —
   * the digest fence refusing to clobber another writer — leaves no timer and
   * a board full of unwritten work. A guard reading the timer would call that
   * clean and let File ▸ New navigate the edit into oblivion. The donor keeps
   * the same flag for the same reason (`/home/bam/systemsketch/src/workspace/
   * LocalWorkspace.tsx`'s `dirtyRef`, checked again after every `persist`).
   * Only a board with somewhere to be written sets it: a scratch board has
   * its own browser persistence, and an unreadable one must never be written.
   */
  const dirtyRef = useRef(false);

  const cancelAutosave = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingSinceRef.current = null;
  }, []);

  /**
   * Run `fn` without it looking like a person edited the board.
   *
   * WHY the release is deferred a macrotask instead of being a plain
   * try/finally: `editor.run` flushes its store listeners at the END of the
   * transaction, which is not always inside this call frame. Releasing
   * synchronously let a document SWAP (opening a file) schedule an autosave
   * of the board that was just loaded — harmless when it succeeded, and
   * actively wrong for a file this build could not read.
   */
  const withoutAutosave = useCallback(
    <T,>(fn: () => T): T => {
      suppressRef.current += 1;
      try {
        return fn();
      } finally {
        window.setTimeout(() => {
          suppressRef.current = Math.max(0, suppressRef.current - 1);
          cancelAutosave();
        }, 0);
      }
    },
    [cancelAutosave],
  );

  /* ----------------------------------------------------- the save queue */

  // WHY every write goes through one chain: a Ctrl+S landing while an
  // autosave is already in flight would send two requests carrying the SAME
  // `baseDigest`. The host answers the second one with a conflict — correctly,
  // because by then the disk no longer matches that digest — and the window
  // would report "changed on disk" about its own save. Serializing is the
  // whole fix; the queue never drops a request, it just orders them.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  /** How many queued writes are running right now — what the exit guard reads
   *  to keep a window open over a save that has not answered yet. */
  const pendingWritesRef = useRef(0);
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(async () => {
      pendingWritesRef.current += 1;
      try {
        return await task();
      } finally {
        pendingWritesRef.current -= 1;
      }
    });
    chainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  /** Assigned once `waitForSave` exists. The callbacks that LEAVE a document
   *  are defined above it (they are used by menus defined further down), so
   *  they reach it the same way `save` reaches `saveAs`. */
  const waitForSaveRef = useRef<() => Promise<boolean>>(async () => true);

  /** One sentence for every way of leaving a board that could not be written. */
  const reportCouldNotLeave = useCallback(() => {
    helpersRef.current.addToast({
      severity: "error",
      title: "This board still has unsaved changes",
      description:
        "SystemSketch could not write them, so it stayed here rather than leave them behind. Deal with the error on the title, then try again.",
    });
  }, []);

  const rememberRecent = useCallback((path: string) => {
    const storage = viewerStorage();
    if (storage) setRecents(rememberDocumentPath(path, storage));
  }, []);

  // `live` is false when the window has moved onto a different document while
  // this write was in flight: the toast still names the file it was about, but
  // the status dot belongs to whatever is open NOW and must not be repainted
  // with an error about a board that is no longer on screen.
  const reportSaveFailure = useCallback((cause: unknown, name: string, live: boolean) => {
    if (cause instanceof WorkspaceConflict) {
      // WHY a toast and a red dot rather than a modal "Replace?" prompt: the
      // conflict is discovered by a SAVE, which can be an autosave nobody
      // asked for — a modal that steals focus mid-sentence to ask about a
      // file the person has not looked at is the worse failure. Nothing was
      // overwritten, the dot says so, and File ▸ Save As… is the one gesture
      // that keeps both copies.
      if (live) setStatus({ tone: "error", label: `${name} changed on disk — nothing was overwritten` });
      helpersRef.current.addToast({
        severity: "error",
        title: `“${name}” changed on disk`,
        description:
          "Another window or app wrote this file after you opened it, so SystemSketch did not overwrite it. Use File ▸ Save As… to keep your copy, or reopen the file to take theirs.",
      });
      return;
    }
    if (live) setStatus({ tone: "error", label: describe(cause) });
    helpersRef.current.addToast({ severity: "error", title: "Could not save this board", description: describe(cause) });
  }, []);

  /* ------------------------------------------------------------- open */

  const openBoardPath = useCallback(
    async (path: string) => {
      const title = documentTitle(path);
      setStatus({ tone: "pending", label: `Loading ${title}…` });
      let loaded: WorkspaceDocument;
      try {
        loaded = await client.load(path);
      } catch (cause) {
        adoptDocument({ path, native: null, digest: null, title, readable: false });
        setStatus({ tone: "error", label: describe(cause) });
        helpersRef.current.addToast({ severity: "error", title: "Could not open that board", description: describe(cause) });
        return;
      }
      if (loaded.source === null) {
        // The host answers 200 with a null source for a path that does not
        // exist yet — which is exactly what File ▸ New reserves. The board
        // is this window's blank one and the file appears on the first save.
        adoptDocument({ path, native: null, digest: null, title, readable: true });
        setStatus({ tone: "pending", label: "New board — not written yet" });
        return;
      }
      const source = loaded.source;
      const result = withoutAutosave(() => loadBoardText(editor, source));
      if (!result.ok) {
        adoptDocument({ path, native: null, digest: loaded.digest ?? null, title, readable: false });
        setStatus({ tone: "error", label: `Could not read ${title}` });
        helpersRef.current.addToast({
          severity: "error",
          title: `Could not read “${title}”`,
          description: `${result.reason}. This window will not write over the file.`,
        });
        return;
      }
      adoptDocument({ path, native: null, digest: loaded.digest ?? null, title, readable: true });
      setStatus({ tone: "ok", label: "Saved" });
      rememberRecent(path);
    },
    [adoptDocument, client, editor, rememberRecent, withoutAutosave],
  );

  /**
   * Point THIS window (or a new one) at `path`.
   *
   * WHY a navigation and not an in-place load: "the URL is the document" is
   * the donor's own model (`LocalWorkspace.tsx:686-733`,
   * `window.location.assign(documentHref(path))`), and it is what makes a
   * board linkable, reloadable and recoverable from history. `launchConfig`'s
   * `DocumentLocation` is the seam that keeps a smoke test from navigating
   * the test runner away: it RECORDS the navigation instead.
   */
  const openDocument = useCallback(
    (path: string, target: { newWindow: boolean }) => {
      const location = documentLocation();
      // A `.systemsketch` is the archived app's ENVELOPE — a different format,
      // not a different name — so the row hands the file to the app that owns
      // it rather than failing to parse it. `.bbox` and `.tldr` both open
      // here: they are the same plain tldraw bytes under the old name and the
      // new one (Zach, 2026-09-21, "lets call this file type .bbox"), and the
      // rename deliberately did NOT touch what already opens.
      const href = documentSuffix(path) === SYSTEMSKETCH_SUFFIX ? legacyBoardHref(path) : location.boardHref(path);
      if (target.newWindow) {
        // This window keeps its own board, so there is nothing to write first
        // — and the handle must be taken inside the gesture (see `newWindow`).
        const opened = location.openWindow();
        if (!opened) {
          helpersRef.current.addToast({
            severity: "warning",
            title: "The browser blocked that window",
            description: "Allow pop-ups for this page to open a board in a second window.",
          });
          return;
        }
        opened.navigate(href);
        return;
      }
      void (async () => {
        // WHY the wait, and why leaving is refused when it fails: `assign`
        // destroys this document. A file-backed window has no IndexedDB
        // persistence behind it, so an edit still inside the autosave debounce
        // has exactly one chance to reach disk, and this is it.
        if (!(await waitForSaveRef.current())) {
          reportCouldNotLeave();
          return;
        }
        location.assign(href);
      })();
    },
    [reportCouldNotLeave],
  );

  const open = useCallback(async () => {
    if (modeRef.current === "app") {
      setNavigatorMode("open");
      return;
    }
    try {
      const picked = await native.open();
      if (!picked) return;
      const result = withoutAutosave(() => loadBoardText(editor, picked.source));
      if (!result.ok) {
        setStatus({ tone: "error", label: `Could not read ${picked.title}` });
        helpersRef.current.addToast({
          severity: "error",
          title: `Could not read “${picked.name}”`,
          description: `${result.reason}. This window will not write over the file.`,
        });
        return;
      }
      adoptDocument({ path: null, native: picked, digest: picked.digest, title: picked.title, readable: true });
      setStatus({ tone: "ok", label: "Saved" });
    } catch (cause) {
      setStatus({ tone: "error", label: describe(cause) });
      helpersRef.current.addToast({ severity: "error", title: "Could not open a board", description: describe(cause) });
    }
  }, [adoptDocument, editor, native, withoutAutosave]);

  /* ------------------------------------------------------------- save */

  const saveAsRef = useRef<() => Promise<void>>(async () => {});

  const save = useCallback(
    async (options_: { force?: boolean; auto?: boolean } = {}): Promise<SaveOutcome> => {
      const outcome = await enqueue<SaveOutcome>(async () => {
        const current = documentRef.current;
        // WHY the identity is captured HERE, beside the document this write is
        // ABOUT, and checked again at every completion: the answer can arrive
        // after the window has moved onto another file, and adopting it then
        // silently re-points the title, the save target and every later edit
        // at a board the person already left. Nothing below adopts a result it
        // is no longer entitled to.
        const epoch = documentEpochRef.current;
        if (!current.readable) {
          if (!options_.auto) {
            helpersRef.current.addToast({
              severity: "warning",
              title: "This board was not readable",
              description:
                "SystemSketch could not open this file, so it will not write over it. Use File ▸ Save As… to keep this board somewhere else.",
            });
          }
          return "skipped";
        }
        if (modeRef.current === "native") {
          // A picker is a gesture: an autosave must never raise one.
          if (!current.native) return options_.auto ? "skipped" : "needs-target";
          setStatus({ tone: "pending", label: "Saving…" });
          try {
            const source = await serializeBoard(editor);
            // Everything up to this instant is IN `source`; an edit after it
            // re-dirties the board through the store listener.
            dirtyRef.current = false;
            const next = await native.save(current.native, source, { force: options_.force });
            if (documentEpochRef.current !== epoch) return "saved";
            setDocument((previous) => ({ ...previous, native: next, digest: next.digest, title: next.title }));
            setStatus({ tone: "ok", label: "Saved" });
            return "saved";
          } catch (cause) {
            // Those bytes never landed, so the board still owes them.
            dirtyRef.current = true;
            reportSaveFailure(cause, current.native.name, documentEpochRef.current === epoch);
            return "failed";
          }
        }
        if (!current.path) return options_.auto ? "skipped" : "needs-target";
        const path = current.path;
        setStatus({ tone: "pending", label: "Saving…" });
        try {
          const source = await serializeBoard(editor);
          // Everything up to this instant is IN `source`; an edit after it
          // re-dirties the board through the store listener.
          dirtyRef.current = false;
          const saved = await client.save({
            path,
            source,
            baseDigest: current.digest,
            force: options_.force === true,
          });
          // Remembered either way: the bytes really did reach that file, and a
          // recent entry is about the disk, not about this window.
          rememberRecent(saved.path);
          if (documentEpochRef.current !== epoch) return "saved";
          setDocument((previous) => ({
            ...previous,
            path: saved.path,
            digest: saved.digest,
            title: documentTitle(saved.path),
            native: null,
          }));
          setStatus({ tone: "ok", label: "Saved" });
          return "saved";
        } catch (cause) {
          // Those bytes never landed, so the board still owes them.
          dirtyRef.current = true;
          reportSaveFailure(cause, documentTitle(path), documentEpochRef.current === epoch);
          return "failed";
        }
      });
      // WHY the picker is raised OUT here instead of inside the queued task:
      // `saveAs` queues its own write now, and a task that awaited it from
      // inside the queue would be waiting on something queued behind itself.
      if (outcome === "needs-target") await saveAsRef.current();
      return outcome;
    },
    [client, editor, enqueue, native, rememberRecent, reportSaveFailure],
  );

  const saveRef = useRef(save);
  saveRef.current = save;

  /**
   * Everything this window owes the disk, written — or `false` because it
   * could not be.
   *
   * Ported from the donor's gate in front of every navigation
   * (`/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:676-689`:
   * `await waitForSave()` and only then `window.location.assign(...)`), which
   * this rebuild left out. WHY it matters more here than there: a file-backed
   * launch turns this app's IndexedDB persistence off, so an edit still inside
   * the 600 ms debounce when the window leaves is not late, it is gone.
   */
  const waitForSave = useCallback(async (): Promise<boolean> => {
    cancelAutosave();
    if (dirtyRef.current) await saveRef.current({ auto: true });
    // Whatever was already queued — a Ctrl+S, a rename — has to land too.
    await enqueue(async () => undefined);
    return !dirtyRef.current;
  }, [cancelAutosave, enqueue]);
  waitForSaveRef.current = waitForSave;

  const saveAs = useCallback(async () => {
    if (modeRef.current === "app") {
      setNavigatorMode("saveAs");
      return;
    }
    try {
      const source = await serializeBoard(editor);
      const suggestion = fileNameFor(documentRef.current.title ?? boardNameRef.current);
      // WHY the picker runs outside the queue and only the ADOPTION is queued:
      // `showSaveFilePicker` needs the transient user activation of the gesture
      // that asked for it, and waiting on a pending save would spend it. The
      // bytes it writes land in a file this window has never touched, so they
      // cannot race anything; what has to be ordered is which document the
      // window IS afterwards — see the epoch WHY above.
      const saved = await native.saveAs(suggestion, source);
      if (!saved) return;
      await enqueue(async () => {
        adoptDocument({ path: null, native: saved, digest: saved.digest, title: saved.title, readable: true });
        setStatus({ tone: "ok", label: "Saved" });
        cancelAutosave();
      });
    } catch (cause) {
      setStatus({ tone: "error", label: describe(cause) });
      helpersRef.current.addToast({ severity: "error", title: "Could not save this board", description: describe(cause) });
    }
  }, [adoptDocument, cancelAutosave, editor, enqueue, native]);
  saveAsRef.current = saveAs;

  /** The app navigator's Save: create-only, so the host — not this window —
   *  decides whether the name is free, and a taken name comes back as a
   *  `WorkspaceConflict` the navigator turns into its own "Replace" prompt.
   *  Rejections are deliberately NOT caught here: the navigator shows them.
   *
   *  WHY the whole thing is queued: it MOVES the window onto another file, so
   *  an ordinary save still in flight must finish first. Running it beside the
   *  queue is how a stale answer got to re-adopt the old file behind it. */
  const saveAsPath = useCallback(
    (path: string, options_: { force: boolean }) =>
      enqueue(async () => {
        const source = await serializeBoard(editor);
        const saved = await client.save({ path, source, baseDigest: null, force: options_.force });
        adoptDocument({ path: saved.path, native: null, digest: saved.digest, title: documentTitle(saved.path), readable: true });
        setStatus({ tone: "ok", label: "Saved" });
        cancelAutosave();
        rememberRecent(saved.path);
        // The window now IS this file — but without a reload: the board on
        // screen is already the one on disk, so `replaceBoard` (history, no
        // navigation) is honest where `assign` would be a pointless round trip.
        documentLocation().replaceBoard(saved.path);
        setNavigatorMode(null);
      }),
    [adoptDocument, cancelAutosave, client, editor, enqueue, rememberRecent],
  );

  /* -------------------------------------------------------- new boards */

  /**
   * Reserve the next free `Untitled` name in the workspace folder.
   *
   * WHY a CLAIM as well as the listing: `nextUntitledDocumentPath` can only
   * see what is already on disk, and a brand-new board writes nothing until
   * its first save — so two windows opened seconds apart would both compute
   * `Untitled 2`. The claim is a short-lived local reservation with a TTL, so
   * a window that crashes cannot leak a name (`workspaceModel.ts`'s own WHY).
   */
  const allocateUntitled = useCallback(async (): Promise<string> => {
    const listing = await client.list();
    const storage = viewerStorage();
    const now = Date.now();
    const claimed = storage ? readUntitledClaims(now, storage) : [];
    const path = nextUntitledDocumentPath(listing.dir, [...listing.documents.map((entry) => entry.path), ...claimed]);
    if (storage) claimUntitledPath(path, now, storage);
    return path;
  }, [client]);

  const newDocument = useCallback(async () => {
    // Both modes LEAVE the document that is open: app mode navigates, native
    // mode empties this window. Either way the edits it still owes the disk go
    // with it unless they are written first.
    if (!(await waitForSaveRef.current())) {
      reportCouldNotLeave();
      return;
    }
    if (modeRef.current === "native") {
      // Native mode has no path to navigate to: a new board is this window,
      // reset to a blank document, with the previous file handle dropped.
      withoutAutosave(() => resetDocumentToBlank(editor));
      adoptDocument(NO_DOCUMENT);
      setStatus(SCRATCH_STATUS);
      return;
    }
    try {
      const path = await allocateUntitled();
      const location = documentLocation();
      location.assign(location.boardHref(path));
    } catch (cause) {
      setStatus({ tone: "error", label: describe(cause) });
      helpersRef.current.addToast({ severity: "error", title: "Could not start a new board", description: describe(cause) });
    }
  }, [adoptDocument, allocateUntitled, editor, reportCouldNotLeave, withoutAutosave]);

  const newWindow = useCallback(() => {
    const location = documentLocation();
    // WHY the window is taken BEFORE the await: "a popup opened after an
    // awaited round trip is the one Chrome blocks" (donor
    // LocalWorkspace.tsx:713-716). The window opens blank inside the gesture
    // and is pointed at a board a moment later.
    const opened = location.openWindow();
    if (!opened) {
      helpersRef.current.addToast({
        severity: "warning",
        title: "The browser blocked that window",
        description: "Allow pop-ups for this page to open a second SystemSketch window.",
      });
      return;
    }
    if (modeRef.current === "native") {
      opened.navigate(location.freshHref());
      return;
    }
    void (async () => {
      try {
        opened.navigate(location.boardHref(await allocateUntitled()));
      } catch {
        // The host is unreachable; a blank second window is still better than
        // one stuck on `about:blank`.
        opened.navigate(location.freshHref());
      }
    })();
  }, [allocateUntitled]);

  /* ----------------------------------------------------------- rename */

  const beginRename = useCallback(() => {
    setRenameError(null);
    setRenaming(true);
  }, []);

  const cancelRename = useCallback(() => {
    setRenameError(null);
    setRenaming(false);
  }, []);

  const commitRename = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      const current = documentRef.current;
      // Truthful rendering: whatever was typed, verbatim. An empty commit is
      // the one thing refused, and it is refused by keeping the old name
      // rather than by writing "".
      if (trimmed.length === 0) {
        setRenaming(false);
        return;
      }
      if (current.path === null) {
        // No file to rename (a scratch board, or native mode's opaque
        // handle): this renames the BOARD, which is tldraw's own
        // `TLDocument.name` record — the one place two writers can agree on.
        editor.updateDocumentSettings({ name: trimmed });
        setRenaming(false);
        return;
      }
      if (!current.digest) {
        setRenameError("Save this board before renaming it.");
        return;
      }
      const destination = renamedDocumentPath(current.path, trimmed);
      if (!destination) {
        setRenameError("That name cannot be used for a file.");
        return;
      }
      if (destination === current.path) {
        setRenaming(false);
        return;
      }
      const previous = current.path;
      const baseDigest = current.digest;
      // Captured beside the document being renamed, and checked again below —
      // the same rule every save completion follows.
      const epoch = documentEpochRef.current;
      setRenameBusy(true);
      void enqueue(async () => {
        try {
          const saved = await client.rename({ path: previous, destination, baseDigest });
          // The file really did move, whatever this window is showing now.
          const storage = viewerStorage();
          if (storage) setRecents(replaceRememberedDocumentPath(previous, saved.path, storage));
          if (documentEpochRef.current !== epoch) {
            setRenaming(false);
            return;
          }
          setDocument((document__) => ({
            ...document__,
            path: saved.path,
            digest: saved.digest,
            title: documentTitle(saved.path),
          }));
          documentLocation().replaceBoard(saved.path);
          setStatus({ tone: "ok", label: "Saved" });
          setRenameError(null);
          setRenaming(false);
        } catch (cause) {
          setRenameError(describe(cause));
        } finally {
          setRenameBusy(false);
        }
      });
    },
    [client, editor, enqueue],
  );

  /* ------------------------------------------------- path-only actions */

  const copyPath = useCallback(() => {
    const path = documentRef.current.path;
    if (!path) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(path);
        helpersRef.current.addToast({ severity: "success", title: "Path copied", description: path });
      } catch (cause) {
        helpersRef.current.addToast({ severity: "error", title: "Could not copy the path", description: describe(cause) });
      }
    })();
  }, []);

  const reveal = useCallback(() => {
    const path = documentRef.current.path;
    if (!path) return;
    void client.reveal(path).catch((cause: unknown) => {
      helpersRef.current.addToast({ severity: "error", title: "Could not show that file", description: describe(cause) });
    });
  }, [client]);

  const trash = useCallback(() => {
    const current = documentRef.current;
    if (!current.path || !current.digest) return;
    const path = current.path;
    const baseDigest = current.digest;
    void (async () => {
      const confirmed = await helpersRef.current.confirm({
        title: "Move to Trash",
        body: `“${documentTitle(path)}” will be moved to your system Trash. The board stays open in this window.`,
        confirmLabel: "Move to Trash",
      });
      if (!confirmed) return;
      try {
        await client.trash({ path, baseDigest });
        const storage = viewerStorage();
        if (storage) setRecents(forgetDocumentPath(path, storage));
        documentLocation().replaceBoard(null);
        adoptDocument(NO_DOCUMENT);
        setStatus(SCRATCH_STATUS);
        cancelAutosave();
      } catch (cause) {
        helpersRef.current.addToast({ severity: "error", title: "Could not move that file to Trash", description: describe(cause) });
      }
    })();
  }, [adoptDocument, cancelAutosave, client]);

  /* ------------------------------------------------------------ effects */

  // The board this window was launched on. Guarded by a ref rather than an
  // empty dependency list because React StrictMode mounts effects twice in
  // development, and loading a file twice would show its toast twice.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (mode === "native") return;
    const board = documentLocation().initialBoard();
    if (board) void openBoardPath(board);
  }, [mode, openBoardPath]);

  useEffect(() => {
    const stop = editor.store.listen(
      () => {
        if (suppressRef.current > 0) return;
        const current = documentRef.current;
        // No target, no autosave — and crucially no picker: an autosave must
        // never be the thing that raises a Save As dialog.
        if ((current.path === null && current.native === null) || !current.readable) return;
        dirtyRef.current = true;
        setStatus((previous) => (previous.tone === "error" ? previous : { tone: "pending", label: "Unsaved changes" }));
        const now = Date.now();
        const schedule = autosaveSchedule(now, pendingSinceRef.current, AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_DELAY_MS);
        pendingSinceRef.current = schedule.pendingSince;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          pendingSinceRef.current = null;
          void saveRef.current({ auto: true });
        }, schedule.delayMs);
      },
      { scope: "document", source: "user" },
    );
    return () => {
      stop();
      cancelAutosave();
    };
  }, [cancelAutosave, editor]);

  // The other way a document is left: the window itself goes away. Closing it
  // inside the 600 ms debounce used to discard the edit outright — a
  // file-backed launch has no IndexedDB persistence to catch it (see
  // `./lifecycle.ts` for which signals do what, and why).
  useEffect(
    () =>
      installUnsavedWorkGuard({
        windowTarget: window,
        documentTarget: window.document,
        hasUnsavedWork: () => dirtyRef.current || pendingWritesRef.current > 0,
        flush: () => {
          cancelAutosave();
          void saveRef.current({ auto: true });
        },
      }),
    [cancelAutosave],
  );

  // The File menu's shortcuts, actually bound. They are read through a ref so
  // the listener is attached once: re-attaching a capture listener on every
  // render is how a keystroke ends up handled twice.
  const commandsRef = useRef({ save, saveAs, open, newDocument, newWindow, beginRename });
  commandsRef.current = { save, saveAs, open, newDocument, newWindow, beginRename };

  useEffect(() => {
    /**
     * WHY the CAPTURE phase on `window`: tldraw binds its own shortcuts on
     * `document` in the bubble phase, so a capture listener here runs first
     * and `stopPropagation` keeps a chord the app owns from also reaching the
     * engine. Nothing here touches Ctrl+Z / Ctrl+⇧+Z — those stay tldraw's,
     * which is exactly what `src/menus.smoke.test.tsx` measures after the
     * undo/redo pill was removed.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const commands = commandsRef.current;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey) {
        if (key === "s") {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) void commands.saveAs();
          else void commands.save();
          return;
        }
        if (key === "o" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          void commands.open();
          return;
        }
        if (key === "n") {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) commands.newWindow();
          else void commands.newDocument();
          return;
        }
      }
      // F2 is a bare key, so unlike the chords above it must not fire while
      // someone is typing — in the rename field it would reopen itself.
      if (event.key === "F2" && !mod && !event.shiftKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        commands.beginRename();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  /* ------------------------------------------------------------ output */

  const recentEntries = useMemo<RecentEntry[]>(
    () => recents.map((path) => ({ path, title: documentTitle(path) })),
    [recents],
  );

  const file = useMemo<FileMenuCallbacks>(() => {
    const base: FileMenuCallbacks = {
      newDocument: () => void newDocument(),
      newWindow,
      open: () => void open(),
      save: () => void save(),
      saveAs: () => void saveAs(),
    };
    // WHY native mode drops five rows instead of disabling them: the File
    // System Access API hands back opaque handles — no absolute path, no
    // listing, no rename, no trash, no reveal. A row that can only ever fail
    // is worse than no row (the ask doc's dispatcher reading: "Rows whose
    // feature does not exist yet are omitted, not shown disabled").
    if (mode === "native") return base;
    return {
      ...base,
      openRecent: { entries: recentEntries, onOpen: (path) => openDocument(path, { newWindow: false }) },
      rename: beginRename,
      copyPath,
      reveal,
      trash,
      // `disabled` is STATE, not a missing feature: these three need a file
      // on disk, and a scratch board does not have one yet.
      disabled: {
        "copy-path": document_.path === null,
        reveal: document_.path === null,
        trash: document_.path === null || document_.digest === null,
      },
    };
  }, [
    beginRename,
    copyPath,
    document_.digest,
    document_.path,
    mode,
    newDocument,
    newWindow,
    open,
    openDocument,
    recentEntries,
    reveal,
    save,
    saveAs,
    trash,
  ]);

  const titleActions = useMemo<MenuAction[]>(() => {
    const rows: MenuAction[] = [
      { id: "rename", label: "Rename", icon: ChromeBarIcons.rename, run: beginRename },
      { id: "save-as", label: "Save As…", icon: ChromeBarIcons.saveAs, run: () => void saveAs() },
    ];
    if (mode === "app") {
      rows.push(
        {
          id: "copy-path",
          label: "Copy Absolute Path",
          icon: ChromeBarIcons.copyPath,
          disabled: document_.path === null,
          run: copyPath,
        },
        { id: "reveal", label: "Show in Files", icon: ChromeBarIcons.reveal, disabled: document_.path === null, run: reveal },
        {
          id: "trash",
          label: "Move to Trash…",
          icon: ChromeBarIcons.trash,
          destructive: true,
          disabled: document_.path === null || document_.digest === null,
          run: trash,
        },
      );
    }
    return rows;
  }, [beginRename, copyPath, document_.digest, document_.path, mode, reveal, saveAs, trash]);

  const navigatorProps = useMemo<FileNavigatorProps | null>(() => {
    if (navigatorMode === null) return null;
    return {
      open: true,
      onOpenChange: (next: boolean) => {
        if (!next) setNavigatorMode(null);
      },
      mode: navigatorMode,
      client,
      recents,
      onOpenDocument: (path: string, target: { newWindow: boolean }) => {
        openDocument(path, target);
        setNavigatorMode(null);
      },
      onSaveAs: saveAsPath,
      defaultName: fileNameFor(document_.title ?? boardName),
      testIdPrefix: "ss-file-navigator",
    };
  }, [boardName, client, document_.title, navigatorMode, openDocument, recents, saveAsPath]);

  return {
    title: document_.title,
    path: document_.path,
    statusTone: status.tone,
    statusLabel: status.label,
    file,
    titleActions,
    rename: {
      active: renaming,
      onBegin: beginRename,
      onCommit: commitRename,
      onCancel: cancelRename,
      error: renameError,
      busy: renameBusy,
    },
    navigatorProps,
  };
}
