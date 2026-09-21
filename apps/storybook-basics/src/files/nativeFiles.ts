// src/files/nativeFiles.ts — "native" file navigation: the browser's File
// System Access pickers, which on this machine ARE the operating system's own
// open/save dialogs. No server, no paths.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// the functions THROW until lane `files-kit` fills them in.
// `nativeFiles.test.ts` is the acceptance and is off-limits to the builder.
//
// Zach, 2026-09-19: "also for file navigation please give the build in [the
// built-in, native dialog] … in settings you can have a toggle wether for
// file navigation to use native or our app one". This is the native side.
//
// WHY the browser's picker and NOT a desktop chooser spawned by the file host
// (zenity/kdialog): the archive measured that road and closed it —
// "A GUI subprocess run inside an HTTP handler makes a second application a
// hard dependency of File > Open: when zenity wedged, the request never
// returned and the whole Open path wedged with it"
// (`/home/bam/systemsketch/tests/test_workspace_store.py:897-908`). Chrome's
// `showOpenFilePicker` is the OS dialog with no second process of ours in the
// request path; `scripts/tests/test_systemsketch_files.py` keeps the archive's
// "no chooser in the host" guard.
//
// WHY this is NOT a second `WorkspaceClient`: the File System Access API hands
// back opaque handles — no absolute path, no directory listing, no rename,
// trash or reveal. Implementing `list/stat/rename/trash/reveal/
// createDirectory` over it would mean shipping methods that can only throw.
// What BOTH modes honestly share is the document-level contract — load, save
// with a base digest, and `WorkspaceConflict` when the bytes on disk are not
// the bytes this window last read or wrote — and that is exactly what this
// file implements with the same error class and the same digest (SHA-256 of
// the file's UTF-8 bytes, the host's `document_digest`).
import { WorkspaceConflict } from "./workspaceClient";
import { BBOX_SUFFIX, DOCUMENT_SUFFIXES, TLDRAW_SUFFIX } from "./workspaceModel";

/** The slice of `FileSystemFileHandle` this file uses — structural, so a test
 *  (and a node run) can hand in a fake without a DOM lib. */
export interface NativeWritableLike {
  write(data: string): Promise<void>;
  /** The COMMIT: the swap file is moved over the target. */
  close(): Promise<void>;
  /** Throws the swap file away, leaving the target untouched. Optional only
   *  because the interface is structural; every real
   *  `FileSystemWritableFileStream` has it (it extends `WritableStream`).
   *  WHY a save must abort and never close on a conflict: `createWritable`
   *  starts from an EMPTY swap file (`keepExistingData` defaults to false),
   *  so closing a stream nothing was written to commits zero bytes over the
   *  board — the loudest possible version of the damage this file exists to
   *  prevent. */
  abort?(reason?: unknown): Promise<void>;
}

/** The options `createWritable` accepts. `mode` is the File System Access
 *  API's own write lock; an implementation that does not know the member
 *  ignores it (WebIDL dictionaries drop unrecognised keys), which is why it
 *  is safe to ask for unconditionally and unsafe to rely on. */
export interface NativeWritableOptions {
  mode?: "exclusive" | "siloed";
  keepExistingData?: boolean;
}

export interface NativeFileLike {
  name: string;
  lastModified: number;
  text(): Promise<string>;
}

export interface NativeFileHandleLike {
  kind?: "file";
  name: string;
  getFile(): Promise<NativeFileLike>;
  createWritable(options?: NativeWritableOptions): Promise<NativeWritableLike>;
  queryPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
}

export interface NativePickerType {
  description: string;
  accept: Record<string, readonly string[]>;
}

export interface NativeOpenPickerOptions {
  id?: string;
  multiple?: false;
  excludeAcceptAllOption?: boolean;
  types?: readonly NativePickerType[];
}

export interface NativeSavePickerOptions {
  id?: string;
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: readonly NativePickerType[];
}

/** What of `window` this file touches. */
export interface NativePickerHost {
  showOpenFilePicker?(options?: NativeOpenPickerOptions): Promise<NativeFileHandleLike[]>;
  showSaveFilePicker?(options?: NativeSavePickerOptions): Promise<NativeFileHandleLike>;
  crypto: { subtle: Pick<SubtleCrypto, "digest"> };
}

/**
 * Chrome remembers the last directory PER `id`, so every open and save of a
 * board starts where the previous one ended — the closest the native dialog
 * gets to the app navigator's "SystemSketch" place.
 */
export const NATIVE_PICKER_ID = "systemsketch-boards";

/**
 * `application/vnd.tldraw+json` is tldraw's own `TLDRAW_FILE_MIMETYPE`
 * (tldraw 5.3.2, `lib/utils/tldr/file.ts`) — spelled out rather than imported
 * because `src/files/` imports no engine (the trunk's one rule). A `.bbox`
 * carries those exact bytes under a different name, so both extensions sit on
 * the one MIME type rather than inventing a second one that would describe the
 * same document.
 *
 * WHY `.bbox` is listed FIRST, and why `.tldr` is still listed at all: the
 * first entry is what Chrome pre-selects and appends in Save As, so leading
 * with `.bbox` is what makes the rename real in the OS dialog; keeping `.tldr`
 * is what keeps the 31 boards this build already wrote selectable in Open
 * instead of greyed out. Zach, 2026-09-21: "lets call this file type .bbox".
 */
export const BOARD_PICKER_TYPES: readonly NativePickerType[] = Object.freeze([
  { description: "bbox board", accept: { "application/vnd.tldraw+json": [BBOX_SUFFIX, TLDRAW_SUFFIX] } },
]);

/** One board opened or saved through the native dialog. */
export interface NativeDocument {
  handle: NativeFileHandleLike;
  /** The file name as the OS reported it, e.g. "roundtrip.bbox". */
  name: string;
  /** `name` without its board suffix — what the chrome bar shows. */
  title: string;
  /** The text last read from, or written to, the file. */
  source: string;
  /** `sha256Hex(source)` — the fence the next `save` checks the disk against. */
  digest: string;
}

export interface NativeFileAccess {
  /** `isNativeFileAccessSupported(host)` at construction. When false every
   *  method rejects with an Error naming the missing API. */
  readonly supported: boolean;
  /** `showOpenFilePicker({id, types, excludeAcceptAllOption: false, multiple:
   *  false})`, then read the file. A cancelled picker (an `AbortError`)
   *  resolves `null`; any other failure rejects. */
  open(): Promise<NativeDocument | null>;
  /**
   * Write `source` to `doc.handle` — but first re-read the file and compare
   * its digest to `doc.digest`; different → reject `WorkspaceConflict`
   * (diskDigest = the file's current digest, diskMtime = its lastModified in
   * SECONDS) and write NOTHING, unless `force`. Permission: if the handle
   * has `queryPermission` and it is not "granted", `requestPermission({mode:
   * "readwrite"})` first; not granted → reject. Resolves the new document
   * (same handle, new source/digest).
   *
   * The comparison happens TWICE — once before the stream is taken and once
   * inside it, immediately before the bytes are written — and writes through
   * one handle are serialised. See the WHY at the implementation: the API has
   * no compare-and-swap, so this narrows the window and refuses loudly rather
   * than pretending the write is atomic.
   */
  save(doc: NativeDocument, source: string, options?: { force?: boolean }): Promise<NativeDocument>;
  /** `showSaveFilePicker({id, suggestedName: <title>.tldr, types})`, then write
   *  unconditionally (the OS dialog already asked "Replace?"). Cancel → null. */
  saveAs(suggestedTitle: string, source: string): Promise<NativeDocument | null>;
}

export function isNativeFileAccessSupported(host: Partial<NativePickerHost> | null | undefined): boolean {
  return typeof host?.showOpenFilePicker === "function" && typeof host?.showSaveFilePicker === "function";
}

/** Lower-case hex SHA-256 of `text`'s UTF-8 bytes — byte-identical to the
 *  Python host's `document_digest` (`hashlib.sha256(text.encode()).hexdigest()`). */
export async function sha256Hex(text: string, subtle: Pick<SubtleCrypto, "digest">): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The suffix Save As appends. The pickers still OPEN every suffix in
 *  `DOCUMENT_SUFFIXES` — this is only what a NEW file is named. */
const NATIVE_SUFFIX: string = BBOX_SUFFIX;

/**
 * Every stream this file opens asks for the File System Access API's own
 * write lock. It is the only thing in the API that actually serialises two
 * windows of this app, and a browser that has not implemented the member
 * simply drops it, so asking costs nothing and can never fail a save that
 * would otherwise have worked.
 */
const EXCLUSIVE_WRITE: NativeWritableOptions = Object.freeze({ mode: "exclusive" });

/**
 * One write at a time per handle.
 *
 * WHY here and not only in the app: `session.tsx` already chains its own
 * saves, but this module must not depend on its caller to be safe. Two
 * `save()` calls started together both read the file, both saw the base
 * digest they expected, and both committed — the cross-window race with a
 * shorter fuse. Chained, the second re-reads after the first has committed,
 * sees bytes it never read, and refuses with `WorkspaceConflict`.
 *
 * LIMIT, stated rather than implied: this is keyed by the handle OBJECT, so
 * it orders writers that share a handle inside this JavaScript realm. A
 * second tab has its own realm and its own handle object; that case is what
 * `EXCLUSIVE_WRITE` and the second comparison below are for.
 */
const writeChains = new WeakMap<NativeFileHandleLike, Promise<unknown>>();

function serializeWrites<T>(handle: NativeFileHandleLike, task: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(handle) ?? Promise.resolve();
  const run = previous.then(task, task);
  writeChains.set(
    handle,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** `createWritable` rejecting because someone else holds the write lock. */
function isWriteLockFailure(cause: unknown): boolean {
  return (
    typeof cause === "object" && cause !== null && (cause as { name?: unknown }).name === "NoModificationAllowedError"
  );
}

/**
 * Throw the swap file away. WHY this and never `close()` on a failure path:
 * `createWritable` starts from an empty swap file, and `close()` is the
 * commit — a stream closed without its bytes replaces the board with zero
 * bytes. A failure to abort is swallowed because the error already being
 * thrown is the one the person needs to see.
 */
async function discardWritable(writable: NativeWritableLike): Promise<void> {
  try {
    await writable.abort?.();
  } catch {
    /* the stream is being dropped either way */
  }
}

/** Any known board suffix stripped case-insensitively, mirroring
 *  `workspaceModel.documentTitle`.
 *
 *  WHY it sweeps `DOCUMENT_SUFFIXES` rather than just the one we write: native
 *  mode now sees more than one suffix, and a chrome bar reading
 *  "series_a_pose_pipeline_v7.tldr" instead of "series_a_pose_pipeline_v7"
 *  is exactly the kind of quiet regression a rename leaves behind. */
function nativeDocumentTitle(name: string): string {
  const lowered = name.toLowerCase();
  const suffix = DOCUMENT_SUFFIXES.find((candidate) => lowered.length > candidate.length && lowered.endsWith(candidate));
  return suffix ? name.slice(0, -suffix.length) : name;
}

/** A picker's own `AbortError` — cancel — vs. every other failure, which is
 *  a real error the caller must see. */
function isPickerCancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

async function requestWritePermission(handle: NativeFileHandleLike): Promise<void> {
  if (!handle.queryPermission) return;
  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return;
  const requested = handle.requestPermission
    ? await handle.requestPermission({ mode: "readwrite" })
    : current;
  if (requested !== "granted") {
    throw new Error(`permission to write "${handle.name}" was not granted`);
  }
}

export function createNativeFileAccess(host: NativePickerHost): NativeFileAccess {
  const supported = isNativeFileAccessSupported(host);

  /**
   * Read the file AS IT IS RIGHT NOW and refuse if it is not the file `doc`
   * was read from. `WorkspaceConflict` is deliberately the same class the
   * HTTP client raises from the host's 409, carrying the same two fields, so
   * `reportSaveFailure` shows the identical "changed on disk — nothing was
   * overwritten" toast whichever mode the person is in.
   */
  async function refuseIfChangedOnDisk(doc: NativeDocument): Promise<void> {
    const file = await doc.handle.getFile();
    const onDiskSource = await file.text();
    const onDiskDigest = await sha256Hex(onDiskSource, host.crypto.subtle);
    if (onDiskDigest !== doc.digest) {
      throw new WorkspaceConflict(`"${doc.name}" changed on disk`, file.lastModified / 1000, onDiskDigest);
    }
  }

  /**
   * Take the write lock. A refusal because another window holds it is turned
   * into a sentence a person can act on — and is left LOUD rather than
   * retried: a refused save is recoverable, a save that quietly waits and
   * then overwrites is not.
   */
  async function takeWritable(handle: NativeFileHandleLike): Promise<NativeWritableLike> {
    try {
      return await handle.createWritable(EXCLUSIVE_WRITE);
    } catch (cause) {
      if (!isWriteLockFailure(cause)) throw cause;
      const refusal = new Error(
        `“${handle.name}” is being written by another window right now, so nothing was saved. Try again in a moment.`,
      );
      (refusal as { cause?: unknown }).cause = cause;
      throw refusal;
    }
  }

  async function readDocument(handle: NativeFileHandleLike): Promise<NativeDocument> {
    const file = await handle.getFile();
    const source = await file.text();
    return {
      handle,
      name: file.name,
      title: nativeDocumentTitle(file.name),
      source,
      digest: await sha256Hex(source, host.crypto.subtle),
    };
  }

  return {
    supported,

    async open() {
      if (!host.showOpenFilePicker) throw new Error("showOpenFilePicker is not available");
      let handles: NativeFileHandleLike[];
      try {
        handles = await host.showOpenFilePicker({
          id: NATIVE_PICKER_ID,
          types: BOARD_PICKER_TYPES,
          excludeAcceptAllOption: false,
          multiple: false,
        });
      } catch (cause) {
        if (isPickerCancellation(cause)) return null;
        throw cause;
      }
      const [handle] = handles;
      if (!handle) return null;
      return readDocument(handle);
    },

    save(doc, source, options = {}) {
      // WHY the file is compared TWICE, and why the second comparison sits
      // AFTER `createWritable`: between reading the bytes and committing new
      // ones there is a window in which another window of this app — a second
      // tab, a second desktop window, each with its own save queue — commits
      // its own. An independent judge ran the single-comparison version of
      // this function in memory on 2026-09-19 and got two fulfilled saves,
      // two writes, and only the second window's board left on disk: a board
      // destroyed with no error anywhere. That is the one failure the plan
      // weights at 25% — "a lost board is unrecoverable, a missing feature is
      // not" (docs/CHROME-FILES-SETTINGS-PLAN.md).
      //
      // HONEST LIMIT, because this cannot be made airtight and pretending
      // otherwise is worse than the gap: the File System Access API has no
      // compare-and-swap. Nothing here makes "the digest still matches" and
      // "these bytes are committed" one operation. What it does instead is
      // the three things the API does offer, and it fails loudly for the rest:
      //   1. writers sharing a handle are serialised (`serializeWrites`);
      //   2. the stream is taken with the API's own exclusive write lock,
      //      the only real cross-window serialisation on offer — and one a
      //      browser may not implement, so it narrows the race rather than
      //      closing it;
      //   3. the digest is re-read INSIDE that lock, immediately before the
      //      bytes go out, so a writer that committed while this save was
      //      queued, waiting on a permission prompt or serialising a board is
      //      seen and refused.
      // Left uncovered: a writer this browser cannot lock out (the archive
      // app, an editor, rsync) committing between that second comparison and
      // `close()`. Nothing in the API can see it, so it is NOT quietly
      // absorbed — everything this code can see ends in `WorkspaceConflict`
      // and an untouched file.
      //
      // WHY the second comparison is not moved after `write()` — later still,
      // and tempting: nothing measured on this machine proves `getFile()`
      // reports the target rather than the swap file while our own stream is
      // open. If it reported the swap, every save would read back its own new
      // bytes, call them a conflict and refuse — trading a rare silent
      // overwrite for a permanent inability to save anything. Immediately
      // before `write()` is the latest instant that is correct under both
      // readings.
      return serializeWrites(doc.handle, async () => {
        await requestWritePermission(doc.handle);
        if (!options.force) await refuseIfChangedOnDisk(doc);
        const writable = await takeWritable(doc.handle);
        try {
          if (!options.force) await refuseIfChangedOnDisk(doc);
          await writable.write(source);
          await writable.close();
        } catch (cause) {
          // Abort, never close: see `discardWritable`.
          await discardWritable(writable);
          throw cause;
        }
        return {
          handle: doc.handle,
          name: doc.name,
          title: doc.title,
          source,
          digest: await sha256Hex(source, host.crypto.subtle),
        };
      });
    },

    async saveAs(suggestedTitle, source) {
      if (!host.showSaveFilePicker) throw new Error("showSaveFilePicker is not available");
      let handle: NativeFileHandleLike;
      try {
        handle = await host.showSaveFilePicker({
          id: NATIVE_PICKER_ID,
          suggestedName: `${suggestedTitle}${NATIVE_SUFFIX}`,
          types: BOARD_PICKER_TYPES,
        });
      } catch (cause) {
        if (isPickerCancellation(cause)) return null;
        throw cause;
      }
      // The picker already asked "Replace?", so there is no digest to compare
      // here — but the stream is still taken under the exclusive lock and
      // still aborted rather than closed if the write fails, so a Save As
      // over a file another window is writing is refused instead of racing
      // it, and a half-written stream never commits an empty file.
      const writable = await takeWritable(handle);
      try {
        await writable.write(source);
        await writable.close();
      } catch (cause) {
        await discardWritable(writable);
        throw cause;
      }
      return {
        handle,
        name: handle.name,
        title: nativeDocumentTitle(handle.name),
        source,
        digest: await sha256Hex(source, host.crypto.subtle),
      };
    },
  };
}
