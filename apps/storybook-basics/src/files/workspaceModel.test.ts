// src/files/workspaceModel.test.ts — ACCEPTANCE committed by the planning lane
// of docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
// `files-kit`.
//
// A PORT of the donor's own suite, `/home/bam/systemsketch/src/workspace/
// workspaceModel.test.ts:1-340` (an independent oracle — written against the
// donor, before this port), with exactly these changes:
//   - cases for functions deliberately NOT ported are dropped (the envelope,
//     `exportedTldrawPath`, `workspaceBrowserDirectory`, the external-reload
//     fences `nextSyncAction`/`canApplyExternalReload`);
//   - the new-document default is `.bbox` here (workspaceModel.ts header, and
//     Zach's 2026-09-21 ruling "lets call this file type .bbox"), so the donor
//     cases that pinned `.systemsketch` as the default pin `.bbox` instead —
//     and still prove a typed known suffix is honoured. The suffixes this
//     build no longer WRITES (`.systemsketch`, `.tldr`) keep their own cases,
//     because "still opens" is the half of the rename that can silently
//     regress;
//   - storage/`now`/`base` are passed explicitly (the port takes no
//     `window` default);
//   - the formatting helpers from LocalWorkspace.tsx:1662-1688 gain cases.
import { describe, expect, it } from "vitest";

import {
  autosaveRetryDelay,
  BBOX_SUFFIX,
  autosaveSchedule,
  breadcrumbTrail,
  browserRows,
  claimUntitledPath,
  DEFAULT_NEW_DOCUMENT_SUFFIX,
  DOCUMENT_SUFFIXES,
  documentEncoding,
  documentHref,
  documentPathFor,
  documentSuffix,
  documentTitle,
  forgetDocumentPath,
  formatFileSize,
  formatRelativeDay,
  moveBrowserSelection,
  nextUntitledDocumentPath,
  parentDirectory,
  readRecentDocumentPaths,
  readUntitledClaims,
  rememberDocumentPath,
  renamedDocumentPath,
  replaceRememberedDocumentPath,
  resolveBrowserSelection,
} from "./workspaceModel";

function memoryStorage(initial = "[]") {
  let stored: string | null = initial;
  return {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };
}

describe("local workspace model", () => {
  it("makes new documents .bbox and honours a typed .tldr or .systemsketch", () => {
    expect(DEFAULT_NEW_DOCUMENT_SUFFIX).toBe(BBOX_SUFFIX);
    expect(documentPathFor("/home/zach/SystemSketch", "API map")).toBe("/home/zach/SystemSketch/API map.bbox");
    expect(documentPathFor("/home/zach/SystemSketch", "API map.bbox")).toBe("/home/zach/SystemSketch/API map.bbox");
    expect(documentPathFor("/home/zach/SystemSketch", "API map.tldr")).toBe("/home/zach/SystemSketch/API map.tldr");
    expect(documentPathFor("/home/zach/SystemSketch", "Legacy.systemsketch")).toBe("/home/zach/SystemSketch/Legacy.systemsketch");
    expect(documentPathFor("/home/zach/SystemSketch", "../bad/name")).toBe("/home/zach/SystemSketch/-bad-name.bbox");
    expect(documentPathFor("/home/zach/SystemSketch", "Board", ".systemsketch")).toBe("/home/zach/SystemSketch/Board.systemsketch");
    expect(documentPathFor("/home/zach/SystemSketch", "   ")).toBeNull();
  });

  // The half of the rename that can regress in silence: nothing ON DISK moved,
  // so every suffix that opened before this ruling still has to open after it.
  it("still opens every extension already on disk — 84 .systemsketch and 31 .tldr boards", () => {
    expect([...DOCUMENT_SUFFIXES]).toEqual([".bbox", ".systemsketch", ".tldr"]);
    expect(documentSuffix("/home/bam/SystemSketch/bbox-ui-v3.systemsketch")).toBe(".systemsketch");
    expect(documentSuffix("/home/bam/SystemSketch/02_literal_argument.tldr")).toBe(".tldr");
    expect(documentSuffix("/home/bam/SystemSketch/Arm.bbox")).toBe(".bbox");
    expect(documentSuffix("/home/bam/SystemSketch/Arm.BBOX")).toBe(".bbox");
    expect(documentSuffix("/home/bam/SystemSketch/notes.json")).toBeNull();
    // A bare ".bbox" is a dotfile, not a board — the length guard, kept.
    expect(documentSuffix("/home/bam/SystemSketch/.bbox")).toBeNull();
    expect(documentTitle("/home/bam/SystemSketch/Arm.bbox")).toBe("Arm");
    expect(documentEncoding("/boards/Map.bbox")).toBe("tldraw");
    expect(renamedDocumentPath("/boards/Old.systemsketch", "New")).toBe("/boards/New.systemsketch");
    expect(renamedDocumentPath("/boards/Old.bbox", "New")).toBe("/boards/New.bbox");
  });

  it("reads a title out of either extension, and renaming never changes the type", () => {
    expect(documentTitle("/home/zach/SystemSketch/New.systemsketch")).toBe("New");
    expect(documentTitle("/home/zach/SystemSketch/Legacy.tldr")).toBe("Legacy");
    expect(documentSuffix("/home/zach/SystemSketch/Legacy.TLDR")).toBe(".tldr");
    expect(documentSuffix("/home/zach/SystemSketch/notes.json")).toBe(null);
    expect(documentSuffix("C:\\goldens\\01\\target.systemsketch")).toBe(".systemsketch");
    expect(renamedDocumentPath("/home/zach/SystemSketch/Old.tldr", "New")).toBe("/home/zach/SystemSketch/New.tldr");
    expect(renamedDocumentPath("/home/zach/SystemSketch/Old.systemsketch", "New")).toBe("/home/zach/SystemSketch/New.systemsketch");
    expect(documentEncoding("/boards/Map.systemsketch")).toBe("systemsketch");
    expect(documentEncoding("/boards/Map.tldr")).toBe("tldraw");
    expect(parentDirectory("/boards/Map.tldr")).toBe("/boards");
    expect(parentDirectory("/Map.tldr")).toBe("/");
  });

  it("allocates the next untitled document by title, across every extension", () => {
    expect(nextUntitledDocumentPath("/boards", ["/boards/Untitled.systemsketch"])).toBe("/boards/Untitled 2.bbox");
    expect(nextUntitledDocumentPath("/boards", [])).toBe("/boards/Untitled.bbox");
    expect(nextUntitledDocumentPath("/boards", ["/boards/Untitled.tldr", "/boards/Untitled 2.systemsketch"])).toBe("/boards/Untitled 3.bbox");
    expect(nextUntitledDocumentPath("/boards", ["/boards/Untitled.bbox"])).toBe("/boards/Untitled 2.bbox");
    expect(nextUntitledDocumentPath("/boards", [], ".systemsketch")).toBe("/boards/Untitled.systemsketch");
  });

  it("links a board as ?board=<path> on this page, dropping any other query", () => {
    const href = documentHref("/home/z/SystemSketch/Map.tldr", "http://127.0.0.1:4341/?fresh=1#x");
    const url = new URL(href, "http://127.0.0.1:4341/");
    expect(url.pathname).toBe("/");
    expect([...url.searchParams.keys()]).toEqual(["board"]);
    expect(url.searchParams.get("board")).toBe("/home/z/SystemSketch/Map.tldr");
  });

  it("bounds transient autosave retries", () => {
    expect([0, 1, 2, 3].map((attempt) => autosaveRetryDelay(attempt))).toEqual([1_000, 3_000, 8_000, null]);
    expect(autosaveRetryDelay(0, { conflict: true })).toBeNull();
    expect(autosaveRetryDelay(0, { force: true })).toBeNull();
  });

  it("debounces ordinary edits but never pushes a save past the burst deadline", () => {
    expect(autosaveSchedule(1_000, null, 600, 30_000)).toEqual({ pendingSince: 1_000, delayMs: 600 });
    expect(autosaveSchedule(30_500, 1_000, 600, 30_000)).toEqual({ pendingSince: 1_000, delayMs: 500 });
    expect(autosaveSchedule(31_100, 1_000, 600, 30_000)).toEqual({ pendingSince: 1_000, delayMs: 0 });
  });

  it("keeps a bounded, de-duplicated MRU list, and survives forgetting and renaming entries", () => {
    const storage = memoryStorage();
    rememberDocumentPath("/a.tldr", storage);
    rememberDocumentPath("/b.tldr", storage);
    rememberDocumentPath("/a.tldr", storage);
    expect(readRecentDocumentPaths(storage)).toEqual(["/a.tldr", "/b.tldr"]);
    for (let index = 0; index < 20; index += 1) rememberDocumentPath(`/n${index}.tldr`, storage);
    expect(readRecentDocumentPaths(storage)).toHaveLength(12);
    expect(forgetDocumentPath("/n19.tldr", storage)[0]).toBe("/n18.tldr");
    expect(replaceRememberedDocumentPath("/n18.tldr", "/renamed.tldr", storage)[0]).toBe("/renamed.tldr");
    expect(readRecentDocumentPaths(storage)).not.toContain("/n18.tldr");
    expect(readRecentDocumentPaths(memoryStorage("{corrupt"))).toEqual([]);
    expect(readRecentDocumentPaths(memoryStorage('["/ok.tldr", 3, null]'))).toEqual(["/ok.tldr"]);
  });
});

describe("in-app file browser", () => {
  const listing = {
    directories: [{ name: "Robotics", path: "/home/z/SystemSketch/Robotics" }],
    documents: [
      { name: "Arm.tldr", title: "Arm", path: "/home/z/SystemSketch/Arm.tldr", mtime: 10, size: 240 },
      { name: "Gripper.tldr", title: "Gripper", path: "/home/z/SystemSketch/Gripper.tldr", mtime: 20, size: 120 },
    ],
  };

  it("reports each document type, from the host or from the suffix", () => {
    const rows = browserRows(
      {
        directories: [{ name: "Robotics", path: "/home/z/SystemSketch/Robotics" }],
        documents: [
          { name: "New.systemsketch", title: "New", path: "/home/z/SystemSketch/New.systemsketch", mtime: 1, size: 42, kind: "systemsketch" as const },
          { name: "Legacy.tldr", title: "Legacy", path: "/home/z/SystemSketch/Legacy.tldr", mtime: 2, size: 64 },
        ],
      },
      "",
    );
    expect(rows.map((row) => row.encoding)).toEqual([null, "tldraw", "systemsketch"]);
  });

  it("lists folders before documents and filters both", () => {
    expect(browserRows(listing, "").map((row) => row.title)).toEqual(["Robotics", "Arm", "Gripper"]);
    expect(browserRows(listing, "rob").map((row) => row.kind)).toEqual(["folder"]);
    expect(browserRows(listing, "grip").map((row) => row.title)).toEqual(["Gripper"]);
    expect(browserRows(listing, "zzz")).toEqual([]);
    expect(browserRows(null, "")).toEqual([]);
  });

  it("puts the most recently modified documents first without displacing folders", () => {
    expect(browserRows(listing, "", "modified").map((row) => row.title)).toEqual(["Robotics", "Gripper", "Arm"]);
    expect(
      browserRows(
        {
          directories: [],
          documents: [
            { name: "Zeta.tldr", title: "Zeta", path: "/Zeta.tldr", mtime: 20, size: 1 },
            { name: "Alpha.tldr", title: "Alpha", path: "/Alpha.tldr", mtime: 20, size: 1 },
          ],
        },
        "",
        "modified",
      ).map((row) => row.title),
    ).toEqual(["Alpha", "Zeta"]);
  });

  it("uses familiar column-header directions for name, size, and modification time", () => {
    expect(browserRows(listing, "", "name", "descending").map((row) => row.title)).toEqual(["Robotics", "Gripper", "Arm"]);
    expect(browserRows(listing, "", "size").map((row) => row.title)).toEqual(["Robotics", "Gripper", "Arm"]);
    expect(browserRows(listing, "", "size", "descending").map((row) => row.title)).toEqual(["Robotics", "Arm", "Gripper"]);
    expect(browserRows(listing, "", "modified", "ascending").map((row) => row.title)).toEqual(["Robotics", "Arm", "Gripper"]);
  });

  it("moves the arrow-key selection and clamps at both ends", () => {
    const rows = browserRows(listing, "");
    expect(moveBrowserSelection(rows, null, 1)).toBe(rows[0].path);
    expect(moveBrowserSelection(rows, null, -1)).toBe(rows[2].path);
    expect(moveBrowserSelection(rows, rows[0].path, 1)).toBe(rows[1].path);
    expect(moveBrowserSelection(rows, rows[0].path, -1)).toBe(rows[0].path);
    expect(moveBrowserSelection(rows, rows[2].path, 1)).toBe(rows[2].path);
    expect(moveBrowserSelection([], null, 1)).toBeNull();
  });

  it("re-aims a hidden selection at the first visible row", () => {
    const all = browserRows(listing, "");
    const filtered = browserRows(listing, "grip");
    expect(resolveBrowserSelection(all, null)).toBe("/home/z/SystemSketch/Arm.tldr");
    expect(resolveBrowserSelection(all, "/home/z/SystemSketch/Gripper.tldr")).toBe("/home/z/SystemSketch/Gripper.tldr");
    expect(resolveBrowserSelection(filtered, "/home/z/SystemSketch/Arm.tldr")).toBe("/home/z/SystemSketch/Gripper.tldr");
    expect(resolveBrowserSelection(browserRows(listing, "rob"), null)).toBe("/home/z/SystemSketch/Robotics");
    expect(resolveBrowserSelection([], "/gone.tldr")).toBeNull();
  });

  it("walks the breadcrumb from the workspace root down to the open folder", () => {
    expect(breadcrumbTrail("/home/z", "/home/z")).toEqual([{ label: "z", path: "/home/z" }]);
    expect(breadcrumbTrail("/home/z/SystemSketch/Robotics", "/home/z")).toEqual([
      { label: "z", path: "/home/z" },
      { label: "SystemSketch", path: "/home/z/SystemSketch" },
      { label: "Robotics", path: "/home/z/SystemSketch/Robotics" },
    ]);
    expect(breadcrumbTrail("/elsewhere/Boards", "/home/z")).toEqual([{ label: "Boards", path: "/elsewhere/Boards" }]);
  });

  it("formats sizes and modification days the way the old table did", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(5_018)).toBe("4.9 KB");
    expect(formatFileSize(12_288)).toBe("12 KB");
    expect(formatFileSize(13 * 1024 * 1024)).toBe("13 MB");
    const now = new Date(2026, 8, 19, 15, 0, 0).getTime();
    const seconds = (date: Date) => date.getTime() / 1000;
    expect(formatRelativeDay(seconds(new Date(2026, 8, 18, 12, 0, 0)), now)).toBe("Yesterday");
    expect(formatRelativeDay(seconds(new Date(2026, 8, 13, 12, 0, 0)), now)).toBe("6 days ago");
    expect(formatRelativeDay(seconds(new Date(2026, 8, 3, 12, 0, 0)), now)).toMatch(/Sep\s+3/);
    expect(formatRelativeDay(seconds(new Date(2026, 8, 19, 14, 5, 0)), now)).toMatch(/2:05/);
  });
});

describe("untitled reservations across windows", () => {
  it("stops a second window from claiming the same untitled name", () => {
    const storage = memoryStorage();
    const first = nextUntitledDocumentPath("/boards", []);
    claimUntitledPath(first, 1000, storage);
    const second = nextUntitledDocumentPath("/boards", readUntitledClaims(1000, storage));
    expect(first).toBe("/boards/Untitled.bbox");
    expect(second).toBe("/boards/Untitled 2.bbox");
  });

  it("reserves the title, so a claim blocks that name in either extension", () => {
    const storage = memoryStorage();
    claimUntitledPath("/boards/Untitled.systemsketch", 1000, storage);
    expect(nextUntitledDocumentPath("/boards", readUntitledClaims(1000, storage))).toBe("/boards/Untitled 2.bbox");
  });

  it("lets a stale reservation expire so names are never lost for good", () => {
    const storage = memoryStorage();
    claimUntitledPath("/boards/Untitled.tldr", 1000, storage);
    expect(readUntitledClaims(1000, storage)).toEqual(["/boards/Untitled.tldr"]);
    expect(readUntitledClaims(1000 + 13 * 60 * 60 * 1000, storage)).toEqual([]);
  });
});
