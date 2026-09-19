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

/** The slice of `FileSystemFileHandle` this file uses — structural, so a test
 *  (and a node run) can hand in a fake without a DOM lib. */
export interface NativeWritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
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
  createWritable(): Promise<NativeWritableLike>;
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
 * because `src/files/` imports no engine (the trunk's one rule).
 */
export const TLDR_PICKER_TYPES: readonly NativePickerType[] = Object.freeze([
  { description: "tldraw board", accept: { "application/vnd.tldraw+json": [".tldr"] } },
]);

/** One board opened or saved through the native dialog. */
export interface NativeDocument {
  handle: NativeFileHandleLike;
  /** The file name as the OS reported it, e.g. "roundtrip.tldr". */
  name: string;
  /** `name` without its `.tldr` suffix — what the chrome bar shows. */
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

const NATIVE_SUFFIX = ".tldr";

/** `.tldr` stripped case-insensitively, mirroring `workspaceModel.documentTitle`
 *  for the one suffix native mode ever sees. */
function nativeDocumentTitle(name: string): string {
  return name.toLowerCase().endsWith(NATIVE_SUFFIX) ? name.slice(0, -NATIVE_SUFFIX.length) : name;
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
          types: TLDR_PICKER_TYPES,
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

    async save(doc, source, options = {}) {
      await requestWritePermission(doc.handle);
      if (!options.force) {
        const file = await doc.handle.getFile();
        const onDiskSource = await file.text();
        const onDiskDigest = await sha256Hex(onDiskSource, host.crypto.subtle);
        if (onDiskDigest !== doc.digest) {
          throw new WorkspaceConflict(`"${doc.name}" changed on disk`, file.lastModified / 1000, onDiskDigest);
        }
      }
      const writable = await doc.handle.createWritable();
      await writable.write(source);
      await writable.close();
      return {
        handle: doc.handle,
        name: doc.name,
        title: doc.title,
        source,
        digest: await sha256Hex(source, host.crypto.subtle),
      };
    },

    async saveAs(suggestedTitle, source) {
      if (!host.showSaveFilePicker) throw new Error("showSaveFilePicker is not available");
      let handle: NativeFileHandleLike;
      try {
        handle = await host.showSaveFilePicker({
          id: NATIVE_PICKER_ID,
          suggestedName: `${suggestedTitle}${NATIVE_SUFFIX}`,
          types: TLDR_PICKER_TYPES,
        });
      } catch (cause) {
        if (isPickerCancellation(cause)) return null;
        throw cause;
      }
      const writable = await handle.createWritable();
      await writable.write(source);
      await writable.close();
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
