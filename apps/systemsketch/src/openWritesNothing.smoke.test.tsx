// src/openWritesNothing.smoke.test.tsx — opening a board is not an edit.
//
// Zach, 2026-09-22, on `?board=<tree>/apps/systemsketch/review/region-one-object.tldr`
// served by `vite`: "I am trying to view this. but the page keeps on
// reloading, what is going on?" The window autosaved the board it had just
// opened, although nobody touched it — the load's own diff reached the
// session's store listener a frame after its guard had been released, and
// the measurement write-backs that follow a load (port anchors re-sighted in
// this viewer's fonts and pixel ratio, corner cards back on their slot) are
// `source: "user"` writes too. The file sits under Vite's root, so each save
// reloaded the page, which reopened the board, which saved it again.
//
// So these cases open a board through the REAL file host and assert the
// bytes on disk — and the count of writes sent — after the autosave debounce
// has long passed. The second case forces the repairs to actually run (its
// stored geometry is wrong for this viewer, as a board written on another
// screen is) and proves they did, so "nothing was written" cannot pass
// because nothing happened. Then one real edit, to prove autosave still
// works and carries the repairs with it.
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import type { Editor, TLShape } from "tldraw";

import reviewBoard from "../review/region-one-object.tldr?raw";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation, setFileHostBaseUrl } from "./files/launchConfig";
import { AUTOSAVE_DEBOUNCE_MS } from "./files/session";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

const host = inject("fileHost");

let app: MountedApp | null = null;
let restoreFetch: (() => void) | null = null;

beforeEach(() => {
  expect(host.error, `the temp-root file host must be running for these tests:\n${host.error}`).toBe("");
  setFileHostBaseUrl(host.url);
});

afterEach(() => {
  app?.unmount();
  app = null;
  restoreFetch?.();
  restoreFetch = null;
  resetLaunchConfig();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Long past the debounce, and past a few animation frames of measurement. */
const QUIET_MS = AUTOSAVE_DEBOUNCE_MS * 5;

interface HostDocument {
  source: string | null;
  digest?: string;
}

async function hostLoad(path: string): Promise<HostDocument> {
  const response = await fetch(`${host.url}/api/workspace/file?path=${encodeURIComponent(path)}`);
  return (await response.json()) as HostDocument;
}

async function hostWrite(path: string, source: string): Promise<void> {
  const response = await fetch(`${host.url}/api/workspace/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, source, baseDigest: null, force: true }),
  });
  expect(response.status).toBe(200);
}

/** Count every write the window sends to the file host from now on. */
function countFileWrites(): { readonly count: number } {
  const real = window.fetch.bind(window);
  let count = 0;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST" && url.includes("/api/workspace/file")) count += 1;
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
  restoreFetch = () => {
    window.fetch = real;
  };
  return {
    get count() {
      return count;
    },
  };
}

async function openByBoardParam(path: string): Promise<Editor> {
  setDocumentLocation(memoryDocumentLocation({ initialBoard: path }));
  app = await mountApp();
  const editor = app.editor;
  await waitFor(() => editor.getShape("shape:pose" as TLShape["id"]), { what: "the review board loaded" });
  return editor;
}

interface BoardRecord {
  id: string;
  x?: number;
  y?: number;
  props?: { anchors?: { x: number; y: number }[] };
}

/** The committed board as a screen that is NOT this one would have stored
 *  it: Pose estimator's port anchors 7px off what this viewer measures, and
 *  the For Loop's card pushed off its corner slot. Which repair puts the
 *  card back is not pinned here: measured 2026-09-22, the card's own
 *  measurement write lands first and the store's before-change pin
 *  (`cornerBlock.ts`'s `pinnedCorner`) moves it inside that repair, so the
 *  corner sweep finds nothing left to do — reverting the sweep's `runRepair`
 *  alone does NOT turn this case red. */
function boardNeedingRepair(): string {
  const board = JSON.parse(reviewBoard) as { records: BoardRecord[] };
  for (const record of board.records) {
    if (record.id === "shape:pose") for (const anchor of record.props?.anchors ?? []) anchor.x += 7;
    if (record.id === "shape:loop-corner") {
      record.x = 40;
      record.y = 30;
    }
  }
  return JSON.stringify(board);
}

describe("opening a ?board= file writes nothing until someone edits it", () => {
  it("the committed review board: opened and left alone, its bytes on disk are unchanged", async () => {
    const path = `${host.workspace}/open-untouched.tldr`;
    await hostWrite(path, reviewBoard);
    const before = await hostLoad(path);

    const writes = countFileWrites();
    await openByBoardParam(path);
    await sleep(QUIET_MS);

    expect(writes.count, "opening a board must not send a single write").toBe(0);
    const after = await hostLoad(path);
    expect(after.digest, "the file's revision must not move").toBe(before.digest);
    expect(after.source, "the file's bytes must not move").toBe(before.source);
  });

  it("a board whose stored geometry this viewer repairs: the repairs run, nothing is written — and the first real edit saves both", async () => {
    const path = `${host.workspace}/open-repaired.tldr`;
    await hostWrite(path, boardNeedingRepair());
    const before = await hostLoad(path);

    const writes = countFileWrites();
    const editor = await openByBoardParam(path);

    // The repairs really ran — otherwise "nothing was written" proves nothing.
    await waitFor(
      () => {
        const corner = editor.getShape("shape:loop-corner" as TLShape["id"]);
        return corner && corner.x === 0 && corner.y === 0;
      },
      { what: "the corner sweep put the For Loop card back on its slot" },
    );
    await waitFor(
      () => {
        const pose = editor.getShape("shape:pose" as TLShape["id"]) as (TLShape & { props: { anchors: { x: number }[] } }) | undefined;
        return pose && pose.props.anchors[0] && Math.abs(pose.props.anchors[0].x - (-0.08769550224656086 + 7)) > 3;
      },
      { what: "the measurement pass re-sighted Pose estimator's anchors" },
    );
    await sleep(QUIET_MS);

    expect(writes.count, "repairs are not edits: opening must not send a single write").toBe(0);
    const untouched = await hostLoad(path);
    expect(untouched.digest).toBe(before.digest);
    expect(untouched.source, "the file's bytes must not move").toBe(before.source);

    // One real edit — and autosave still works, carrying the repairs along.
    editor.updateShape({ id: "shape:pose" as TLShape["id"], type: BLOCK_SHAPE_TYPE, props: { name: "Pose estimator (edited)" } } as never);
    let saved: HostDocument | null = null;
    const deadline = performance.now() + 10_000;
    while (!saved?.source?.includes("Pose estimator (edited)")) {
      expect(performance.now(), "the real edit must reach disk").toBeLessThan(deadline);
      await sleep(100);
      saved = await hostLoad(path);
    }
    expect(writes.count).toBeGreaterThanOrEqual(1);
    const records = (JSON.parse(saved.source!) as { records: BoardRecord[] }).records;
    const corner = records.find((record) => record.id === "shape:loop-corner");
    expect({ x: corner?.x, y: corner?.y }, "the repaired corner rides along with the edit").toEqual({ x: 0, y: 0 });
  });

  // WHY this case exists: before the fix, OPENING dirtied the board, and that
  // hid a gap — the listener that marks an edit dirty runs a frame later, so
  // an edit and a File ▸ New in the same frame looked clean and navigated
  // away without it. Now that opening writes nothing, the gap is real unless
  // leaving flushes the store first. Both halves in one synchronous task, so
  // no frame can land between them (files.smoke's own P1-4 case only hits
  // this under full-suite load).
  it("an edit made in the same frame as leaving is still written before the window leaves", async () => {
    const path = `${host.workspace}/open-then-leave.tldr`;
    await hostWrite(path, reviewBoard);
    const location = memoryDocumentLocation({ initialBoard: path });
    setDocumentLocation(location);
    app = await mountApp();
    const editor = app.editor;
    await waitFor(() => editor.getShape("shape:pose" as TLShape["id"]), { what: "the review board loaded" });
    await sleep(QUIET_MS);

    editor.updateShape({ id: "shape:pose" as TLShape["id"], type: BLOCK_SHAPE_TYPE, props: { name: "same-frame edit" } } as never);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true, cancelable: true }));

    await waitFor(() => location.assigned.length > 0, { what: "New navigated this window away" });
    expect((await hostLoad(path)).source, "the edit must be on disk when the window leaves").toContain("same-frame edit");
  });
});
