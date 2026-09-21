// src/files/nativeFiles.test.ts — ACCEPTANCE committed by the planning lane of
// docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
// `files-kit`. Node, no DOM: the picker host is a structural fake, which is
// the whole point of `NativePickerHost` being structural.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_PICKER_ID,
  BOARD_PICKER_TYPES,
  createNativeFileAccess,
  isNativeFileAccessSupported,
  sha256Hex,
  type NativeFileHandleLike,
  type NativePickerHost,
} from "./nativeFiles";
import { WorkspaceConflict } from "./workspaceClient";

interface Fake extends NativeFileHandleLike {
  content: string;
  writes: string[];
  permission: "granted" | "denied" | "prompt";
}

function fakeHandle(name: string, content = "", permission: Fake["permission"] = "granted"): Fake {
  const handle: Fake = {
    kind: "file",
    name,
    content,
    writes: [],
    permission,
    async getFile() {
      return { name: handle.name, lastModified: 1_758_000_000_000, text: async () => handle.content };
    },
    async createWritable() {
      let buffer = "";
      return {
        async write(data: string) {
          buffer += data;
        },
        async close() {
          handle.content = buffer;
          handle.writes.push(buffer);
        },
      };
    },
    queryPermission: vi.fn(async () => handle.permission),
    requestPermission: vi.fn(async () => handle.permission),
  };
  return handle;
}

const abort = () => Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function host(overrides: Partial<NativePickerHost> = {}): NativePickerHost {
  return { crypto: globalThis.crypto, ...overrides };
}

describe("native file access", () => {
  it("is supported only where both pickers exist", () => {
    expect(isNativeFileAccessSupported(null)).toBe(false);
    expect(isNativeFileAccessSupported({})).toBe(false);
    expect(isNativeFileAccessSupported({ showOpenFilePicker: async () => [] })).toBe(false);
    expect(isNativeFileAccessSupported({ showOpenFilePicker: async () => [], showSaveFilePicker: async () => fakeHandle("x.tldr") })).toBe(true);
    expect(createNativeFileAccess(host()).supported).toBe(false);
  });

  it("hashes exactly like the file host's document_digest (SHA-256 of the UTF-8 bytes)", async () => {
    for (const text of ["", "{}", '{"name":"Ω board"}\n', "a\r\nb"]) {
      expect(await sha256Hex(text, globalThis.crypto.subtle)).toBe(sha(text));
    }
  });

  it("opens through showOpenFilePicker with the .tldr filter and a remembered directory id", async () => {
    const picked = fakeHandle("Board.tldr", '{"records":[]}');
    const showOpenFilePicker = vi.fn(async () => [picked]);
    const files = createNativeFileAccess(host({ showOpenFilePicker, showSaveFilePicker: vi.fn() }));
    const doc = await files.open();
    expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: NATIVE_PICKER_ID, types: BOARD_PICKER_TYPES, multiple: false }));
    expect(doc).toMatchObject({ name: "Board.tldr", title: "Board", source: '{"records":[]}', digest: sha('{"records":[]}') });
    expect(doc!.handle).toBe(picked);
  });

  it("treats a dismissed picker as nothing chosen, and any other failure as an error", async () => {
    const files = createNativeFileAccess(host({ showOpenFilePicker: abort, showSaveFilePicker: abort }));
    await expect(files.open()).resolves.toBeNull();
    await expect(files.saveAs("Board", "{}")).resolves.toBeNull();
    const broken = createNativeFileAccess(host({ showOpenFilePicker: () => Promise.reject(new DOMException("nope", "SecurityError")), showSaveFilePicker: abort }));
    await expect(broken.open()).rejects.toMatchObject({ name: "SecurityError" });
  });

  it("saves as <title>.tldr through showSaveFilePicker and writes the bytes it was given", async () => {
    const target = fakeHandle("Picked Name.tldr");
    const showSaveFilePicker = vi.fn(async () => target);
    const files = createNativeFileAccess(host({ showOpenFilePicker: vi.fn(), showSaveFilePicker }));
    const doc = await files.saveAs("Untitled board", '{"v":1}');
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: NATIVE_PICKER_ID, suggestedName: "Untitled board.bbox", types: BOARD_PICKER_TYPES }));
    expect(target.writes).toEqual(['{"v":1}']);
    expect(doc).toMatchObject({ name: "Picked Name.tldr", title: "Picked Name", source: '{"v":1}', digest: sha('{"v":1}') });
  });

  it("writes back through the same handle when the disk still holds what this window last read", async () => {
    const handle = fakeHandle("Board.tldr", "v1");
    const files = createNativeFileAccess(host({ showOpenFilePicker: async () => [handle], showSaveFilePicker: vi.fn() }));
    const opened = (await files.open())!;
    const saved = await files.save(opened, "v2");
    expect(handle.writes).toEqual(["v2"]);
    expect(saved).toMatchObject({ source: "v2", digest: sha("v2") });
    const again = await files.save(saved, "v3");
    expect(handle.writes).toEqual(["v2", "v3"]);
    expect(again.digest).toBe(sha("v3"));
  });

  it("refuses to clobber a file changed underneath it — WorkspaceConflict, nothing written — unless forced", async () => {
    const handle = fakeHandle("Board.tldr", "v1");
    const files = createNativeFileAccess(host({ showOpenFilePicker: async () => [handle], showSaveFilePicker: vi.fn() }));
    const opened = (await files.open())!;
    handle.content = "someone else";
    const refused = files.save(opened, "mine");
    await expect(refused).rejects.toBeInstanceOf(WorkspaceConflict);
    await expect(refused).rejects.toMatchObject({ diskDigest: sha("someone else"), diskMtime: 1_758_000_000 });
    expect(handle.writes).toEqual([]);
    expect(handle.content).toBe("someone else");
    await files.save(opened, "mine", { force: true });
    expect(handle.content).toBe("mine");
  });

  it("asks for write permission when it is not already granted, and refuses without it", async () => {
    const handle = fakeHandle("Board.tldr", "v1", "prompt");
    const files = createNativeFileAccess(host({ showOpenFilePicker: async () => [handle], showSaveFilePicker: vi.fn() }));
    const opened = (await files.open())!;
    await expect(files.save(opened, "v2")).rejects.toBeTruthy();
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(handle.writes).toEqual([]);
    handle.permission = "granted";
    await files.save(opened, "v2");
    expect(handle.writes).toEqual(["v2"]);
  });
});

/* ---------------------------------------------------------------------------
 * P1-5 — the compare/write race, added 2026-09-19 after an independent judge
 * ran the implementation in memory and got TWO fulfilled saves, TWO writes and
 * only the second window's board surviving.
 *
 * These fakes model what the File System Access API actually does, which the
 * simple `fakeHandle` above does not:
 *   - a read SNAPSHOTS the bytes and can then be descheduled (`afterRead`),
 *     which is the whole bug: the digest a save compares is a statement about
 *     the past, and the write happens in the future;
 *   - `close()` is the COMMIT (the swap file is moved over the target) and
 *     `abort()` throws the swap file away — so a save that closes a stream it
 *     should have aborted shows up here as the file it destroyed, and a save
 *     that merely stops calling `write` would still have truncated the board
 *     to zero bytes;
 *   - `mode: "exclusive"` is a real lock: a second `createWritable` while one
 *     is open rejects with `NoModificationAllowedError`.
 */
interface FakeDisk {
  content: string;
  lastModified: number;
  /** One entry per COMMITTED write, in commit order. */
  writes: string[];
  aborts: number;
  /** Whether this fake honours `mode: "exclusive"`. */
  exclusive: boolean;
  openWritables: number;
}

interface FakeWindowHandle extends NativeFileHandleLike {
  createWritableCalls: unknown[];
}

function fakeDisk(content: string): FakeDisk {
  return { content, lastModified: 1_758_000_000_000, writes: [], aborts: 0, exclusive: false, openWritables: 0 };
}

/** One window's handle onto `disk`. Two windows = two handles, one disk. */
function windowHandle(disk: FakeDisk, name: string, hooks: { afterRead?: () => Promise<void> } = {}): FakeWindowHandle {
  const handle: FakeWindowHandle = {
    kind: "file",
    name,
    createWritableCalls: [],
    async getFile() {
      const snapshot = disk.content;
      const stamp = disk.lastModified;
      return {
        name,
        lastModified: stamp,
        async text() {
          await hooks.afterRead?.();
          return snapshot;
        },
      };
    },
    async createWritable(options?: unknown) {
      handle.createWritableCalls.push(options);
      if (disk.exclusive && disk.openWritables > 0) {
        throw new DOMException(`The file "${name}" is locked.`, "NoModificationAllowedError");
      }
      disk.openWritables += 1;
      let swap = "";
      let settled = false;
      return {
        async write(data: string) {
          swap += data;
        },
        async close() {
          if (settled) return;
          settled = true;
          disk.openWritables -= 1;
          disk.content = swap;
          disk.lastModified += 1_000;
          disk.writes.push(swap);
        },
        async abort() {
          if (settled) return;
          settled = true;
          disk.openWritables -= 1;
          disk.aborts += 1;
        },
      };
    },
  };
  return handle;
}

describe("native save under a concurrent writer", () => {
  it("refuses a write it can only discover is stale AFTER it has taken the file — two windows, one board", async () => {
    const disk = fakeDisk("v1");
    const handleA = windowHandle(disk, "Board.tldr");

    let reads = 0;
    let releaseB = () => {};
    const bMayResume = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    let bHasCompared = () => {};
    const bIsParked = new Promise<void>((resolve) => {
      bHasCompared = resolve;
    });
    // Park window B's SAVE-time read after it has snapshotted "v1" — the
    // descheduling that turns its base digest into a statement about the past.
    const handleB = windowHandle(disk, "Board.tldr", {
      async afterRead() {
        reads += 1;
        if (reads !== 2) return; // 1 = open(), 2 = the save's compare
        bHasCompared();
        await bMayResume;
      },
    });

    const windowA = createNativeFileAccess(host({ showOpenFilePicker: async () => [handleA], showSaveFilePicker: vi.fn() }));
    const windowB = createNativeFileAccess(host({ showOpenFilePicker: async () => [handleB], showSaveFilePicker: vi.fn() }));
    const docA = (await windowA.open())!;
    const docB = (await windowB.open())!;
    expect(docA.digest).toBe(docB.digest);

    const saveB = windowB
      .save(docB, "B's board")
      .then((value) => ({ ok: true as const, value }), (cause) => ({ ok: false as const, cause }));
    await bIsParked;

    // A's whole save lands while B is holding a digest that is no longer true.
    await windowA.save(docA, "A's board");
    expect(disk.content).toBe("A's board");

    releaseB();
    const outcome = await saveB;
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.cause).toBeInstanceOf(WorkspaceConflict);
    expect(disk.writes).toEqual(["A's board"]);
    expect(disk.content).toBe("A's board");
    // Never closed: closing an unwritten stream would have committed an empty
    // swap file over the board.
    expect(disk.aborts).toBe(1);
  });

  it("orders two saves through one handle instead of letting both compare against the same stale digest", async () => {
    const disk = fakeDisk("v1");
    const handle = windowHandle(disk, "Board.tldr");
    const files = createNativeFileAccess(host({ showOpenFilePicker: async () => [handle], showSaveFilePicker: vi.fn() }));
    const opened = (await files.open())!;

    const settled = await Promise.allSettled([files.save(opened, "first"), files.save(opened, "second")]);
    expect(settled[0]!.status).toBe("fulfilled");
    expect(settled[1]!.status).toBe("rejected");
    expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceConflict);
    expect(disk.writes).toEqual(["first"]);
    expect(disk.content).toBe("first");
  });

  it("asks the browser for the exclusive write lock, and turns a locked file into a loud refusal", async () => {
    const disk = fakeDisk("v1");
    const handle = windowHandle(disk, "Board.tldr");
    const files = createNativeFileAccess(host({ showOpenFilePicker: async () => [handle], showSaveFilePicker: vi.fn() }));
    const opened = (await files.open())!;
    await files.save(opened, "v2");
    expect(handle.createWritableCalls).toEqual([expect.objectContaining({ mode: "exclusive" })]);

    const contested = fakeDisk("v1");
    contested.exclusive = true;
    contested.openWritables = 1; // another window's stream is open right now
    const blocked = windowHandle(contested, "Board.tldr");
    const other = createNativeFileAccess(host({ showOpenFilePicker: async () => [blocked], showSaveFilePicker: vi.fn() }));
    const doc = (await other.open())!;
    await expect(other.save(doc, "mine")).rejects.toThrow(/another window/i);
    expect(contested.writes).toEqual([]);
    expect(contested.content).toBe("v1");
  });
});
