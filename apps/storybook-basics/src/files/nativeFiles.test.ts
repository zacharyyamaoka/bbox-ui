// src/files/nativeFiles.test.ts — ACCEPTANCE committed by the planning lane of
// docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
// `files-kit`. Node, no DOM: the picker host is a structural fake, which is
// the whole point of `NativePickerHost` being structural.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_PICKER_ID,
  TLDR_PICKER_TYPES,
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
    expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: NATIVE_PICKER_ID, types: TLDR_PICKER_TYPES, multiple: false }));
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
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: NATIVE_PICKER_ID, suggestedName: "Untitled board.tldr", types: TLDR_PICKER_TYPES }));
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
