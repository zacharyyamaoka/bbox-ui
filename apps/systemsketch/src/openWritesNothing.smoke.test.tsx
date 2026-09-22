// src/openWritesNothing.smoke.test.tsx — opening a board is not an edit, and
// nothing a person does is ever mistaken for one of the app's own writes.
//
// Zach, 2026-09-22, on `?board=<tree>/apps/systemsketch/review/region-one-object.tldr`
// served by `vite`: "I am trying to view this. but the page keeps on
// reloading, what is going on?" The window autosaved the board it had just
// opened although nobody touched it: the load's own diff and the measurement
// write-backs after it (port anchors re-sighted in this viewer's fonts and
// pixel ratio, corner cards back on their slot) reached the autosave as a
// person's edits.
//
// The first fix (9df4918) taught the autosave to skip records the app itself
// had written, recognised by identity — and a Codex audit showed undo re-puts
// the exact original record, so deleting a loaded shape, letting that save,
// and pressing Ctrl+Z restored it on screen and NEVER on disk. That case is
// here, driven with the real keys, and it reopens the file to prove it.
//
// Every case opens a board through the REAL file host (a temp root) and
// reads the bytes on disk back, plus the count of writes the window sent.
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { Editor, TLShape, TLShapeId } from "tldraw";

import reviewBoard from "../review/region-one-object.tldr?raw";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation, setFileHostBaseUrl } from "./files/launchConfig";
import { AUTOSAVE_DEBOUNCE_MS } from "./files/session";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

const host = inject("fileHost");
const SETTINGS_KEY = "systemsketch.settings.v1";

let app: MountedApp | null = null;
let restores: (() => void)[] = [];

beforeEach(() => {
  expect(host.error, `the temp-root file host must be running for these tests:\n${host.error}`).toBe("");
  setFileHostBaseUrl(host.url);
  window.localStorage.removeItem(SETTINGS_KEY);
});

afterEach(() => {
  app?.unmount();
  app = null;
  for (const restore of restores.splice(0)) restore();
  window.localStorage.removeItem(SETTINGS_KEY);
  resetLaunchConfig();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Long past the debounce, and past many animation frames of measurement. */
const QUIET_MS = AUTOSAVE_DEBOUNCE_MS * 5;

const POSE = "shape:pose" as TLShapeId;

interface HostDocument {
  source: string | null;
  digest?: string;
}

interface BoardRecord {
  id: string;
  x?: number;
  y?: number;
  props?: { name?: string; anchors?: { x: number; y: number }[] };
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

function recordIds(source: string | null | undefined): string[] {
  if (!source) return [];
  return (JSON.parse(source) as { records: BoardRecord[] }).records.map((record) => record.id);
}

/** Poll the disk until `probe` holds — a save is asynchronous. */
async function onDisk(path: string, probe: (source: string | null) => boolean, what: string): Promise<string | null> {
  const deadline = performance.now() + 10_000;
  for (;;) {
    const { source } = await hostLoad(path);
    if (probe(source)) return source;
    if (performance.now() > deadline) throw new Error(`timed out — ${what}`);
    await sleep(80);
  }
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
  restores.push(() => {
    window.fetch = real;
  });
  return {
    get count() {
      return count;
    },
  };
}

async function openByBoardParam(path: string) {
  const location = memoryDocumentLocation({ initialBoard: path });
  setDocumentLocation(location);
  app = await mountApp();
  const editor = app.editor;
  // The For Loop, not Pose estimator: a reopen after a redone delete must not have it.
  await waitFor(() => editor.getShape("shape:loop" as TLShapeId), { what: "the review board loaded" });
  return { editor, location };
}

function reopen(path: string) {
  app?.unmount();
  app = null;
  return openByBoardParam(path);
}

/** The committed board as a screen that is NOT this one would have stored
 *  it: Pose estimator's port anchors 7px off what this viewer measures, and
 *  the For Loop's card pushed off its corner slot. */
function boardNeedingRepair(): string {
  const board = JSON.parse(reviewBoard) as { records: BoardRecord[] };
  for (const record of board.records) {
    if (record.id === POSE) for (const anchor of record.props?.anchors ?? []) anchor.x += 7;
    if (record.id === "shape:loop-corner") {
      record.x = 40;
      record.y = 30;
    }
  }
  return JSON.stringify(board);
}

function boardWithPoseNamed(name: string): string {
  const board = JSON.parse(reviewBoard) as { records: BoardRecord[] };
  for (const record of board.records) if (record.id === POSE && record.props) record.props.name = name;
  return JSON.stringify(board);
}

async function press(editor: Editor, keys: string) {
  editor.focus();
  await userEvent.keyboard(keys);
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
    const { editor } = await openByBoardParam(path);

    // The repairs really ran — otherwise "nothing was written" proves nothing.
    await waitFor(
      () => {
        const corner = editor.getShape("shape:loop-corner" as TLShapeId);
        return corner && corner.x === 0 && corner.y === 0;
      },
      { what: "the For Loop card back on its corner slot" },
    );
    await waitFor(
      () => {
        const pose = editor.getShape(POSE) as (TLShape & { props: { anchors: { x: number }[] } }) | undefined;
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
    editor.updateShape({ id: POSE, type: BLOCK_SHAPE_TYPE, props: { name: "Pose estimator (edited)" } } as never);
    const saved = await onDisk(path, (source) => !!source?.includes("Pose estimator (edited)"), "the real edit reached disk");
    expect(writes.count).toBeGreaterThanOrEqual(1);
    const corner = (JSON.parse(saved!) as { records: BoardRecord[] }).records.find((record) => record.id === "shape:loop-corner");
    expect({ x: corner?.x, y: corner?.y }, "the repaired corner rides along with the edit").toEqual({ x: 0, y: 0 });
  });
});

describe("undo and redo are a person's edits, always", () => {
  // THE case that killed 9df4918: undo re-puts the exact record the load
  // created, so a scheme that recognises the app's writes by what they look
  // like calls the restoration a load and never saves it.
  it("delete a loaded shape, let it save, Ctrl+Z: the restored shape is saved, and a reopen shows it", async () => {
    const path = `${host.workspace}/delete-undo.tldr`;
    await hostWrite(path, reviewBoard);
    const { editor } = await openByBoardParam(path);
    await sleep(QUIET_MS);

    editor.select(POSE);
    await press(editor, "{Delete}");
    await waitFor(() => !editor.getShape(POSE), { what: "Delete removed Pose estimator" });
    await onDisk(path, (source) => !recordIds(source).includes(POSE), "the deletion saved");

    await press(editor, "{Control>}z{/Control}");
    await waitFor(() => editor.getShape(POSE), { what: "Ctrl+Z restored Pose estimator on screen" });
    await onDisk(path, (source) => recordIds(source).includes(POSE), "the undo saved — the restored shape is on disk");

    const { editor: reopened } = await reopen(path);
    expect(reopened.getShape(POSE), "a reopen shows the restored shape").toBeTruthy();
  });

  it("redo after undo saves too", async () => {
    const path = `${host.workspace}/delete-undo-redo.tldr`;
    await hostWrite(path, reviewBoard);
    const { editor } = await openByBoardParam(path);
    await sleep(QUIET_MS);

    editor.select(POSE);
    await press(editor, "{Delete}");
    await onDisk(path, (source) => !recordIds(source).includes(POSE), "the deletion saved");
    await press(editor, "{Control>}z{/Control}");
    await onDisk(path, (source) => recordIds(source).includes(POSE), "the undo saved");

    await press(editor, "{Control>}{Shift>}z{/Shift}{/Control}");
    await waitFor(() => !editor.getShape(POSE), { what: "Ctrl+Shift+Z deleted Pose estimator again" });
    await onDisk(path, (source) => !recordIds(source).includes(POSE), "the redo saved");

    const { editor: reopened } = await reopen(path);
    expect(reopened.getShape(POSE), "a reopen shows the redone deletion").toBeUndefined();
  });

  // Opening used to dirty the board, and that hid a gap: an edit is marked
  // dirty by a listener tldraw runs a frame later, so an edit and File ▸ New
  // in the same frame looked clean and left without it. Both halves in one
  // synchronous task, so no frame can land between them.
  it("an edit made in the same frame as Ctrl+N is written before the window leaves", async () => {
    const path = `${host.workspace}/open-then-leave.tldr`;
    await hostWrite(path, reviewBoard);
    const { editor, location } = await openByBoardParam(path);
    await sleep(QUIET_MS);

    editor.updateShape({ id: POSE, type: BLOCK_SHAPE_TYPE, props: { name: "same-frame edit" } } as never);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true, cancelable: true }));

    await waitFor(() => location.assigned.length > 0, { what: "New navigated this window away" });
    expect((await hostLoad(path)).source, "the edit must be on disk when the window leaves").toContain("same-frame edit");
  });
});

/* ------------------------------------------------------------ native Open */

interface FakeHandle {
  name: string;
  content: string;
  lastModified: number;
  getFile(): Promise<{ name: string; lastModified: number; text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(): Promise<"granted">;
  requestPermission(): Promise<"granted">;
}

function fakeHandle(name: string, content: string): FakeHandle {
  const handle: FakeHandle = {
    name,
    content,
    lastModified: Date.now(),
    async getFile() {
      return { name: handle.name, lastModified: handle.lastModified, text: async () => handle.content };
    },
    async createWritable() {
      let buffer = "";
      return {
        async write(data: string) {
          buffer += data;
        },
        async close() {
          handle.content = buffer;
          handle.lastModified = Date.now();
        },
      };
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  };
  return handle;
}

/** `showOpenFilePicker` answering with each handle in turn. */
function stubOpenPicker(handles: FakeHandle[]) {
  const target = window as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "showOpenFilePicker");
  const previous = target.showOpenFilePicker;
  const queue = [...handles];
  target.showOpenFilePicker = async () => [queue.shift()];
  restores.push(() => {
    if (had) target.showOpenFilePicker = previous;
    else delete target.showOpenFilePicker;
  });
}

const poseName = (editor: Editor) => (editor.getShape(POSE)?.props as { name?: string } | undefined)?.name;
const statusTone = () => document.querySelector('[data-testid="ss-chrome-title"] [data-slot="chrome-bar-status-dot"]')?.getAttribute("data-tone") ?? null;

describe("native File ▸ Open never leaves the open file's edits behind", () => {
  beforeEach(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fileNavigation: "native", settingsPresentation: "dialog" }));
  });

  async function mountNativeOn(first: FakeHandle, second: FakeHandle): Promise<Editor> {
    stubOpenPicker([first, second]);
    setDocumentLocation(memoryDocumentLocation({ initialBoard: null }));
    app = await mountApp();
    const editor = app.editor;
    await press(editor, "{Control>}o{/Control}");
    await waitFor(() => poseName(editor) === "a-seed", { what: "file A open" });
    await sleep(QUIET_MS);
    return editor;
  }

  it("an edit inside the autosave debounce is written to A before B replaces it", async () => {
    const a = fakeHandle("a.tldr", boardWithPoseNamed("a-seed"));
    const b = fakeHandle("b.tldr", boardWithPoseNamed("b-seed"));
    const editor = await mountNativeOn(a, b);
    expect(a.content, "opening A wrote nothing to it").toBe(boardWithPoseNamed("a-seed"));

    editor.updateShape({ id: POSE, type: BLOCK_SHAPE_TYPE, props: { name: "a-edited" } } as never);
    const editedAt = performance.now();
    await press(editor, "{Control>}o{/Control}");
    await waitFor(() => poseName(editor) === "b-seed", { what: "file B open" });
    expect(performance.now() - editedAt, "B must open inside the debounce, or the timer proved this, not the wait").toBeLessThan(AUTOSAVE_DEBOUNCE_MS);
    expect(a.content, "A's edit must be on disk before the window left it").toContain("a-edited");
    await sleep(QUIET_MS);
    expect(b.content, "and nothing was written into B").toBe(boardWithPoseNamed("b-seed"));
  });

  it("a file whose save was REFUSED is not swapped away — Open stays on A", async () => {
    const a = fakeHandle("a.tldr", boardWithPoseNamed("a-seed"));
    const b = fakeHandle("b.tldr", boardWithPoseNamed("b-seed"));
    const editor = await mountNativeOn(a, b);

    // Another program rewrites A, so this window's next write is fenced off.
    a.content = boardWithPoseNamed("theirs");
    a.lastModified = Date.now() + 5_000;
    editor.updateShape({ id: POSE, type: BLOCK_SHAPE_TYPE, props: { name: "mine" } } as never);
    await waitFor(() => statusTone() === "error", { what: "the autosave refused by the fence", timeout: 10_000 });

    await press(editor, "{Control>}o{/Control}");
    await sleep(QUIET_MS);
    expect(poseName(editor), "the window must still hold the unwritten edit").toBe("mine");
    expect(a.content, "and the other writer's bytes are untouched").toBe(boardWithPoseNamed("theirs"));
  });
});
